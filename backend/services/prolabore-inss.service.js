/**
 * Belinha Finance - Serviço de Contabilização de Pró-labore e INSS Dinâmico
 * 
 * Regra de Negócio:
 * 1. Soma diária das provisões de Pró-labore apuradas nos fechamentos de caixa do mês selecionado.
 * 2. Divisão proporcional entre os sócios (Sócio 1 - Edevaldo e Sócio 2 - Nayane, padrão 50% / 50%).
 * 3. Cálculo de INSS à alíquota de 11% sobre o pró-labore de cada sócio, respeitando o piso
 *    do Salário Mínimo e o teto do RGPS/INSS vigente.
 * 4. O valor total resultante substitui dinamicamente o valor da conta fixa "INSS Pró-labore"
 *    no Contas a Pagar do mês subsequente (M+1), com vencimento no dia 20.
 */

const PISO_SALARIO_MINIMO = 1518.00;
const TETO_INSS = 8157.41;
const ALIQUOTA_INSS = 0.11;

/**
 * Garante que a conta fixa 'INSS Pró-labore' esteja cadastrada e ativa no banco de dados.
 */
function garantirContaFixaInss(db) {
  try {
    const existing = db.prepare("SELECT * FROM fixed_accounts WHERE LOWER(name) = 'inss pró-labore' OR LOWER(name) = 'inss prolabore' OR id = 'fa_inss_prolabore'").get();
    if (!existing) {
      db.prepare(`
        INSERT INTO fixed_accounts (id, name, value, dueDay, isActive)
        VALUES ('fa_inss_prolabore', 'INSS Pró-labore', 0, 20, 1)
      `).run();
      console.log('✅ [INSS Pró-labore] Conta fixa criada com sucesso (vencimento dia 20).');
    } else if (existing.isActive !== 1) {
      db.prepare("UPDATE fixed_accounts SET isActive = 1, dueDay = 20 WHERE id = ?").run(existing.id);
    }
  } catch (err) {
    console.warn('[INSS Pró-labore] Aviso ao verificar conta fixa:', err.message);
  }
}

/**
 * Calcula o resumo de Pró-labore e apuração de INSS para a competência informada
 * @param {object} db Instância do Better-SQLite3
 * @param {string} competencia 'YYYY-MM'
 * @returns {object} Resumo com pró-labore acumulado, cálculo por sócio e INSS apurado
 */
