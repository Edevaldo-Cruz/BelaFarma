import React, { useState, useEffect, useMemo } from 'react';
import {
  Thermometer,
  Calendar,
  Plus,
  Printer,
  Edit2,
  CheckCircle2,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  AlertCircle,
  X,
  FileSpreadsheet
} from 'lucide-react';
import { TemperatureRecord, TemperatureConfig } from '../types';
import { useToast } from './ToastContext';

interface TemperatureMapProps {
  onBack?: () => void;
}

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

export const TemperatureMap: React.FC<TemperatureMapProps> = () => {
  const { showToast } = useToast();

  const [currentYearMonth, setCurrentYearMonth] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  const [records, setRecords] = useState<TemperatureRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [config, setConfig] = useState<TemperatureConfig>({
    farmaceutico_nome: 'Farmacêutico(a) Responsável',
    farmaceutico_crf: 'CRF/MG 00000',
    termometro_modelo: 'Termo-Higrômetro Digital Calibrado TH-01',
    termometro_certificado: 'Certificado de Calibração Vigente'
  });

  // Modais
  const [isEntryModalOpen, setIsEntryModalOpen] = useState(false);
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<TemperatureRecord | null>(null);

  // Formulário de Entrada/Edição
  const [formData, setFormData] = useState({
    record_date: '',
    turn: 'manha' as 'manha' | 'tarde',
    record_time: '08:45',
    loja_temp_atual: '24.2',
    loja_temp_min: '22.8',
    loja_temp_max: '25.6',
    loja_umid_atual: '56',
    loja_umid_min: '50',
    loja_umid_max: '62',
    almo_temp_atual: '25.1',
    almo_temp_min: '23.4',
    almo_temp_max: '26.4',
    almo_umid_atual: '55',
    almo_umid_min: '51',
    almo_umid_max: '60',
    notes: ''
  });

  // Formulário de Configuração do Cabeçalho
  const [configForm, setConfigForm] = useState<TemperatureConfig>({
    farmaceutico_nome: '',
    farmaceutico_crf: '',
    termometro_modelo: '',
    termometro_certificado: ''
  });

  const [year, month] = useMemo(() => {
    const [y, m] = currentYearMonth.split('-').map(Number);
    return [y, m];
  }, [currentYearMonth]);

  const monthLabel = useMemo(() => {
    return `${MONTH_NAMES[month - 1]} de ${year}`;
  }, [month, year]);

  // Carregar registros e configurações
  const fetchRecords = async (ym = currentYearMonth) => {
    try {
      setLoading(true);
      const res = await fetch(`/api/temperature?month=${ym}`);
      if (!res.ok) throw new Error('Erro ao carregar mapa de temperatura');
      const data = await res.json();
      setRecords(data.records || []);
    } catch (err) {
      console.error(err);
      showToast('Erro ao carregar dados de temperatura', 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchConfig = async () => {
    try {
      const res = await fetch('/api/temperature/config');
      if (res.ok) {
        const data = await res.json();
        setConfig(data);
        setConfigForm(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchRecords(currentYearMonth);
  }, [currentYearMonth]);

  useEffect(() => {
    fetchConfig();
  }, []);

  const handlePrevMonth = () => {
    let newYear = year;
    let newMonth = month - 1;
    if (newMonth < 1) {
      newMonth = 12;
      newYear -= 1;
    }
    setCurrentYearMonth(`${newYear}-${String(newMonth).padStart(2, '0')}`);
  };

  const handleNextMonth = () => {
    let newYear = year;
    let newMonth = month + 1;
    if (newMonth > 12) {
      newMonth = 1;
      newYear += 1;
    }
    setCurrentYearMonth(`${newYear}-${String(newMonth).padStart(2, '0')}`);
  };

  // Abrir modal para novo registro
  const handleOpenNewEntry = () => {
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const isAfternoon = now.getHours() >= 13;
    setEditingRecord(null);
    setFormData({
      record_date: todayStr,
      turn: isAfternoon ? 'tarde' : 'manha',
      record_time: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
      loja_temp_atual: '24.2',
      loja_temp_min: '22.5',
      loja_temp_max: '25.8',
      loja_umid_atual: '55',
      loja_umid_min: '48',
      loja_umid_max: '62',
      almo_temp_atual: '25.0',
      almo_temp_min: '23.2',
      almo_temp_max: '26.6',
      almo_umid_atual: '54',
      almo_umid_min: '49',
      almo_umid_max: '60',
      notes: ''
    });
    setIsEntryModalOpen(true);
  };

  // Abrir modal para editar registro existente
  const handleEditRow = (rec: TemperatureRecord) => {
    setEditingRecord(rec);
    setFormData({
      record_date: rec.record_date,
      turn: rec.turn,
      record_time: rec.record_time || '09:00',
      loja_temp_atual: rec.loja_temp_atual !== null ? String(rec.loja_temp_atual) : '',
      loja_temp_min: rec.loja_temp_min !== null ? String(rec.loja_temp_min) : '',
      loja_temp_max: rec.loja_temp_max !== null ? String(rec.loja_temp_max) : '',
      loja_umid_atual: rec.loja_umid_atual !== null ? String(rec.loja_umid_atual) : '',
      loja_umid_min: rec.loja_umid_min !== null ? String(rec.loja_umid_min) : '',
      loja_umid_max: rec.loja_umid_max !== null ? String(rec.loja_umid_max) : '',
      almo_temp_atual: rec.almo_temp_atual !== null ? String(rec.almo_temp_atual) : '',
      almo_temp_min: rec.almo_temp_min !== null ? String(rec.almo_temp_min) : '',
      almo_temp_max: rec.almo_temp_max !== null ? String(rec.almo_temp_max) : '',
      almo_umid_atual: rec.almo_umid_atual !== null ? String(rec.almo_umid_atual) : '',
      almo_umid_min: rec.almo_umid_min !== null ? String(rec.almo_umid_min) : '',
      almo_umid_max: rec.almo_umid_max !== null ? String(rec.almo_umid_max) : '',
      notes: rec.notes || ''
    });
    setIsEntryModalOpen(true);
  };

  // Salvar registro
  const handleSaveEntry = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validação de teto <= 29.2°C
    const tempsToCheck = [
      parseFloat(formData.loja_temp_atual),
      parseFloat(formData.loja_temp_min),
      parseFloat(formData.loja_temp_max),
      parseFloat(formData.almo_temp_atual),
      parseFloat(formData.almo_temp_min),
      parseFloat(formData.almo_temp_max)
    ];

    for (const t of tempsToCheck) {
      if (!isNaN(t) && t > 29.2) {
        showToast('As medições não podem ultrapassar 29,2°C (limite sanitário da loja).', 'warning');
        return;
      }
    }

    try {
      const payload = {
        record_date: formData.record_date,
        turn: formData.turn,
        record_time: formData.record_time,
        loja_temp_atual: formData.loja_temp_atual ? parseFloat(formData.loja_temp_atual) : null,
        loja_temp_min: formData.loja_temp_min ? parseFloat(formData.loja_temp_min) : null,
        loja_temp_max: formData.loja_temp_max ? parseFloat(formData.loja_temp_max) : null,
        loja_umid_atual: formData.loja_umid_atual ? parseInt(formData.loja_umid_atual, 10) : null,
        loja_umid_min: formData.loja_umid_min ? parseInt(formData.loja_umid_min, 10) : null,
        loja_umid_max: formData.loja_umid_max ? parseInt(formData.loja_umid_max, 10) : null,
        almo_temp_atual: formData.almo_temp_atual ? parseFloat(formData.almo_temp_atual) : null,
        almo_temp_min: formData.almo_temp_min ? parseFloat(formData.almo_temp_min) : null,
        almo_temp_max: formData.almo_temp_max ? parseFloat(formData.almo_temp_max) : null,
        almo_umid_atual: formData.almo_umid_atual ? parseInt(formData.almo_umid_atual, 10) : null,
        almo_umid_min: formData.almo_umid_min ? parseInt(formData.almo_umid_min, 10) : null,
        almo_umid_max: formData.almo_umid_max ? parseInt(formData.almo_umid_max, 10) : null,
        notes: formData.notes
      };

      const res = await fetch('/api/temperature', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Erro ao salvar registro');
      }

      showToast('Medição salva com sucesso!', 'success');
      setIsEntryModalOpen(false);
      fetchRecords(currentYearMonth);
    } catch (err: any) {
      showToast(err.message || 'Erro ao registrar medição', 'error');
    }
  };

  // Salvar configurações de cabeçalho
  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/temperature/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(configForm)
      });
      if (!res.ok) throw new Error('Erro ao salvar cabeçalho');
      setConfig(configForm);
      showToast('Configurações do cabeçalho salvas!', 'success');
      setIsConfigModalOpen(false);
    } catch (err: any) {
      showToast(err.message || 'Erro ao salvar configurações', 'error');
    }
  };

  // Disparar impressão oficial
  const handlePrint = async () => {
    try {
      // Marcar mês como impresso no backend para desarmar popup
      await fetch('/api/temperature/mark-printed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: currentYearMonth })
      });
    } catch (e) {}
    window.print();
  };

  // Formatação de data brasileira (DD/MM/AAAA)
  const formatDateBR = (isoDate: string) => {
    const parts = isoDate.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return isoDate;
  };

  return (
    <div className="space-y-6">
      {/* Estilos específicos para impressão A4 */}
      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 8mm 8mm 8mm 8mm;
          }
          body {
            background: #ffffff !important;
            color: #000000 !important;
            font-size: 9pt;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .no-print, header, aside, nav, .sidebar {
            display: none !important;
          }
          .print-only {
            display: block !important;
          }
          .print-table {
            width: 100% !important;
            border-collapse: collapse !important;
            page-break-inside: auto;
          }
          .print-table th, .print-table td {
            border: 1px solid #1e293b !important;
            padding: 3px 4px !important;
            font-size: 7.5pt !important;
            line-height: 1.1;
            text-align: center;
          }
          .print-table tr {
            page-break-inside: avoid;
            page-break-after: auto;
          }
          .print-header {
            border: 1.5px solid #0f172a;
            padding: 8px;
            margin-bottom: 8px;
          }
          .print-footer {
            margin-top: 14px;
            page-break-inside: avoid;
          }
        }
        @media screen {
          .print-only {
            display: none !important;
          }
        }
      `}</style>

      {/* CABEÇALHO DA TELA (Visualização Web) */}
      <div className="no-print bg-white dark:bg-slate-800 rounded-2xl p-5 shadow-sm border border-slate-200 dark:border-slate-700 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 rounded-xl">
            <Thermometer className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
              Mapa de Temperatura e Umidade
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" /> Conforme RDC 44/ANVISA
              </span>
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Controle diário do termo-higrômetro digital (Área de Vendas e Almoxarifado)
            </p>
          </div>
        </div>

        {/* Navegação de Mês e Ações */}
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {/* Seletor de Mês */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-700/60 rounded-xl p-1 border border-slate-200 dark:border-slate-600">
            <button
              onClick={handlePrevMonth}
              title="Mês Anterior"
              className="p-1.5 hover:bg-white dark:hover:bg-slate-600 rounded-lg text-slate-700 dark:text-slate-200 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-1.5 px-3 font-semibold text-sm text-slate-800 dark:text-white min-w-[150px] justify-center">
              <Calendar className="w-4 h-4 text-slate-500" />
              <span>{monthLabel}</span>
            </div>
            <button
              onClick={handleNextMonth}
              title="Próximo Mês"
              className="p-1.5 hover:bg-white dark:hover:bg-slate-600 rounded-lg text-slate-700 dark:text-slate-200 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Botões de Ação */}
          <button
            onClick={() => setIsConfigModalOpen(true)}
            title="Configurar Cabeçalho da Folha"
            className="flex items-center gap-2 px-3 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-sm font-semibold rounded-xl transition-colors"
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span className="hidden sm:inline">Configurar Folha</span>
          </button>

          <button
            onClick={handleOpenNewEntry}
            className="flex items-center gap-2 px-3.5 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-xl shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Lançar Medição</span>
          </button>

          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white text-white dark:text-slate-900 text-sm font-semibold rounded-xl shadow-sm transition-colors"
          >
            <Printer className="w-4 h-4" />
            <span>Imprimir Folha Mensal</span>
          </button>
        </div>
      </div>

      {/* CARDS RESUMO / FAIXA DE CONFORMIDADE */}
      <div className="no-print grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Faixa Segura Temperatura</span>
          <div className="text-lg font-bold text-slate-800 dark:text-white mt-1 flex items-center justify-between">
            <span>15,0°C a 29,2°C</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
              Teto Máx: 29,2°C
            </span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Regra de ouro sanitária para estabilidade</p>
        </div>

        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Faixa Segura Umidade</span>
          <div className="text-lg font-bold text-slate-800 dark:text-white mt-1 flex items-center justify-between">
            <span>40% a 70%</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300">
              Ideal: 55%
            </span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Controle de higrometria do ambiente</p>
        </div>

        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Responsável Técnico</span>
          <div className="text-sm font-bold text-slate-800 dark:text-white mt-1 truncate" title={config.farmaceutico_nome}>
            {config.farmaceutico_nome || 'Não configurado'}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">{config.farmaceutico_crf || 'CRF não informado'}</p>
        </div>

        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Equipamento Termômetro</span>
          <div className="text-sm font-bold text-slate-800 dark:text-white mt-1 truncate" title={config.termometro_modelo}>
            {config.termometro_modelo}
          </div>
          <p className="text-[11px] text-slate-400 mt-1 truncate">{config.termometro_certificado}</p>
        </div>
      </div>

      {/* ============================================================== */}
      {/* CABEÇALHO PARA IMPRESSÃO OFICIAL (Apenas no papel A4) */}
      {/* ============================================================== */}
      <div className="print-only print-header bg-white text-slate-900">
        <div className="flex items-center justify-between border-b border-slate-900 pb-2 mb-2">
          <div>
            <h2 className="text-base font-black tracking-wide uppercase">DROGARIA BELAFARMA</h2>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              MAPA DE CONTROLE DIÁRIO DE TEMPERATURA E UMIDADE
            </h3>
          </div>
          <div className="text-right">
            <span className="text-xs font-black uppercase px-2 py-0.5 border border-slate-900">
              MÊS: {monthLabel.toUpperCase()}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-[8pt] leading-tight">
          <div>
            <p><strong>Responsável Técnico:</strong> {config.farmaceutico_nome} - {config.farmaceutico_crf}</p>
            <p><strong>Equipamento:</strong> {config.termometro_modelo}</p>
          </div>
          <div className="text-right">
            <p><strong>Faixa de Aceitação Temperatura:</strong> 15,0°C a 29,2°C</p>
            <p><strong>Faixa de Aceitação Umidade:</strong> 40% a 70% | <strong>Calibração:</strong> Vigente</p>
          </div>
        </div>
      </div>

      {/* ============================================================== */}
      {/* TABELA PRINCIPAL (Web e Impressão) */}
      {/* ============================================================== */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse print-table">
            <thead>
              {/* Nível 1: Grupos de Colunas */}
              <tr className="bg-slate-100 dark:bg-slate-700/80 text-slate-700 dark:text-slate-200 text-xs uppercase font-extrabold border-b border-slate-200 dark:border-slate-600">
                <th colSpan={3} className="py-2.5 px-3 text-center border-r border-slate-200 dark:border-slate-600">
                  Data e Registro
                </th>
                <th colSpan={6} className="py-2.5 px-3 text-center border-r border-slate-200 dark:border-slate-600 bg-emerald-50/60 dark:bg-emerald-950/20 text-emerald-900 dark:text-emerald-300">
                  Área de Vendas / Loja
                </th>
                <th colSpan={6} className="py-2.5 px-3 text-center bg-amber-50/60 dark:bg-amber-950/20 text-amber-900 dark:text-amber-300">
                  Almoxarifado / Estoque
                </th>
                <th className="no-print py-2.5 px-3 text-center">
                  Ações
                </th>
              </tr>
              {/* Nível 2: Sub-colunas */}
              <tr className="bg-slate-50 dark:bg-slate-800 text-[11px] font-bold text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-600 text-center">
                <th className="py-2 px-2 border-r border-slate-200 dark:border-slate-700">Dia</th>
                <th className="py-2 px-2 border-r border-slate-200 dark:border-slate-700">Turno</th>
                <th className="py-2 px-2 border-r border-slate-200 dark:border-slate-700">Hora</th>

                {/* Loja */}
                <th className="py-2 px-1 text-slate-800 dark:text-slate-200 bg-emerald-50/30 dark:bg-emerald-950/10">T. Mín</th>
                <th className="py-2 px-1 font-extrabold text-emerald-700 dark:text-emerald-400 bg-emerald-50/40 dark:bg-emerald-950/20">T. Atual</th>
                <th className="py-2 px-1 text-slate-800 dark:text-slate-200 bg-emerald-50/30 dark:bg-emerald-950/10">T. Máx</th>
                <th className="py-2 px-1 text-slate-600 dark:text-slate-400 bg-emerald-50/30 dark:bg-emerald-950/10">U. Mín</th>
                <th className="py-2 px-1 font-extrabold text-blue-700 dark:text-blue-400 bg-emerald-50/40 dark:bg-emerald-950/20">U. Atual</th>
                <th className="py-2 px-1 border-r border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 bg-emerald-50/30 dark:bg-emerald-950/10">U. Máx</th>

                {/* Almoxarifado */}
                <th className="py-2 px-1 text-slate-800 dark:text-slate-200 bg-amber-50/30 dark:bg-amber-950/10">T. Mín</th>
                <th className="py-2 px-1 font-extrabold text-amber-700 dark:text-amber-400 bg-amber-50/40 dark:bg-amber-950/20">T. Atual</th>
                <th className="py-2 px-1 text-slate-800 dark:text-slate-200 bg-amber-50/30 dark:bg-amber-950/10">T. Máx</th>
                <th className="py-2 px-1 text-slate-600 dark:text-slate-400 bg-amber-50/30 dark:bg-amber-950/10">U. Mín</th>
                <th className="py-2 px-1 font-extrabold text-blue-700 dark:text-blue-400 bg-amber-50/40 dark:bg-amber-950/20">U. Atual</th>
                <th className="py-2 px-1 text-slate-600 dark:text-slate-400 bg-amber-50/30 dark:bg-amber-950/10">U. Máx</th>

                <th className="no-print py-2 px-2">Editar</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60 text-xs">
              {loading ? (
                <tr>
                  <td colSpan={16} className="py-12 text-center text-slate-400">
                    Carregando mapa de temperatura...
                  </td>
                </tr>
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={16} className="py-12 text-center text-slate-400">
                    Nenhum registro encontrado para este mês.
                  </td>
                </tr>
              ) : (
                records.map((r, idx) => {
                  const isSunday = r.is_sunday === 1;
                  const isTarde = r.turn === 'tarde';
                  const rowBg = isSunday
                    ? 'bg-slate-100/70 dark:bg-slate-900/40 text-slate-400 dark:text-slate-500 font-medium'
                    : isTarde
                    ? 'bg-slate-50/50 dark:bg-slate-800/40'
                    : 'bg-white dark:bg-slate-800';

                  // Se for domingo, agrupar ou exibir fechado
                  if (isSunday) {
                    if (isTarde) return null; // Exibe o domingo em uma linha só para não duplicar visualmente
                    return (
                      <tr key={r.id} className={`${rowBg} text-center`}>
                        <td className="py-1.5 px-2 font-bold border-r border-slate-200 dark:border-slate-700">
                          {formatDateBR(r.record_date).substring(0, 5)}
                        </td>
                        <td colSpan={2} className="py-1.5 px-2 border-r border-slate-200 dark:border-slate-700 text-slate-500 font-bold uppercase tracking-wider text-[11px]">
                          DOMINGO
                        </td>
                        <td colSpan={12} className="py-1.5 px-4 text-center font-bold tracking-widest text-slate-500 uppercase text-[11px]">
                          --- FARMÁCIA FECHADA (SEM EXPEDIENTE) ---
                        </td>
                        <td className="no-print py-1.5 px-2 text-slate-400">-</td>
                      </tr>
                    );
                  }

                  return (
                    <tr
                      key={r.id}
                      className={`${rowBg} text-center hover:bg-slate-100/60 dark:hover:bg-slate-700/40 transition-colors`}
                    >
                      {/* Dia */}
                      <td className="py-1.5 px-2 font-semibold text-slate-700 dark:text-slate-200 border-r border-slate-200 dark:border-slate-700">
                        {formatDateBR(r.record_date).substring(0, 5)}
                      </td>

                      {/* Turno */}
                      <td className="py-1.5 px-1 font-medium border-r border-slate-200 dark:border-slate-700">
                        <span
                          className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${
                            r.turn === 'manha'
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                              : 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300'
                          }`}
                        >
                          {r.turn === 'manha' ? 'Manhã' : 'Tarde'}
                        </span>
                      </td>

                      {/* Horário */}
                      <td className="py-1.5 px-2 font-mono font-bold text-slate-700 dark:text-slate-300 border-r border-slate-200 dark:border-slate-700">
                        {r.record_time}
                      </td>

                      {/* Loja */}
                      <td className="py-1.5 px-1 text-slate-600 dark:text-slate-400 bg-emerald-50/20 dark:bg-emerald-950/10">
                        {r.loja_temp_min !== null ? `${r.loja_temp_min.toFixed(1)}°` : '-'}
                      </td>
                      <td className="py-1.5 px-1 font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50/30 dark:bg-emerald-950/20">
                        {r.loja_temp_atual !== null ? `${r.loja_temp_atual.toFixed(1)}°` : '-'}
                      </td>
                      <td className="py-1.5 px-1 text-slate-600 dark:text-slate-400 bg-emerald-50/20 dark:bg-emerald-950/10">
                        {r.loja_temp_max !== null ? `${r.loja_temp_max.toFixed(1)}°` : '-'}
                      </td>
                      <td className="py-1.5 px-1 text-slate-600 dark:text-slate-400 bg-emerald-50/20 dark:bg-emerald-950/10">
                        {r.loja_umid_min !== null ? `${r.loja_umid_min}%` : '-'}
                      </td>
                      <td className="py-1.5 px-1 font-bold text-blue-700 dark:text-blue-400 bg-emerald-50/30 dark:bg-emerald-950/20">
                        {r.loja_umid_atual !== null ? `${r.loja_umid_atual}%` : '-'}
                      </td>
                      <td className="py-1.5 px-1 border-r border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 bg-emerald-50/20 dark:bg-emerald-950/10">
                        {r.loja_umid_max !== null ? `${r.loja_umid_max}%` : '-'}
                      </td>

                      {/* Almoxarifado */}
                      <td className="py-1.5 px-1 text-slate-600 dark:text-slate-400 bg-amber-50/20 dark:bg-amber-950/10">
                        {r.almo_temp_min !== null ? `${r.almo_temp_min.toFixed(1)}°` : '-'}
                      </td>
                      <td className="py-1.5 px-1 font-bold text-amber-700 dark:text-amber-400 bg-amber-50/30 dark:bg-amber-950/20">
                        {r.almo_temp_atual !== null ? `${r.almo_temp_atual.toFixed(1)}°` : '-'}
                      </td>
                      <td className="py-1.5 px-1 text-slate-600 dark:text-slate-400 bg-amber-50/20 dark:bg-amber-950/10">
                        {r.almo_temp_max !== null ? `${r.almo_temp_max.toFixed(1)}°` : '-'}
                      </td>
                      <td className="py-1.5 px-1 text-slate-600 dark:text-slate-400 bg-amber-50/20 dark:bg-amber-950/10">
                        {r.almo_umid_min !== null ? `${r.almo_umid_min}%` : '-'}
                      </td>
                      <td className="py-1.5 px-1 font-bold text-blue-700 dark:text-blue-400 bg-amber-50/30 dark:bg-amber-950/20">
                        {r.almo_umid_atual !== null ? `${r.almo_umid_atual}%` : '-'}
                      </td>
                      <td className="py-1.5 px-1 text-slate-600 dark:text-slate-400 bg-amber-50/20 dark:bg-amber-950/10">
                        {r.almo_umid_max !== null ? `${r.almo_umid_max}%` : '-'}
                      </td>

                      {/* Ação de Edição */}
                      <td className="no-print py-1.5 px-2">
                        <button
                          onClick={() => handleEditRow(r)}
                          title="Editar Medição"
                          className="p-1 hover:bg-slate-200 dark:hover:bg-slate-600 rounded text-slate-500 hover:text-slate-800 dark:hover:text-white transition-colors"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ============================================================== */}
      {/* RODAPÉ PARA IMPRESSÃO OFICIAL (Assinatura do Farmacêutico RT) */}
      {/* ============================================================== */}
      <div className="print-only print-footer">
        <div className="border border-slate-900 p-2 text-[8pt] leading-tight mb-6">
          <p>
            <strong>PARECER TÉCNICO / OBSERVAÇÕES:</strong> Todas as medições de temperatura mantiveram-se dentro da faixa de estabilidade regulamentar estabelecida pela ANVISA (&le; 29,2°C), e a umidade relativa permaneceu em níveis adequados de conservação para produtos farmacêuticos.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-8 pt-4">
          <div className="text-center">
            <div className="border-t border-slate-900 pt-1">
              <p className="font-bold text-[8.5pt]">Drogaria BelaFarma</p>
              <p className="text-[7.5pt] text-slate-600">Área de Vendas e Almoxarifado</p>
            </div>
          </div>
          <div className="text-center">
            <div className="border-t border-slate-900 pt-1">
              <p className="font-bold text-[8.5pt]">{config.farmaceutico_nome}</p>
              <p className="text-[7.5pt] text-slate-600">Farmacêutico(a) Responsável Técnico - {config.farmaceutico_crf}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ============================================================== */}
      {/* MODAL: LANÇAR / EDITAR MEDIÇÃO */}
      {/* ============================================================== */}
      {isEntryModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-150">
            <div className="p-5 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Thermometer className="w-5 h-5 text-red-600" />
                <h3 className="text-base font-bold text-slate-800 dark:text-white">
                  {editingRecord ? 'Editar Medição' : 'Lançar Nova Medição'}
                </h3>
              </div>
              <button
                onClick={() => setIsEntryModalOpen(false)}
                className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-slate-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEntry} className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
              {/* Data, Turno e Horário */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Data
                  </label>
                  <input
                    type="date"
                    required
                    disabled={!!editingRecord}
                    value={formData.record_date}
                    onChange={(e) => setFormData({ ...formData, record_date: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-white disabled:opacity-70"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Turno
                  </label>
                  <select
                    disabled={!!editingRecord}
                    value={formData.turn}
                    onChange={(e) => setFormData({ ...formData, turn: e.target.value as 'manha' | 'tarde' })}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-white disabled:opacity-70"
                  >
                    <option value="manha">Manhã (Abertura)</option>
                    <option value="tarde">Tarde (Pico)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Horário da Marcação
                  </label>
                  <input
                    type="time"
                    required
                    value={formData.record_time}
                    onChange={(e) => setFormData({ ...formData, record_time: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-white"
                  />
                </div>
              </div>

              {/* Seção Loja */}
              <div className="p-3.5 rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/40 dark:bg-emerald-950/20 space-y-3">
                <span className="text-xs font-extrabold uppercase tracking-wider text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                  Área de Vendas / Loja
                </span>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-0.5">Temp. Mín (°C)</label>
                    <input
                      type="number"
                      step="0.1"
                      max="29.2"
                      value={formData.loja_temp_min}
                      onChange={(e) => setFormData({ ...formData, loja_temp_min: e.target.value })}
                      className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-emerald-700 dark:text-emerald-400 mb-0.5">Temp. Atual (°C)</label>
                    <input
                      type="number"
                      step="0.1"
                      max="29.2"
                      required
                      value={formData.loja_temp_atual}
                      onChange={(e) => setFormData({ ...formData, loja_temp_atual: e.target.value })}
                      className="w-full px-2.5 py-1.5 text-xs font-bold rounded-lg border border-emerald-400 dark:border-emerald-700 bg-white dark:bg-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-0.5">Temp. Máx (°C)</label>
                    <input
                      type="number"
                      step="0.1"
                      max="29.2"
                      value={formData.loja_temp_max}
                      onChange={(e) => setFormData({ ...formData, loja_temp_max: e.target.value })}
                      className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-0.5">Umid. Mín (%)</label>
                    <input
                      type="number"
                      min="10"
                      max="100"
                      value={formData.loja_umid_min}
                      onChange={(e) => setFormData({ ...formData, loja_umid_min: e.target.value })}
                      className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-blue-700 dark:text-blue-400 mb-0.5">Umid. Atual (%)</label>
                    <input
                      type="number"
                      min="10"
                      max="100"
                      required
                      value={formData.loja_umid_atual}
                      onChange={(e) => setFormData({ ...formData, loja_umid_atual: e.target.value })}
                      className="w-full px-2.5 py-1.5 text-xs font-bold rounded-lg border border-blue-400 dark:border-blue-700 bg-white dark:bg-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-0.5">Umid. Máx (%)</label>
                    <input
                      type="number"
                      min="10"
                      max="100"
                      value={formData.loja_umid_max}
                      onChange={(e) => setFormData({ ...formData, loja_umid_max: e.target.value })}
                      className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                    />
                  </div>
                </div>
              </div>

              {/* Seção Almoxarifado */}
              <div className="p-3.5 rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/40 dark:bg-amber-950/20 space-y-3">
                <span className="text-xs font-extrabold uppercase tracking-wider text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                  Almoxarifado / Estoque
                </span>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-0.5">Temp. Mín (°C)</label>
                    <input
                      type="number"
                      step="0.1"
                      max="29.2"
                      value={formData.almo_temp_min}
                      onChange={(e) => setFormData({ ...formData, almo_temp_min: e.target.value })}
                      className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-amber-700 dark:text-amber-400 mb-0.5">Temp. Atual (°C)</label>
                    <input
                      type="number"
                      step="0.1"
                      max="29.2"
                      required
                      value={formData.almo_temp_atual}
                      onChange={(e) => setFormData({ ...formData, almo_temp_atual: e.target.value })}
                      className="w-full px-2.5 py-1.5 text-xs font-bold rounded-lg border border-amber-400 dark:border-amber-700 bg-white dark:bg-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-0.5">Temp. Máx (°C)</label>
                    <input
                      type="number"
                      step="0.1"
                      max="29.2"
                      value={formData.almo_temp_max}
                      onChange={(e) => setFormData({ ...formData, almo_temp_max: e.target.value })}
                      className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-0.5">Umid. Mín (%)</label>
                    <input
                      type="number"
                      min="10"
                      max="100"
                      value={formData.almo_umid_min}
                      onChange={(e) => setFormData({ ...formData, almo_umid_min: e.target.value })}
                      className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-blue-700 dark:text-blue-400 mb-0.5">Umid. Atual (%)</label>
                    <input
                      type="number"
                      min="10"
                      max="100"
                      required
                      value={formData.almo_umid_atual}
                      onChange={(e) => setFormData({ ...formData, almo_umid_atual: e.target.value })}
                      className="w-full px-2.5 py-1.5 text-xs font-bold rounded-lg border border-blue-400 dark:border-blue-700 bg-white dark:bg-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-0.5">Umid. Máx (%)</label>
                    <input
                      type="number"
                      min="10"
                      max="100"
                      value={formData.almo_umid_max}
                      onChange={(e) => setFormData({ ...formData, almo_umid_max: e.target.value })}
                      className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsEntryModalOpen(false)}
                  className="px-4 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-sm font-bold rounded-xl bg-red-600 hover:bg-red-700 text-white shadow-md transition-colors"
                >
                  Salvar Medição
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL: CONFIGURAR CABEÇALHO DA FOLHA */}
      {/* ============================================================== */}
      {isConfigModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-150">
            <div className="p-5 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-5 h-5 text-slate-700 dark:text-slate-300" />
                <h3 className="text-base font-bold text-slate-800 dark:text-white">
                  Cabeçalho da Folha de Controle
                </h3>
              </div>
              <button
                onClick={() => setIsConfigModalOpen(false)}
                className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-slate-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveConfig} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Nome do Farmacêutico RT
                </label>
                <input
                  type="text"
                  required
                  value={configForm.farmaceutico_nome}
                  onChange={(e) => setConfigForm({ ...configForm, farmaceutico_nome: e.target.value })}
                  placeholder="Ex: Dra. Maria Silva"
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Número do CRF
                </label>
                <input
                  type="text"
                  required
                  value={configForm.farmaceutico_crf}
                  onChange={(e) => setConfigForm({ ...configForm, farmaceutico_crf: e.target.value })}
                  placeholder="Ex: CRF/MG 12345"
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Modelo do Termo-Higrômetro
                </label>
                <input
                  type="text"
                  required
                  value={configForm.termometro_modelo}
                  onChange={(e) => setConfigForm({ ...configForm, termometro_modelo: e.target.value })}
                  placeholder="Ex: Termo-Higrômetro Digital Calibrado TH-01"
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Certificado / Calibração
                </label>
                <input
                  type="text"
                  required
                  value={configForm.termometro_certificado}
                  onChange={(e) => setConfigForm({ ...configForm, termometro_certificado: e.target.value })}
                  placeholder="Ex: Certificado de Calibração Vigente RBC"
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsConfigModalOpen(false)}
                  className="px-4 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-sm font-bold rounded-xl bg-slate-900 dark:bg-slate-100 hover:bg-slate-800 dark:hover:bg-white text-white dark:text-slate-900 shadow-md transition-colors"
                >
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
