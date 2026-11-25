export type TeamDayKey = 'Seg' | 'Ter' | 'Qua' | 'Qui' | 'Sex' | 'Sab' | 'Dom';
export type TeamMemberKey = 'Edevaldo' | 'Farmaceutica' | 'Contratado1' | 'Contratado2';
export type TeamRegime = 'clt_integral' | 'clt_parcial' | 'estagio';

export interface TeamShiftCell {
  off: boolean;
  start: string;
  end: string;
  lStart: string;
  lEnd: string;
}

export interface TeamMemberConfig {
  key: TeamMemberKey;
  name: string;
  roleLabel: string;
  isHired: boolean;
  isRT: boolean;
}

export type TeamWeekSchedule = Record<TeamMemberKey, Record<TeamDayKey, TeamShiftCell>>;

export interface TeamFinanceConfig {
  regime: TeamRegime;
  qtdContratados: 1 | 2;
  salarioBase: number;
  vtGastoTotal: number;
  outrosCustos: number;
  incluirMultaFgts: boolean;
  diasFolgaMes: number;
  custoEntregaFolga: number;
  faturamentoRef: number;
  tetoOrcamento: number;
}

export interface TeamScheduleConfig {
  presetId: string;
  weekAStartDate: string;
  roster: TeamMemberConfig[];
  weekA: TeamWeekSchedule;
  weekB: TeamWeekSchedule;
  finance: TeamFinanceConfig | null;
  meta?: {
    regime: TeamRegime;
    qtdContratados: 1 | 2;
  };
  updatedAt?: string;
  updatedBy?: string;
  isDefault?: boolean;
}

export interface TeamPreset {
  id: string;
  shortTitle: string;
  subtitle: string;
  label: string;
  finance: TeamFinanceConfig;
  weekA: TeamWeekSchedule;
  weekB: TeamWeekSchedule;
}

export interface TeamWeekAlert {
  level: 'ok' | 'warn' | 'danger';
  text: string;
}

export interface TeamWeekAnalysis {
  personHours: Record<TeamMemberKey, number>;
  gapSlots: number;
  rtDaysSegSex: number;
  alerts: TeamWeekAlert[];
}

export interface TeamFinanceBreakdown {
  qtd: number;
  sal: number;
  vtRaw: number;
  vtNetUnit: number;
  outrosUnit: number;
  fgtsUnit: number;
  decimoUnit: number;
  feriasUnit: number;
  fgtsProvUnit: number;
  multaUnit: number;
  entregasFolga: number;
  desembolsoEquipe: number;
  desembolsoTotal: number;
  provisaoTotal: number;
  custoTotalReal: number;
  pctFat: number;
  margemTeto: number;
  teto: number;
  isIntern: boolean;
}

export const TEAM_DAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'] as const;
export const TEAM_DAY_KEYS: TeamDayKey[] = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab', 'Dom'];

export const DEFAULT_ROSTER: TeamMemberConfig[] = [
  { key: 'Edevaldo', name: 'Edevaldo Cruz', roleLabel: 'Sócio · Gestão e Entregas', isHired: false, isRT: false },
  { key: 'Farmaceutica', name: 'Nayane (Farmacêutica RT)', roleLabel: 'Sócia · Assistência Farmacêutica', isHired: false, isRT: true },
  { key: 'Contratado1', name: 'Balconista / Caixa 1', roleLabel: 'Equipe Contratada', isHired: true, isRT: false },
  { key: 'Contratado2', name: 'Apoio / Estagiário 2', roleLabel: 'Equipe Contratada (Opcional)', isHired: true, isRT: false }
];

function createEmptyWeek(start = '14:00', end = '20:00'): Record<TeamDayKey, TeamShiftCell> {
  return {
    Seg: { off: true, start, end, lStart: '', lEnd: '' },
    Ter: { off: true, start, end, lStart: '', lEnd: '' },
    Qua: { off: true, start, end, lStart: '', lEnd: '' },
    Qui: { off: true, start, end, lStart: '', lEnd: '' },
    Sex: { off: true, start, end, lStart: '', lEnd: '' },
    Sab: { off: true, start, end, lStart: '', lEnd: '' },
    Dom: { off: true, start: '07:30', end: '13:00', lStart: '', lEnd: '' }
  };
}

function cloneData<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