function calcularProlaboreEInss(db, competencia) {
  if (!competencia || !competencia.includes('-')) {
    const d = new Date();
    competencia = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  const [anoStr, mesStr] = competencia.split('-');
  const ano = parseInt(anoStr, 10);
  const mes = parseInt(mesStr, 10);

  // Calcula competência subsequente (M+1)
  let proxAno = ano;
  let proxMes = mes + 1;
  if (proxMes > 12) {
    proxMes = 1;
    proxAno++;
  }
  const mesSubsequente = `${proxAno}-${String(proxMes).padStart(2, '0')}`;

  // Busca fechamentos de caixa da competência
  const closings = db.prepare(`
    SELECT date, totalSales, totalCrediario 
    FROM cash_closings 
    WHERE (date LIKE ? OR strftime('%Y-%m', date) = ?)
    ORDER BY date ASC
  `).all(`${competencia}%`, competencia);

  // Busca médias e porcentagens de pró-labore personalizadas se existirem
  let prolaborePct = 0.12;
  let socio1Pct = 0.06;
  let socio2Pct = 0.06;

  try {
    const sysRow = db.prepare("SELECT value FROM system_settings WHERE key = 'pricing_custom_averages'").get();
    if (sysRow && sysRow.value) {
      const avg = JSON.parse(sysRow.value);
      if (avg && avg.simpleAverages && avg.simpleAverages.proLaboreTotalPct > 0) {
        prolaborePct = avg.simpleAverages.proLaboreTotalPct / 100;
        socio1Pct = (avg.simpleAverages.proLabore1Pct || avg.simpleAverages.proLaboreTotalPct / 2) / 100;
        socio2Pct = (avg.simpleAverages.proLabore2Pct || avg.simpleAverages.proLaboreTotalPct / 2) / 100;
      }
    }
  } catch (e) {}

  let totalSales = 0;
  let totalNetSales = 0;
  let totalCrediario = 0;
  let totalProlabore = 0;
  let socio1Prolabore = 0;
  let socio2Prolabore = 0;
  const diasFechados = [];

  for (const c of closings) {
    const gross = Number(c.totalSales) || 0;
    const cred = Number(c.totalCrediario) || 0;
    const net = Math.max(0, gross - cred);

    totalSales += gross;
    totalCrediario += cred;
    totalNetSales += net;

    const pDia = net * prolaborePct;
    const s1Dia = net * socio1Pct;
    const s2Dia = net * socio2Pct;

    totalProlabore += pDia;
    socio1Prolabore += s1Dia;
    socio2Prolabore += s2Dia;

    diasFechados.push({
      date: c.date ? c.date.split('T')[0] : '',
      sales: net,
      prolabore: Math.round(pDia * 100) / 100,
      socio1: Math.round(s1Dia * 100) / 100,
      socio2: Math.round(s2Dia * 100) / 100
    });
  }

  // Arredonda valores acumulados
  totalSales = Math.round(totalSales * 100) / 100;
  totalNetSales = Math.round(totalNetSales * 100) / 100;
  totalProlabore = Math.round(totalProlabore * 100) / 100;
  socio1Prolabore = Math.round(socio1Prolabore * 100) / 100;
  socio2Prolabore = Math.round(socio2Prolabore * 100) / 100;

  // Cálculo de INSS para cada sócio:
  // Se houver pró-labore provisionado, aplica a alíquota de 11% limitada entre o piso e o teto
  const calcularInssSocio = (valorProlabore) => {
    if (valorProlabore <= 0) {
      return { base: 0, inss: 0, limitadoAoPiso: false, limitadoAoTeto: false };
    }
    let base = valorProlabore;
    let limitadoAoPiso = false;
    let limitadoAoTeto = false;

    if (base < PISO_SALARIO_MINIMO) {
      base = PISO_SALARIO_MINIMO;
      limitadoAoPiso = true;
    } else if (base > TETO_INSS) {
      base = TETO_INSS;
      limitadoAoTeto = true;
    }

    const inss = Math.round(base * ALIQUOTA_INSS * 100) / 100;
    return {
      base: Math.round(base * 100) / 100,
      inss,
      limitadoAoPiso,
      limitadoAoTeto
    };
  };

  const calcS1 = calcularInssSocio(socio1Prolabore);
  const calcS2 = calcularInssSocio(socio2Prolabore);
  const totalInss = Math.round((calcS1.inss + calcS2.inss) * 100) / 100;

  // Verifica se a competência consultada é o mês atual (em andamento)
  const now = new Date();
  const currentComp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const emAndamento = (competencia === currentComp);

  return {
    competencia,
    mesSubsequente,
    dataVencimentoInss: `${mesSubsequente}-20`,
    diasApurados: diasFechados.length,
    emAndamento,
    totalSales,
    totalNetSales,
    totalCrediario,
    taxasAplicadas: {
      prolaborePct: Math.round(prolaborePct * 10000) / 100,
      socio1Pct: Math.round(socio1Pct * 10000) / 100,
      socio2Pct: Math.round(socio2Pct * 10000) / 100
    },
    prolabore: {
      total: totalProlabore,
      socio1: {
        nome: 'Edevaldo Cruz',
        valor: socio1Prolabore,
        baseCalculoInss: calcS1.base,
        inss: calcS1.inss,
        limitadoAoPiso: calcS1.limitadoAoPiso,
        limitadoAoTeto: calcS1.limitadoAoTeto
      },
      socio2: {
        nome: 'Nayane Cruz',
        valor: socio2Prolabore,
        baseCalculoInss: calcS2.base,
        inss: calcS2.inss,
        limitadoAoPiso: calcS2.limitadoAoPiso,
        limitadoAoTeto: calcS2.limitadoAoTeto
      }
    },
    inss: {
      aliquota: 11,
      pisoSalarioMinimo: PISO_SALARIO_MINIMO,
      tetoInss: TETO_INSS,
      totalGuia: totalInss
    },
    diasFechados
  };
}

/**
 * Obtém o valor apurado de INSS para o mês de pagamento especificado.
 * O mês de pagamento (mesPagamento = YYYY-MM) busca a apuração do mês anterior (M-1).
 */
function obterInssDinamicoParaMesPagamento(db, mesPagamento) {
  if (!mesPagamento || !mesPagamento.includes('-')) {
    const d = new Date();
    mesPagamento = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  const [anoStr, mesStr] = mesPagamento.split('-');
  let anoAnt = parseInt(anoStr, 10);
  let mesAnt = parseInt(mesStr, 10) - 1;
  if (mesAnt < 1) {
    mesAnt = 12;
    anoAnt--;
  }
  const mesAnterior = `${anoAnt}-${String(mesAnt).padStart(2, '0')}`;

  const apuracao = calcularProlaboreEInss(db, mesAnterior);

  return {
    mesPagamento,
    mesApurado: mesAnterior,
    valorInss: apuracao.inss.totalGuia,
    emAndamento: apuracao.emAndamento,
    prolaboreTotalApurado: apuracao.prolabore.total,
    socio1Inss: apuracao.prolabore.socio1.inss,
    socio2Inss: apuracao.prolabore.socio2.inss,
    detalhes: apuracao
  };
}

module.exports = {
  PISO_SALARIO_MINIMO,
  TETO_INSS,
  ALIQUOTA_INSS,
  garantirContaFixaInss,
  calcularProlaboreEInss,
  obterInssDinamicoParaMesPagamento
};
