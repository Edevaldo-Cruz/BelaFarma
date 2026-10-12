import { Boleto, MonthlyLimit } from './types';

export const formatDateInBrazil = (dateString: string): string => {
  if (!dateString) return '';
  // Se a string vier como '2024-05-20', dividimos manualmente para evitar conversão de fuso
  if (dateString.includes('T')) {
      // Se vier com Time, usamos UTC para evitar mudança de dia
      const date = new Date(dateString);
      return date.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
  } else {
      // Se vier 'YYYY-MM-DD', forçamos a interpretação correta
      const [year, month, day] = dateString.split('-').map(Number);
      // Criamos a data usando Date.UTC para garantir que seja interpretada como UTC meia-noite
      // E exibimos usando UTC para não alterar
      const date = new Date(Date.UTC(year, month - 1, day));
      return date.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
  }
};

/**
 * Converte com segurança uma data de fechamento ou timestamp ISO para a chave local 'YYYY-MM-DD',
 * respeitando o fuso horário local (evita que fechamentos noturnos após as 21h em Brasília rolem para o dia seguinte em UTC).
 */
export const getLocalDateKey = (rawDate: string): string => {
  if (!rawDate) return '';
  if (rawDate.length === 10 && !rawDate.includes('T')) return rawDate;
  const d = new Date(rawDate);
  if (isNaN(d.getTime())) return rawDate.split('T')[0];
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export const formatLocalDatePtBR = (rawDate: string): string => {
  if (!rawDate) return '';
  const key = getLocalDateKey(rawDate);
  const parts = key.split('-');
  if (parts.length !== 3) return rawDate;
  const [y, m, d] = parts;
  return `${d}/${m}/${y}`;
};

export const getDayFromDate = (dateString: string): number => {
    if (!dateString) return 0;
    if (dateString.includes('T')) {
        const date = new Date(dateString);
        // Usar UTC para extrair o dia correto
        return date.getUTCDate();
    } else {
        const parts = dateString.split('-');
        return parseInt(parts[2], 10);
    }
};

export interface FeatureUsageLocalEntry {
  featureId: string;
  usageCount: number;
  lastUsedAt: string | null;
}

export interface FeatureAuditLocalStore {
  monitoringStartedAt: string;
  features: Record<string, FeatureUsageLocalEntry>;
  uninstalledFeatures: string[];
  whitelistedUntil: Record<string, string>;
}

const AUDIT_STORAGE_KEY = 'belinha_feature_audit_v1';

export const getLocalFeatureAuditStore = (): FeatureAuditLocalStore => {
  try {
    const raw = localStorage.getItem(AUDIT_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.monitoringStartedAt && parsed.features) {
        return {
          monitoringStartedAt: parsed.monitoringStartedAt,
          features: parsed.features || {},
          uninstalledFeatures: Array.isArray(parsed.uninstalledFeatures) ? parsed.uninstalledFeatures : [],
          whitelistedUntil: parsed.whitelistedUntil || {}
        };
      }
    }
  } catch (e) {}
  const initial: FeatureAuditLocalStore = {
    monitoringStartedAt: new Date().toISOString(),
    features: {},
    uninstalledFeatures: [],
    whitelistedUntil: {}
  };
  try {
    localStorage.setItem(AUDIT_STORAGE_KEY, JSON.stringify(initial));
  } catch (e) {}
  return initial;
};

export const trackViewUsage = (view: string, userName?: string): void => {
  try {
    // Mantém compatibilidade com a chave legada
    const statsStr = localStorage.getItem('belinha_usage_stats') || '{}';
    const stats = JSON.parse(statsStr);
    stats[view] = (stats[view] || 0) + 1;
    localStorage.setItem('belinha_usage_stats', JSON.stringify(stats));

    // Novo motor de auditoria de 15 dias (Local + Backend SQLite)
    const nowIso = new Date().toISOString();
    const store = getLocalFeatureAuditStore();
    const current = store.features[view] || { featureId: view, usageCount: 0, lastUsedAt: null };
    store.features[view] = {
      featureId: view,
      usageCount: (current.usageCount || 0) + 1,
      lastUsedAt: nowIso
    };
    localStorage.setItem(AUDIT_STORAGE_KEY, JSON.stringify(store));

    // Sincroniza de forma assíncrona com o servidor SQLite da farmácia
    let resolvedUser = userName;
    if (!resolvedUser) {
      try {
        const uStr = localStorage.getItem('belinha_session_user');
        if (uStr) resolvedUser = JSON.parse(uStr)?.name;
      } catch (e) {}
    }

    fetch('/api/system/feature-audit/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ featureId: view, userName: resolvedUser || 'Operador' })
    }).catch(() => {});
  } catch (e) {
    console.error('Erro ao salvar estatísticas de uso:', e);
  }
};