export const TEAM_PRESETS: Record<string, TeamPreset> = {
  clt_44_seg_sab: {
    id: 'clt_44_seg_sab',
    shortTitle: '1. Recomendado: 1 CLT 44h',
    subtitle: '11:40–20:00 Seg–Sáb · Dom livre',
    label: 'Recomendado — 1 Balconista CLT 44h (11:40–20:00 Seg–Sáb)',
    finance: {
      regime: 'clt_integral',
      qtdContratados: 1,
      salarioBase: 1650,
      vtGastoTotal: 0,
      outrosCustos: 40,
      incluirMultaFgts: false,
      diasFolgaMes: 4,
      custoEntregaFolga: 45,
      faturamentoRef: 36000,
      tetoOrcamento: 2500
    },
    weekA: {
      Edevaldo: {
        Seg: { off: false, start: '07:30', end: '16:30', lStart: '12:30', lEnd: '13:30' },
        Ter: { off: true, start: '07:30', end: '16:30', lStart: '', lEnd: '' },
        Qua: { off: false, start: '10:30', end: '20:00', lStart: '13:30', lEnd: '14:30' },
        Qui: { off: false, start: '07:30', end: '16:30', lStart: '12:30', lEnd: '13:30' },
        Sex: { off: false, start: '10:30', end: '20:00', lStart: '13:30', lEnd: '14:30' },
        Sab: { off: false, start: '07:30', end: '20:00', lStart: '12:30', lEnd: '14:00' },
        Dom: { off: false, start: '07:30', end: '13:00', lStart: '', lEnd: '' }
      },
      Farmaceutica: {
        Seg: { off: false, start: '09:30', end: '20:00', lStart: '13:30', lEnd: '15:00' },
        Ter: { off: false, start: '07:30', end: '20:00', lStart: '12:30', lEnd: '14:00' },
        Qua: { off: false, start: '07:30', end: '17:00', lStart: '12:00', lEnd: '13:30' },
        Qui: { off: false, start: '09:30', end: '20:00', lStart: '13:30', lEnd: '15:00' },
        Sex: { off: false, start: '07:30', end: '17:00', lStart: '12:00', lEnd: '13:30' },
        Sab: { off: true, start: '07:30', end: '13:30', lStart: '', lEnd: '' },
        Dom: { off: true, start: '07:30', end: '13:00', lStart: '', lEnd: '' }
      },
      Contratado1: {
        Seg: { off: false, start: '11:40', end: '20:00', lStart: '15:00', lEnd: '16:00' },
        Ter: { off: false, start: '11:40', end: '20:00', lStart: '15:00', lEnd: '16:00' },
        Qua: { off: false, start: '11:40', end: '20:00', lStart: '15:00', lEnd: '16:00' },
        Qui: { off: false, start: '11:40', end: '20:00', lStart: '15:00', lEnd: '16:00' },
        Sex: { off: false, start: '11:40', end: '20:00', lStart: '15:00', lEnd: '16:00' },
        Sab: { off: false, start: '11:40', end: '20:00', lStart: '15:00', lEnd: '16:00' },
        Dom: { off: true, start: '07:30', end: '13:00', lStart: '', lEnd: '' }
      },
      Contratado2: createEmptyWeek()
    },
    weekB: {
      Edevaldo: {
        Seg: { off: false, start: '10:30', end: '20:00', lStart: '12:30', lEnd: '13:30' },
        Ter: { off: true, start: '07:30', end: '16:30', lStart: '', lEnd: '' },
        Qua: { off: false, start: '10:30', end: '20:00', lStart: '12:30', lEnd: '13:30' },
        Qui: { off: false, start: '10:30', end: '20:00', lStart: '13:30', lEnd: '14:30' },
        Sex: { off: false, start: '10:30', end: '20:00', lStart: '12:30', lEnd: '13:30' },
        Sab: { off: false, start: '07:30', end: '13:30', lStart: '', lEnd: '' },
        Dom: { off: true, start: '07:30', end: '13:00', lStart: '', lEnd: '' }
      },
      Farmaceutica: {
        Seg: { off: false, start: '07:30', end: '13:30', lStart: '', lEnd: '' },
        Ter: { off: false, start: '07:30', end: '20:00', lStart: '12:30', lEnd: '14:00' },
        Qua: { off: false, start: '07:30', end: '13:30', lStart: '', lEnd: '' },
        Qui: { off: false, start: '07:30', end: '15:30', lStart: '12:00', lEnd: '13:00' },
        Sex: { off: false, start: '07:30', end: '13:30', lStart: '', lEnd: '' },
        Sab: { off: false, start: '12:30', end: '20:00', lStart: '', lEnd: '' },
        Dom: { off: false, start: '07:30', end: '13:00', lStart: '', lEnd: '' }
      },
      Contratado1: {
        Seg: { off: false, start: '11:40', end: '20:00', lStart: '15:00', lEnd: '16:00' },
        Ter: { off: false, start: '11:40', end: '20:00', lStart: '15:00', lEnd: '16:00' },
        Qua: { off: false, start: '11:40', end: '20:00', lStart: '15:00', lEnd: '16:00' },
        Qui: { off: false, start: '11:40', end: '20:00', lStart: '15:00', lEnd: '16:00' },
        Sex: { off: false, start: '11:40', end: '20:00', lStart: '15:00', lEnd: '16:00' },
        Sab: { off: false, start: '11:40', end: '20:00', lStart: '15:00', lEnd: '16:00' },
        Dom: { off: true, start: '07:30', end: '13:00', lStart: '', lEnd: '' }
      },
      Contratado2: createEmptyWeek()
    }
  },
  clt_44_8h_sab4h: {
    id: 'clt_44_8h_sab4h',
    shortTitle: '2. Alternativa: 1 CLT (8h + 4h Sáb)',
    subtitle: '11:00–20:00 Seg–Sex + 12:00–16:00 Sáb',
    label: 'Alternativa — 1 CLT 44h (11:00–20:00 Seg–Sex + 12:00–16:00 Sáb)',
    finance: {
      regime: 'clt_integral',
      qtdContratados: 1,
      salarioBase: 1650,
      vtGastoTotal: 0,
      outrosCustos: 40,
      incluirMultaFgts: false,
      diasFolgaMes: 4,
      custoEntregaFolga: 45,
      faturamentoRef: 36000,
      tetoOrcamento: 2500
    },
    weekA: {
      Edevaldo: {
        Seg: { off: false, start: '07:30', end: '16:30', lStart: '12:30', lEnd: '13:30' },
        Ter: { off: true, start: '07:30', end: '16:30', lStart: '', lEnd: '' },
        Qua: { off: false, start: '10:30', end: '20:00', lStart: '13:30', lEnd: '14:30' },
        Qui: { off: false, start: '07:30', end: '16:30', lStart: '12:30', lEnd: '13:30' },
        Sex: { off: false, start: '10:30', end: '20:00', lStart: '13:30', lEnd: '14:30' },
        Sab: { off: false, start: '07:30', end: '20:00', lStart: '12:30', lEnd: '14:00' },
        Dom: { off: false, start: '07:30', end: '13:00', lStart: '', lEnd: '' }
      },
      Farmaceutica: {
        Seg: { off: false, start: '09:30', end: '20:00', lStart: '13:30', lEnd: '15:00' },
        Ter: { off: false, start: '07:30', end: '20:00', lStart: '12:30', lEnd: '14:00' },
        Qua: { off: false, start: '07:30', end: '17:00', lStart: '12:00', lEnd: '13:30' },
        Qui: { off: false, start: '09:30', end: '20:00', lStart: '13:30', lEnd: '15:00' },
        Sex: { off: false, start: '07:30', end: '17:00', lStart: '12:00', lEnd: '13:30' },
        Sab: { off: true, start: '07:30', end: '13:30', lStart: '', lEnd: '' },
        Dom: { off: true, start: '07:30', end: '13:00', lStart: '', lEnd: '' }
      },
      Contratado1: {
        Seg: { off: false, start: '11:00', end: '20:00', lStart: '15:00', lEnd: '16:00' },
        Ter: { off: false, start: '11:00', end: '20:00', lStart: '15:00', lEnd: '16:00' },
        Qua: { off: false, start: '11:00', end: '20:00', lStart: '15:00', lEnd: '16:00' },
        Qui: { off: false, start: '11:00', end: '20:00', lStart: '15:00', lEnd: '16:00' },
        Sex: { off: false, start: '11:00', end: '20:00', lStart: '15:00', lEnd: '16:00' },
        Sab: { off: false, start: '12:00', end: '16:00', lStart: '', lEnd: '' },
        Dom: { off: true, start: '07:30', end: '13:00', lStart: '', lEnd: '' }
      },
      Contratado2: createEmptyWeek()
    },
    weekB: {
      Edevaldo: {
        Seg: { off: false, start: '10:30', end: '20:00', lStart: '12:30', lEnd: '13:30' },
        Ter: { off: true, start: '07:30', end: '16:30', lStart: '', lEnd: '' },
        Qua: { off: false, start: '10:30', end: '20:00', lStart: '12:30', lEnd: '13:30' },
        Qui: { off: false, start: '10:30', end: '20:00', lStart: '13:30', lEnd: '14:30' },
        Sex: { off: false, start: '10:30', end: '20:00', lStart: '12:30', lEnd: '13:30' },
        Sab: { off: false, start: '07:30', end: '13:30', lStart: '', lEnd: '' },
        Dom: { off: true, start: '07:30', end: '13:00', lStart: '', lEnd: '' }
      },
      Farmaceutica: {
        Seg: { off: false, start: '07:30', end: '13:30', lStart: '', lEnd: '' },
        Ter: { off: false, start: '07:30', end: '20:00', lStart: '12:30', lEnd: '14:00' },
        Qua: { off: false, start: '07:30', end: '13:30', lStart: '', lEnd: '' },
        Qui: { off: false, start: '07:30', end: '15:30', lStart: '12:00', lEnd: '13:00' },
        Sex: { off: false, start: '07:30', end: '13:30', lStart: '', lEnd: '' },
        Sab: { off: false, start: '13:00', end: '20:00', lStart: '', lEnd: '' },
        Dom: { off: false, start: '07:30', end: '13:00', lStart: '', lEnd: '' }
      },
      Contratado1: {
        Seg: { off: false, start: '11:00', end: '20:00', lStart: '15:00', lEnd: '16:00' },
        Ter: { off: false, start: '11:00', end: '20:00', lStart: '15:00', lEnd: '16:00' },
        Qua: { off: false, start: '11:00', end: '20:00', lStart: '15:00', lEnd: '16:00' },
        Qui: { off: false, start: '11:00', end: '20:00', lStart: '15:00', lEnd: '16:00' },
        Sex: { off: false, start: '11:00', end: '20:00', lStart: '15:00', lEnd: '16:00' },
        Sab: { off: false, start: '12:00', end: '16:00', lStart: '', lEnd: '' },
        Dom: { off: true, start: '07:30', end: '13:00', lStart: '', lEnd: '' }
      },
      Contratado2: createEmptyWeek()
    }
  },
  estagio_30h: {
    id: 'estagio_30h',
    shortTitle: '3. Econômico: 1 Estagiário 30h',
    subtitle: '13:00–19:00 Seg–Sex · Sem FGTS/13º',
    label: 'Econômico — 1 Estagiário de Farmácia 30h (13:00–19:00 Seg–Sex)',
    finance: {
      regime: 'estagio',
      qtdContratados: 1,
      salarioBase: 1000,
      vtGastoTotal: 80,
      outrosCustos: 10,
      incluirMultaFgts: false,
      diasFolgaMes: 4,
      custoEntregaFolga: 45,
      faturamentoRef: 36000,
      tetoOrcamento: 2500
    },
    weekA: {
      Edevaldo: {
        Seg: { off: false, start: '07:30', end: '17:00', lStart: '13:00', lEnd: '14:30' },
        Ter: { off: true, start: '07:30', end: '17:00', lStart: '', lEnd: '' },
        Qua: { off: false, start: '10:30', end: '20:00', lStart: '13:30', lEnd: '15:00' },
        Qui: { off: false, start: '07:30', end: '17:00', lStart: '13:00', lEnd: '14:30' },
        Sex: { off: false, start: '10:30', end: '20:00', lStart: '13:30', lEnd: '15:00' },
        Sab: { off: false, start: '13:30', end: '20:00', lStart: '', lEnd: '' },
        Dom: { off: false, start: '07:30', end: '13:00', lStart: '', lEnd: '' }
      },
      Farmaceutica: {
        Seg: { off: false, start: '10:30', end: '20:00', lStart: '14:30', lEnd: '16:00' },
        Ter: { off: false, start: '07:30', end: '20:00', lStart: '13:00', lEnd: '14:30' },
        Qua: { off: false, start: '07:30', end: '19:00', lStart: '13:00', lEnd: '14:30' },
        Qui: { off: false, start: '10:30', end: '20:00', lStart: '14:30', lEnd: '16:00' },
        Sex: { off: false, start: '07:30', end: '19:00', lStart: '13:00', lEnd: '14:30' },
        Sab: { off: false, start: '07:30', end: '14:00', lStart: '', lEnd: '' },
        Dom: { off: true, start: '07:30', end: '13:00', lStart: '', lEnd: '' }
      },
      Contratado1: {
        Seg: { off: false, start: '13:00', end: '19:00', lStart: '', lEnd: '' },
        Ter: { off: false, start: '13:00', end: '19:00', lStart: '', lEnd: '' },
        Qua: { off: false, start: '13:00', end: '19:00', lStart: '', lEnd: '' },
        Qui: { off: false, start: '13:00', end: '19:00', lStart: '', lEnd: '' },
        Sex: { off: false, start: '13:00', end: '19:00', lStart: '', lEnd: '' },
        Sab: { off: true, start: '08:00', end: '14:00', lStart: '', lEnd: '' },
        Dom: { off: true, start: '07:30', end: '13:00', lStart: '', lEnd: '' }
      },
      Contratado2: createEmptyWeek()
    },
    weekB: {
      Edevaldo: {
        Seg: { off: false, start: '10:30', end: '20:00', lStart: '13:30', lEnd: '15:00' },
        Ter: { off: true, start: '07:30', end: '17:00', lStart: '', lEnd: '' },
        Qua: { off: false, start: '10:30', end: '20:00', lStart: '13:30', lEnd: '15:00' },
        Qui: { off: false, start: '10:30', end: '20:00', lStart: '13:30', lEnd: '15:00' },
        Sex: { off: false, start: '10:30', end: '20:00', lStart: '13:30', lEnd: '15:00' },
        Sab: { off: false, start: '07:30', end: '14:00', lStart: '', lEnd: '' },
        Dom: { off: true, start: '07:30', end: '13:00', lStart: '', lEnd: '' }
      },
      Farmaceutica: {
        Seg: { off: false, start: '07:30', end: '13:30', lStart: '', lEnd: '' },
        Ter: { off: false, start: '07:30', end: '20:00', lStart: '13:00', lEnd: '14:30' },
        Qua: { off: false, start: '07:30', end: '13:30', lStart: '', lEnd: '' },
        Qui: { off: false, start: '07:30', end: '15:30', lStart: '13:00', lEnd: '13:30' },
        Sex: { off: false, start: '07:30', end: '13:30', lStart: '', lEnd: '' },
        Sab: { off: false, start: '13:30', end: '20:00', lStart: '', lEnd: '' },
        Dom: { off: false, start: '07:30', end: '13:00', lStart: '', lEnd: '' }
      },
      Contratado1: {
        Seg: { off: false, start: '13:00', end: '19:00', lStart: '', lEnd: '' },
        Ter: { off: false, start: '13:00', end: '19:00', lStart: '', lEnd: '' },
        Qua: { off: false, start: '13:00', end: '19:00', lStart: '', lEnd: '' },
        Qui: { off: false, start: '13:00', end: '19:00', lStart: '', lEnd: '' },
        Sex: { off: false, start: '13:00', end: '19:00', lStart: '', lEnd: '' },
        Sab: { off: true, start: '08:00', end: '14:00', lStart: '', lEnd: '' },
        Dom: { off: true, start: '07:30', end: '13:00', lStart: '', lEnd: '' }
      },
      Contratado2: createEmptyWeek()
    }
  },
  dois_estagiarios: {
    id: 'dois_estagiarios',
    shortTitle: '4. Crescimento: 2 Estagiários',
    subtitle: 'Manhã 08–14h + Tarde 14–20h Seg–Sex',
    label: 'Crescimento — 2 Estagiários 30h + 30h (Manhã + Tarde Seg–Sex)',
    finance: {
      regime: 'estagio',
      qtdContratados: 2,
      salarioBase: 1000,
      vtGastoTotal: 80,
      outrosCustos: 10,
      incluirMultaFgts: false,
      diasFolgaMes: 4,
      custoEntregaFolga: 45,
      faturamentoRef: 36000,
      tetoOrcamento: 2500
    },
    weekA: {
      Edevaldo: {
        Seg: { off: false, start: '07:30', end: '17:00', lStart: '13:00', lEnd: '14:30' },
        Ter: { off: true, start: '07:30', end: '17:00', lStart: '', lEnd: '' },
        Qua: { off: false, start: '10:30', end: '20:00', lStart: '13:30', lEnd: '15:00' },
        Qui: { off: false, start: '07:30', end: '17:00', lStart: '13:00', lEnd: '14:30' },
        Sex: { off: false, start: '10:30', end: '20:00', lStart: '13:30', lEnd: '15:00' },
        Sab: { off: false, start: '13:30', end: '20:00', lStart: '', lEnd: '' },
        Dom: { off: false, start: '07:30', end: '13:00', lStart: '', lEnd: '' }
      },
      Farmaceutica: {
        Seg: { off: false, start: '10:30', end: '20:00', lStart: '14:30', lEnd: '16:00' },
        Ter: { off: false, start: '07:30', end: '20:00', lStart: '13:00', lEnd: '14:30' },
        Qua: { off: false, start: '07:30', end: '19:00', lStart: '13:00', lEnd: '14:30' },
        Qui: { off: false, start: '10:30', end: '20:00', lStart: '14:30', lEnd: '16:00' },
        Sex: { off: false, start: '07:30', end: '19:00', lStart: '13:00', lEnd: '14:30' },
        Sab: { off: false, start: '07:30', end: '14:00', lStart: '', lEnd: '' },
        Dom: { off: true, start: '07:30', end: '13:00', lStart: '', lEnd: '' }
      },
      Contratado1: {
        Seg: { off: false, start: '08:00', end: '14:00', lStart: '', lEnd: '' },
        Ter: { off: false, start: '08:00', end: '14:00', lStart: '', lEnd: '' },
        Qua: { off: false, start: '08:00', end: '14:00', lStart: '', lEnd: '' },
        Qui: { off: false, start: '08:00', end: '14:00', lStart: '', lEnd: '' },
        Sex: { off: false, start: '08:00', end: '14:00', lStart: '', lEnd: '' },
        Sab: { off: true, start: '08:00', end: '14:00', lStart: '', lEnd: '' },
        Dom: { off: true, start: '07:30', end: '13:00', lStart: '', lEnd: '' }
      },
      Contratado2: {
        Seg: { off: false, start: '14:00', end: '20:00', lStart: '', lEnd: '' },
        Ter: { off: false, start: '14:00', end: '20:00', lStart: '', lEnd: '' },
        Qua: { off: false, start: '14:00', end: '20:00', lStart: '', lEnd: '' },
        Qui: { off: false, start: '14:00', end: '20:00', lStart: '', lEnd: '' },
        Sex: { off: false, start: '14:00', end: '20:00', lStart: '', lEnd: '' },
        Sab: { off: true, start: '14:00', end: '20:00', lStart: '', lEnd: '' },
        Dom: { off: true, start: '07:30', end: '13:00', lStart: '', lEnd: '' }
      }
    },
    weekB: {
      Edevaldo: {
        Seg: { off: false, start: '10:30', end: '20:00', lStart: '13:30', lEnd: '15:00' },
        Ter: { off: true, start: '07:30', end: '17:00', lStart: '', lEnd: '' },
        Qua: { off: false, start: '10:30', end: '20:00', lStart: '13:30', lEnd: '15:00' },
        Qui: { off: false, start: '10:30', end: '20:00', lStart: '13:30', lEnd: '15:00' },
        Sex: { off: false, start: '10:30', end: '20:00', lStart: '13:30', lEnd: '15:00' },
        Sab: { off: false, start: '07:30', end: '14:00', lStart: '', lEnd: '' },
        Dom: { off: true, start: '07:30', end: '13:00', lStart: '', lEnd: '' }
      },
      Farmaceutica: {
        Seg: { off: false, start: '07:30', end: '13:30', lStart: '', lEnd: '' },
        Ter: { off: false, start: '07:30', end: '20:00', lStart: '13:00', lEnd: '14:30' },
        Qua: { off: false, start: '07:30', end: '13:30', lStart: '', lEnd: '' },
        Qui: { off: false, start: '07:30', end: '15:30', lStart: '13:00', lEnd: '13:30' },
        Sex: { off: false, start: '07:30', end: '13:30', lStart: '', lEnd: '' },
        Sab: { off: false, start: '13:30', end: '20:00', lStart: '', lEnd: '' },
        Dom: { off: false, start: '07:30', end: '13:00', lStart: '', lEnd: '' }
      },
      Contratado1: {
        Seg: { off: false, start: '08:00', end: '14:00', lStart: '', lEnd: '' },
        Ter: { off: false, start: '08:00', end: '14:00', lStart: '', lEnd: '' },
        Qua: { off: false, start: '08:00', end: '14:00', lStart: '', lEnd: '' },
        Qui: { off: false, start: '08:00', end: '14:00', lStart: '', lEnd: '' },
        Sex: { off: false, start: '08:00', end: '14:00', lStart: '', lEnd: '' },
        Sab: { off: true, start: '08:00', end: '14:00', lStart: '', lEnd: '' },
        Dom: { off: true, start: '07:30', end: '13:00', lStart: '', lEnd: '' }
      },
      Contratado2: {
        Seg: { off: false, start: '14:00', end: '20:00', lStart: '', lEnd: '' },
        Ter: { off: false, start: '14:00', end: '20:00', lStart: '', lEnd: '' },
        Qua: { off: false, start: '14:00', end: '20:00', lStart: '', lEnd: '' },
        Qui: { off: false, start: '14:00', end: '20:00', lStart: '', lEnd: '' },
        Sex: { off: false, start: '14:00', end: '20:00', lStart: '', lEnd: '' },
        Sab: { off: true, start: '14:00', end: '20:00', lStart: '', lEnd: '' },
        Dom: { off: true, start: '07:30', end: '13:00', lStart: '', lEnd: '' }
      }
    }
  }
};

function getMondayLocalDate(d: Date): Date {
  const local = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = local.getDay();
  const offset = dow === 0 ? -6 : 1 - dow;
  local.setDate(local.getDate() + offset);
  return local;
}

function parseYMDLocal(ymd: string): Date | null {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function getCurrentMondayYMD(refDate: Date = new Date()): string {
  const monday = getMondayLocalDate(refDate);
  const y = monday.getFullYear();
  const m = String(monday.getMonth() + 1).padStart(2, '0');
  const d = String(monday.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getCurrentWeekType(weekAStartDate: string, refDate: Date = new Date()): 'A' | 'B' {
  const baseParsed = parseYMDLocal(weekAStartDate);
  if (!baseParsed) return 'A';
  const baseMonday = getMondayLocalDate(baseParsed);
  const refMonday = getMondayLocalDate(refDate);
  const diffDays = Math.round((refMonday.getTime() - baseMonday.getTime()) / (24 * 60 * 60 * 1000));
  const diffWeeks = Math.floor(diffDays / 7);
  return Math.abs(diffWeeks) % 2 === 0 ? 'A' : 'B';
}

export function getTodayDayKey(refDate: Date = new Date()): TeamDayKey {
  const map: TeamDayKey[] = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];
  return map[refDate.getDay()];
}

export function buildDefaultTeamScheduleConfig(refDate: Date = new Date()): TeamScheduleConfig {
  const preset = TEAM_PRESETS.clt_44_seg_sab;
  return {
    presetId: preset.id,
    weekAStartDate: getCurrentMondayYMD(refDate),
    roster: cloneData(DEFAULT_ROSTER),
    weekA: cloneData(preset.weekA),
    weekB: cloneData(preset.weekB),
    finance: cloneData(preset.finance),
    meta: {
      regime: preset.finance.regime,
      qtdContratados: preset.finance.qtdContratados
    }
  };
}

export function parseMin(hhmm: string): number | null {
  if (!hhmm || !/^\d{2}:\d{2}$/.test(hhmm)) return null;
  const [h, m] = hhmm.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

export function fmtMin(minutes: number): string {
  const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
  const mm = String(minutes % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

export function fmtHours(hours: number): string {
  const totalMin = Math.round(hours * 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}h${String(m).padStart(2, '0')}`;
}

export function fmtBRL(val: number): string {
  return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function shiftMinutes(cell?: TeamShiftCell | null): number {
  if (!cell || cell.off) return 0;
  const s = parseMin(cell.start);
  const e = parseMin(cell.end);
  if (s === null || e === null || e <= s) return 0;
  let lunch = 0;
  if (cell.lStart && cell.lEnd) {
    const ls = parseMin(cell.lStart);
    const le = parseMin(cell.lEnd);
    if (ls !== null && le !== null && le > ls && ls >= s && le <= e) {
      lunch = le - ls;
    }
  }
  return Math.max(0, e - s - lunch);
}

export function isWorkingAt(cell: TeamShiftCell | undefined | null, minute: number): boolean {
  if (!cell || cell.off) return false;
  const s = parseMin(cell.start);
  const e = parseMin(cell.end);
  if (s === null || e === null || e <= s) return false;
  if (minute < s || minute >= e) return false;
  if (cell.lStart && cell.lEnd) {
    const ls = parseMin(cell.lStart);
    const le = parseMin(cell.lEnd);
    if (ls !== null && le !== null && le > ls && minute >= ls && minute < le) {
      return false;
    }
  }
  return true;
}

export function getActiveRoster(roster: TeamMemberConfig[], qtdContratados: 1 | 2): TeamMemberConfig[] {
  return roster.filter(member => member.key !== 'Contratado2' || Number(qtdContratados) === 2);
}

export function analyzeTeamWeek(
  week: TeamWeekSchedule,
  roster: TeamMemberConfig[],
  regime: TeamRegime,
  qtdContratados: 1 | 2
): TeamWeekAnalysis {
  const activeRoster = getActiveRoster(roster, qtdContratados);
  const personHours: Record<TeamMemberKey, number> = {
    Edevaldo: 0,
    Farmaceutica: 0,
    Contratado1: 0,
    Contratado2: 0
  };

  for (const p of activeRoster) {
    let totalMin = 0;
    for (const dk of TEAM_DAY_KEYS) {
      totalMin += shiftMinutes(week[p.key]?.[dk]);
    }
    personHours[p.key] = totalMin / 60;
  }

  let gapSlots = 0;
  const gapDays: string[] = [];
  let rtDaysSegSex = 0;
  const hiredSoloOpenClose: string[] = [];
  const alerts: TeamWeekAlert[] = [];

  for (let i = 0; i < TEAM_DAY_KEYS.length; i++) {
    const dk = TEAM_DAY_KEYS[i];
    const dayLabel = TEAM_DAYS[i];
    const openMin = 7 * 60 + 30;
    const closeMin = dk === 'Dom' ? 13 * 60 : 20 * 60;
    let dayGaps = 0;
    let hiredOnlyOpen = false;
    let hiredOnlyClose = false;

    for (let t = openMin; t < closeMin; t += 10) {
      const present = activeRoster.filter(p => isWorkingAt(week[p.key]?.[dk], t));
      if (present.length === 0) {
        dayGaps++;
        gapSlots++;
      }
      const partnersHere = present.some(p => !p.isHired);
      const hiredHere = present.some(p => p.isHired);
      if (t === openMin && hiredHere && !partnersHere) hiredOnlyOpen = true;
      if (t === closeMin - 10 && hiredHere && !partnersHere) hiredOnlyClose = true;
    }

    if (dayGaps > 0) gapDays.push(`${dayLabel} (${dayGaps * 10} min)`);
    if (hiredOnlyOpen) hiredSoloOpenClose.push(`Abertura de ${dayLabel} sem sócio`);
    if (hiredOnlyClose) hiredSoloOpenClose.push(`Fechamento de ${dayLabel} sem sócio`);

    if (i < 5) {
      const rtMin = shiftMinutes(week.Farmaceutica?.[dk]);
      if (rtMin > 0) {
        rtDaysSegSex++;
      } else {
        alerts.push({
          level: 'danger',
          text: `CRF-MG: ${dayLabel} está sem presença da Farmacêutica (dia útil descoberto).`
        });
      }
    }
  }

  if (gapDays.length > 0) {
    alerts.push({ level: 'danger', text: `Buracos sem ninguém na loja: ${gapDays.join(', ')}.` });
  } else {
    alerts.push({ level: 'ok', text: 'Cobertura integral: 0 minutos com loja vazia (80h30 cobertas).' });
  }

  for (const msg of hiredSoloOpenClose) {
    alerts.push({ level: 'warn', text: `Segurança de caixa: ${msg}.` });
  }

  const isIntern = regime === 'estagio';
  const maxWeekly = isIntern ? 30 : regime === 'clt_parcial' ? 30 : 44;
  const maxDaily = isIntern ? 6 : 8;

  for (const p of activeRoster.filter(x => x.isHired)) {
    const hrs = personHours[p.key];
    if (hrs > maxWeekly + 0.01) {
      alerts.push({
        level: 'danger',
        text: `${p.name}: ${fmtHours(hrs)} ultrapassa o teto de ${maxWeekly}h/sem (${isIntern ? 'Lei do Estágio' : 'CLT'}).`
      });
    }

    let workedDays = 0;
    for (let i = 0; i < TEAM_DAY_KEYS.length; i++) {
      const dk = TEAM_DAY_KEYS[i];
      const cell = week[p.key]?.[dk];
      if (!cell || cell.off) continue;
      workedDays++;

      const hrsDay = shiftMinutes(cell) / 60;
      if (hrsDay > maxDaily + 0.01) {
        alerts.push({
          level: isIntern ? 'danger' : 'warn',
          text: `${p.name} na ${TEAM_DAYS[i]}: ${fmtHours(hrsDay)} acima de ${maxDaily}h/dia${isIntern ? ' (proibido no estágio)' : ' (gera hora extra sem acordo)'}.`
        });
      }

      const ls = parseMin(cell.lStart);
      const le = parseMin(cell.lEnd);
      const lunchMin = ls !== null && le !== null && le > ls ? le - ls : 0;
      if (!isIntern && hrsDay > 6 && lunchMin < 60) {
        alerts.push({
          level: 'danger',
          text: `${p.name} na ${TEAM_DAYS[i]}: jornada acima de 6h exige intervalo mínimo de 1h00 (Art. 71 CLT).`
        });
      }

      const nextIdx = (i + 1) % 7;
      const nextCell = week[p.key]?.[TEAM_DAY_KEYS[nextIdx]];
      if (nextCell && !nextCell.off) {
        const endCur = parseMin(cell.end);
        const startNext = parseMin(nextCell.start);
        if (endCur !== null && startNext !== null) {
          const restMin = 24 * 60 - endCur + startNext;
          if (restMin < 11 * 60) {
            alerts.push({
              level: 'danger',
              text: `${p.name} (${TEAM_DAYS[i]} → ${TEAM_DAYS[nextIdx]}): descanso entre turnos de ${(restMin / 60).toFixed(1)}h (mínimo legal 11h).`
            });
          }
        }
      }
    }

    if (workedDays === 7) {
      alerts.push({ level: 'danger', text: `${p.name}: trabalha os 7 dias sem Descanso Semanal Remunerado (DSR).` });
    }
    if (!isIntern && week[p.key]?.Dom && !week[p.key].Dom.off) {
      alerts.push({
        level: 'warn',
        text: `${p.name}: escalado(a) no domingo — lembre-se do rodízio obrigatório (Art. 386 CLT / comércio).`
      });
    }
  }

  if (rtDaysSegSex === 5) {
    alerts.push({ level: 'ok', text: 'CRF-MG protegido nos dias úteis: Farmacêutica presente 5/5 dias (Seg–Sex).' });
  }

  return { personHours, gapSlots, rtDaysSegSex, alerts };
}

export function computeTeamFinance(f: TeamFinanceConfig): TeamFinanceBreakdown {
  const qtd = Number(f.qtdContratados) === 2 ? 2 : 1;
  const sal = Math.max(0, Number(f.salarioBase) || 0);
  const vtRaw = Math.max(0, Number(f.vtGastoTotal) || 0);
  const outros = Math.max(0, Number(f.outrosCustos) || 0);
  const diasFolga = Math.max(0, Number(f.diasFolgaMes) || 0);
  const custoFolga = Math.max(0, Number(f.custoEntregaFolga) || 0);
  const fat = Math.max(1, Number(f.faturamentoRef) || 36000);
  const teto = Math.max(1, Number(f.tetoOrcamento) || 2500);

  const isIntern = f.regime === 'estagio';
  const fgtsUnit = isIntern ? 0 : sal * 0.08;
  const vtNetUnit = isIntern ? vtRaw : Math.max(0, vtRaw - sal * 0.06);
  const outrosUnit = outros;

  const decimoUnit = isIntern ? 0 : sal / 12;
  const feriasUnit = isIntern ? sal / 12 : (sal / 12) * (4 / 3);
  const fgtsProvUnit = isIntern ? 0 : 0.08 * (decimoUnit + feriasUnit);
  const multaUnit = !isIntern && f.incluirMultaFgts ? 0.4 * (fgtsUnit + fgtsProvUnit) : 0;

  const entregasFolga = diasFolga * custoFolga;
  const desembolsoEquipe = qtd * (sal + fgtsUnit + vtNetUnit + outrosUnit);
  const desembolsoTotal = desembolsoEquipe + entregasFolga;
  const provisaoTotal = qtd * (decimoUnit + feriasUnit + fgtsProvUnit + multaUnit);
  const custoTotalReal = desembolsoTotal + provisaoTotal;
  const pctFat = (custoTotalReal / fat) * 100;
  const margemTeto = teto - custoTotalReal;

  return {
    qtd,
    sal,
    vtRaw,
    vtNetUnit,
    outrosUnit,
    fgtsUnit,
    decimoUnit,
    feriasUnit,
    fgtsProvUnit,
    multaUnit,
    entregasFolga,
    desembolsoEquipe,
    desembolsoTotal,
    provisaoTotal,
    custoTotalReal,
    pctFat,
    margemTeto,
    teto,
    isIntern
  };
}