// ─── Interfaces de Orçamento Semanal ────────────────────────────────────────

export interface WeekPeriod {
  weekIndex: number;
  startDay: number;
  endDay: number;
  startDate: Date;
  endDate: Date;
  /** Limite base da semana (limite mensal / número de semanas) */
  limit: number;
  /** Total gasto nessa semana */
  spent: number;
  /** Disponível real (já descontando excesso propagado de semanas anteriores).
   *  Pode ser negativo se houver estouro. */
  available: number;
  status: 'safe' | 'warning' | 'danger' | 'no-budget';
}

export interface MonthBudgetStats {
  month: number; // 1-indexed (1-12)
  year: number;
  limit: number;
  weeks: WeekPeriod[];
  totalSpent: number;
  /** Excesso a ser propagado para o primeiro semana do próximo mês */
  excessToNextMonth: number;
}

// ─── Cálculo das Semanas Civis do Mês ───────────────────────────────────────

/**
 * Retorna os intervalos de semanas civis (Dom–Sáb) de um mês.
 * Se o mês começar no meio de uma semana, a 1ª semana vai do dia 1 ao sábado mais próximo.
 * A última semana vai do domingo até o último dia do mês (mesmo que não seja sábado).
 */
export function getMonthWeeks(
  year: number,
  monthIndex: number // 0-indexed (0-11)
): Omit<WeekPeriod, 'limit' | 'spent' | 'available' | 'status'>[] {
  const weeks: Omit<WeekPeriod, 'limit' | 'spent' | 'available' | 'status'>[] = [];
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();

  let currentWeekStart = 1;
  let weekIndex = 0;

  for (let day = 1; day <= lastDay; day++) {
    const date = new Date(year, monthIndex, day);
    const dayOfWeek = date.getDay(); // 0 = Domingo, 6 = Sábado

    if (dayOfWeek === 6 || day === lastDay) {
      weeks.push({
        weekIndex,
        startDay: currentWeekStart,
        endDay: day,
        startDate: new Date(year, monthIndex, currentWeekStart, 0, 0, 0),
        endDate: new Date(year, monthIndex, day, 23, 59, 59),
      });
      weekIndex++;
      currentWeekStart = day + 1;
    }
  }

  return weeks;
}

// ─── Cascata de Orçamentos Semanais ─────────────────────────────────────────

/**
 * Calcula o orçamento semanal de cada semana de cada mês em cascata.
 *
 * Regras:
 * - O limite mensal é dividido igualmente entre as semanas civis do mês.
 * - Se uma semana gastar acima do seu limite ajustado, o excesso é descontado
 *   do limite da semana seguinte.
 * - Sobras de orçamento (saldo positivo) NÃO se acumulam — elas expiram.
 * - O excesso da última semana do mês é propagado para a primeira semana do
 *   mês seguinte.
 */
export function calculateWeeklyBudgetsCascade(
  boletos: Boleto[],
  monthlyLimits: MonthlyLimit[],
  startYear: number,
  endYear: number,
  endMonth: number // 0-indexed (0-11)
): Record<string, MonthBudgetStats> {
  const results: Record<string, MonthBudgetStats> = {};

  let excessFromPreviousMonth = 0;

  for (let y = startYear; y <= endYear; y++) {
    const mEnd = y === endYear ? endMonth : 11;

    for (let m = 0; m <= mEnd; m++) {
      const monthNumber = m + 1; // 1-indexed

      // Limite mensal cadastrado
      const limitObj = monthlyLimits.find(l => l.month === monthNumber && l.year === y);
      const monthlyLimit = limitObj ? limitObj.limit : 0;

      // Semanas civis do mês
      const rawWeeks = getMonthWeeks(y, m);
      const N = rawWeeks.length;

      // Limite semanal base (divisão uniforme do limite mensal)
      const weeklyLimitBase = monthlyLimit > 0 && N > 0 ? monthlyLimit / N : 0;

      const weeks: WeekPeriod[] = [];
      let totalMonthSpent = 0;
      
      // REGRA: No início do mês 07 (Julho), zera a dívida acumulada de meses anteriores
      if (monthNumber === 7) {
        excessFromPreviousMonth = 0;
      }
      
      let currentExcess = excessFromPreviousMonth;

      for (let i = 0; i < N; i++) {
        const rw = rawWeeks[i];

        // Filtra boletos com vencimento nessa semana
        const weekBoletos = boletos.filter(b => {
          if (!b || !b.due_date) return false;
          const cleanDate = String(b.due_date).split('T')[0];
          const parts = cleanDate.split('-');
          if (parts.length < 3) return false;
          const by = Number(parts[0]);
          const bm = Number(parts[1]);
          const bd = Number(parts[2]);
          // Usa meio-dia para evitar problemas de borda de fuso horário
          const boletoDate = new Date(by, bm - 1, bd, 12, 0, 0);
          if (isNaN(boletoDate.getTime())) return false;
          return boletoDate >= rw.startDate && boletoDate <= rw.endDate;
        });

        const spent = weekBoletos.reduce((sum, b) => sum + (b.value || 0), 0);

        totalMonthSpent += spent;

        // Limite ajustado: limite base menos o excesso herdado de semanas anteriores
        const excessInput = currentExcess;
        const adjustedLimit = weeklyLimitBase > 0 ? Math.max(0, weeklyLimitBase - excessInput) : 0;

        // Disponível: o que sobra depois de gastar nesta semana
        // (negativo = estouro)
        const available = weeklyLimitBase > 0 ? weeklyLimitBase - excessInput - spent : 0;

        // Status da semana
        let status: 'safe' | 'warning' | 'danger' | 'no-budget' = 'no-budget';
        if (weeklyLimitBase > 0) {
          if (adjustedLimit <= 0) {
            // Excesso herdado já esgotou o limite — qualquer gasto é perigo
            status = 'danger';
          } else {
            const pct = (spent / adjustedLimit) * 100;
            if (pct < 80) status = 'safe';
            else if (pct <= 100) status = 'warning';
            else status = 'danger';
          }
        }

        weeks.push({ ...rw, limit: weeklyLimitBase, spent, available, status });

        // Calcula o excesso para a próxima semana.
        // Sobras (saldo positivo) expiram — só propagamos o negativo.
        currentExcess = weeklyLimitBase > 0 ? Math.max(0, excessInput + spent - weeklyLimitBase) : 0;
      }

      // O excesso final vai para o próximo mês
      excessFromPreviousMonth = currentExcess;

      results[`${y}-${monthNumber}`] = {
        month: monthNumber,
        year: y,
        limit: monthlyLimit,
        weeks,
        totalSpent: totalMonthSpent,
        excessToNextMonth: excessFromPreviousMonth,
      };
    }
  }

  return results;
}

/**
 * Arredonda um valor numérico para cima garantindo que os centavos terminem
 * em 0, 5 ou 9 (ex: R$ 10,12 -> R$ 10,15 | R$ 10,16 -> R$ 10,19 | R$ 10,97 -> R$ 10,99).
 */
export function roundUpToAcceptedCents(val: number): number {
  if (isNaN(val) || val <= 0) return 0;
  let totalCents = Math.round(val * 100);
  let integerPart = Math.floor(totalCents / 100);
  let centsPart = totalCents % 100;

  let lastDigit = centsPart % 10;
  if (lastDigit === 0 || lastDigit === 5 || lastDigit === 9) {
    return totalCents / 100;
  }
  if (lastDigit > 0 && lastDigit < 5) {
    centsPart += (5 - lastDigit);
  } else if (lastDigit > 5 && lastDigit < 9) {
    centsPart += (9 - lastDigit);
  }

  return (integerPart * 100 + centsPart) / 100;
}

