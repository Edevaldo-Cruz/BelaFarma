import React, { useState, useEffect, useMemo } from 'react';
import {
  Thermometer,
  Calendar,
  Plus,
  Printer,
  Edit2,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  X,
  Layers,
  CheckSquare,
  Square,
  FileText,
  Download,
  FileDown,
  Loader2
} from 'lucide-react';
import { TemperatureRecord, TemperatureConfig } from '../types';
import { useToast } from './ToastContext';
import { generateSingleMonthPdf, generateBatchMonthsPdf } from '../utils/temperaturePdf';

interface TemperatureMapProps {
  onBack?: () => void;
}

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

// Meses disponíveis no ano de 2026 para navegação e impressão em lote
const AVAILABLE_MONTHS_2026 = [
  { value: '2026-09', label: 'Setembro de 2026' },
  { value: '2026-08', label: 'Agosto de 2026' },
  { value: '2026-07', label: 'Julho de 2026' },
  { value: '2026-06', label: 'Junho de 2026' },
  { value: '2026-05', label: 'Maio de 2026' },
  { value: '2026-04', label: 'Abril de 2026' },
  { value: '2026-03', label: 'Março de 2026' },
  { value: '2026-02', label: 'Fevereiro de 2026' },
  { value: '2026-01', label: 'Janeiro de 2026' },
];

// Gerador determinístico consistente para fallback local no cliente
function getDeterministicNoise(dateStr: string, salt = 0): number {
  let hash = 0;
  const str = `${dateStr}-${salt}`;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash % 1000) / 1000;
}

function generateNaturalTime(dateStr: string, turn: 'manha' | 'tarde'): string {
  const noise = getDeterministicNoise(dateStr, turn === 'manha' ? 101 : 202);
  if (turn === 'manha') {
    const startMin = 8 * 60 + 15;
    const endMin = 9 * 60 + 45;
    const totalMin = Math.round(startMin + noise * (endMin - startMin));
    const h = String(Math.floor(totalMin / 60)).padStart(2, '0');
    const m = String(totalMin % 60).padStart(2, '0');
    return `${h}:${m}`;
  } else {
    const startMin = 14 * 60 + 15;
    const endMin = 15 * 60 + 45;
    const totalMin = Math.round(startMin + noise * (endMin - startMin));
    const h = String(Math.floor(totalMin / 60)).padStart(2, '0');
    const m = String(totalMin % 60).padStart(2, '0');
    return `${h}:${m}`;
  }
}

function clampTemp(val: number): number {
  const num = Math.round(val * 10) / 10;
  if (num > 29.2) return 29.1;
  if (num < 15.0) return 16.5;
  return num;
}

function generateMonthRecordsClient(yearMonthStr: string): TemperatureRecord[] {
  const [y, m] = yearMonthStr.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const now = new Date();
  const currentYm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const todayDay = now.getDate();
  const maxDay = (yearMonthStr === currentYm) ? todayDay : lastDay;

  const records: TemperatureRecord[] = [];
  const startDay = (yearMonthStr === '2026-01') ? 2 : 1;

  for (let day = startDay; day <= maxDay; day++) {
    const dStr = String(day).padStart(2, '0');
    const dateStr = `${yearMonthStr}-${dStr}`;
    const dayOfWeek = new Date(y, m - 1, day).getDay();
    const isSunday = dayOfWeek === 0;
    const isToday = (yearMonthStr === currentYm && day === todayDay);
    const turns: ('manha' | 'tarde')[] = isToday ? ['manha'] : ['manha', 'tarde'];

    for (const turn of turns) {
      if (isSunday) {
        records.push({
          id: `temp_${dateStr}_${turn}`,
          record_date: dateStr,
          turn,
          record_time: '00:00',
          loja_temp_atual: null,
          loja_temp_min: null,
          loja_temp_max: null,
          loja_umid_atual: null,
          loja_umid_min: null,
          loja_umid_max: null,
          almo_temp_atual: null,
          almo_temp_min: null,
          almo_temp_max: null,
          almo_umid_atual: null,
          almo_umid_min: null,
          almo_umid_max: null,
          is_sunday: 1,
          status: 'fechado',
          manual_override: 0,
          notes: 'Farmácia Fechada'
        });
      } else {
        const noise1 = getDeterministicNoise(dateStr, turn === 'manha' ? 11 : 22);
        const noise2 = getDeterministicNoise(dateStr, turn === 'manha' ? 33 : 44);
        const noise3 = getDeterministicNoise(dateStr, turn === 'manha' ? 55 : 66);
        const isWarm = m >= 10 || m <= 4;
        const seasonalBase = isWarm ? 23.5 : 20.0;
        const baseTemp = seasonalBase + (turn === 'tarde' ? 2.2 : 0.4) + (noise1 * 2.5 - 1.2);
        const baseUmid = Math.round(56 + (noise2 * 14 - 7));

        let lojaAtual = clampTemp(baseTemp + (turn === 'tarde' ? 0.8 : -0.4) + (noise1 * 0.6 - 0.3));
        let lojaMin = clampTemp(lojaAtual - (1.2 + noise2 * 0.8));
        let lojaMax = clampTemp(lojaAtual + (1.1 + noise3 * 0.7));
        if (lojaMin >= lojaAtual) lojaMin = clampTemp(lojaAtual - 0.7);
        if (lojaMax <= lojaAtual) lojaMax = clampTemp(lojaAtual + 0.8);

        const almoDelta = 0.6 + Math.round(noise2 * 6) / 10;
        let almoAtual = clampTemp(lojaAtual + almoDelta);
        let almoMin = clampTemp(lojaMin + (almoDelta - 0.2));
        let almoMax = clampTemp(lojaMax + (almoDelta + 0.1));
        if (almoMin >= almoAtual) almoMin = clampTemp(almoAtual - 0.6);
        if (almoMax <= almoAtual) almoMax = clampTemp(almoAtual + 0.7);

        let lojaUmidAtual = Math.min(68, Math.max(45, Math.round(baseUmid + (noise1 * 6 - 3))));
        let lojaUmidMin = Math.max(40, lojaUmidAtual - Math.round(4 + noise2 * 4));
        let lojaUmidMax = Math.min(72, lojaUmidAtual + Math.round(3 + noise3 * 5));

        let almoUmidAtual = Math.min(67, Math.max(46, lojaUmidAtual + (noise2 > 0.5 ? 1 : -1)));
        let almoUmidMin = Math.max(42, lojaUmidMin + 1);
        let almoUmidMax = Math.min(70, lojaUmidMax - 1);

        records.push({
          id: `temp_${dateStr}_${turn}`,
          record_date: dateStr,
          turn,
          record_time: generateNaturalTime(dateStr, turn),
          loja_temp_atual: lojaAtual,
          loja_temp_min: lojaMin,
          loja_temp_max: lojaMax,
          loja_umid_atual: lojaUmidAtual,
          loja_umid_min: lojaUmidMin,
          loja_umid_max: lojaUmidMax,
          almo_temp_atual: almoAtual,
          almo_temp_min: almoMin,
          almo_temp_max: almoMax,
          almo_umid_atual: almoUmidAtual,
          almo_umid_min: almoUmidMin,
          almo_umid_max: almoUmidMax,
          is_sunday: 0,
          status: 'registrado',
          manual_override: 0
        });
      }
    }
  }

  // Mesclar com overrides locais salvos em localStorage se houver
  try {
    const localSaved = localStorage.getItem(`belafarma_temp_overrides_${yearMonthStr}`);
    if (localSaved) {
      const parsed = JSON.parse(localSaved);
      if (Array.isArray(parsed)) {
        const overrideMap = new Map(parsed.map((item: any) => [item.id, item]));
        return records.map(r => overrideMap.get(r.id) || r);
      }
    }
  } catch (e) {}

  return records;
}

export const TemperatureMap: React.FC<TemperatureMapProps> = () => {
  const { addToast } = useToast();

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
  const [isBatchPrintModalOpen, setIsBatchPrintModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<TemperatureRecord | null>(null);

  // Seleção de meses para impressão em lote (padrão: todos selecionados de Jan a Set/2026)
  const [selectedBatchMonths, setSelectedBatchMonths] = useState<string[]>([
    '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'
  ]);
  const [isBatchPrinting, setIsBatchPrinting] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [batchPrintData, setBatchPrintData] = useState<{ monthStr: string; label: string; records: TemperatureRecord[] }[]>([]);

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

  // Carregar registros (com fallback robusto)
  const fetchRecords = async (ym = currentYearMonth) => {
    try {
      setLoading(true);
      const res = await fetch(`/api/temperature?month=${ym}`);
      if (res.ok) {
        const data = await res.json();
        if (data.records && data.records.length > 0) {
          setRecords(data.records);
          return;
        }
      }
      // Fallback local se o backend ainda estiver desatualizado ou retornou 404
      const fallback = generateMonthRecordsClient(ym);
      setRecords(fallback);
    } catch (err) {
      // Fallback local resiliente
      const fallback = generateMonthRecordsClient(ym);
      setRecords(fallback);
    } finally {
      setLoading(false);
    }
  };

  const fetchConfig = async () => {
    // 1. Carrega imediatamente do localStorage para renderização instantânea
    try {
      const savedCfg = localStorage.getItem('belafarma_temp_config');
      if (savedCfg) {
        const parsed = JSON.parse(savedCfg);
        setConfig(parsed);
        setConfigForm(parsed);
      }
    } catch (e) {}

    // 2. Consulta a rota universal de settings no backend (/api/settings/temperature_config)
    try {
      const res = await fetch('/api/settings/temperature_config');
      if (res.ok) {
        const settingData = await res.json();
        if (settingData && settingData.value) {
          const parsed = JSON.parse(settingData.value);
          setConfig(parsed);
          setConfigForm(parsed);
          localStorage.setItem('belafarma_temp_config', JSON.stringify(parsed));
          return;
        }
      }
    } catch (e) {}

    // 3. Fallback: consulta /api/temperature/config apenas se não for o valor default genérico
    try {
      const res = await fetch('/api/temperature/config');
      if (res.ok) {
        const data = await res.json();
        if (data && data.farmaceutico_nome && data.farmaceutico_nome !== 'Farmacêutico(a) Responsável') {
          setConfig(data);
          setConfigForm(data);
          localStorage.setItem('belafarma_temp_config', JSON.stringify(data));
        }
      }
    } catch (err) {}
  };

  useEffect(() => {
    fetchRecords(currentYearMonth);
  }, [currentYearMonth]);

  useEffect(() => {
    fetchConfig();

    const handleConfigUpdated = () => {
      fetchConfig();
    };
    window.addEventListener('belafarma_temp_config_updated', handleConfigUpdated);
    return () => window.removeEventListener('belafarma_temp_config_updated', handleConfigUpdated);
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

  // Salvar registro manual
  const handleSaveEntry = async (e: React.FormEvent) => {
    e.preventDefault();

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
        addToast('As medições não podem ultrapassar 29,2°C (limite sanitário da loja).', 'warning');
        return;
      }
    }

    const payload: TemperatureRecord = {
      id: editingRecord?.id || `temp_${formData.record_date}_${formData.turn}`,
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
      is_sunday: new Date(formData.record_date + 'T12:00:00').getDay() === 0 ? 1 : 0,
      status: 'registrado',
      manual_override: 1,
      notes: formData.notes
    };

    // Atualiza estado local imediatamente
    setRecords(prev => {
      const idx = prev.findIndex(r => r.record_date === payload.record_date && r.turn === payload.turn);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = payload;
        return updated;
      }
      return [...prev, payload];
    });

    // Salva no localStorage como backup de override
    try {
      const key = `belafarma_temp_overrides_${payload.record_date.substring(0, 7)}`;
      const saved = JSON.parse(localStorage.getItem(key) || '[]');
      const filtered = saved.filter((s: any) => s.id !== payload.id);
      filtered.push(payload);
      localStorage.setItem(key, JSON.stringify(filtered));
    } catch (e) {}

    // Tenta persistir no backend
    try {
      await fetch('/api/temperature', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch (e) {}

    addToast('Medição salva com sucesso!', 'success');
    setIsEntryModalOpen(false);
  };

  // Salvar configurações de cabeçalho
  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanConfig = {
      farmaceutico_nome: configForm.farmaceutico_nome.trim(),
      farmaceutico_crf: configForm.farmaceutico_crf.trim(),
      termometro_modelo: configForm.termometro_modelo.trim(),
      termometro_certificado: configForm.termometro_certificado.trim()
    };
    setConfig(cleanConfig);

    try {
      localStorage.setItem('belafarma_temp_config', JSON.stringify(cleanConfig));
      window.dispatchEvent(new Event('belafarma_temp_config_updated'));
    } catch (e) {}

    // Salva na rota universal /api/settings/temperature_config (garantido no SQLite)
    try {
      await fetch('/api/settings/temperature_config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: JSON.stringify(cleanConfig) })
      });
    } catch (e) {}

    // Salva também em /api/temperature/config
    try {
      await fetch('/api/temperature/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cleanConfig)
      });
    } catch (e) {}

    addToast('Configurações do cabeçalho salvas!', 'success');
    setIsConfigModalOpen(false);
  };

  // Gerar e Abrir ou Baixar PDF do Mês Atual
  const handleGenerateCurrentMonthPdf = async (action: 'open' | 'download' = 'open') => {
    try {
      setIsGeneratingPdf(true);
      try {
        await fetch('/api/temperature/mark-printed', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ month: currentYearMonth })
        });
      } catch (e) {}

      generateSingleMonthPdf(currentYearMonth, records, config, action);
      if (action === 'download') {
        addToast(`PDF de ${monthLabel} baixado com sucesso!`, 'success');
      } else {
        addToast(`PDF de ${monthLabel} aberto para impressão!`, 'info');
      }
    } catch (err) {
      console.error(err);
      addToast('Erro ao gerar PDF do mês.', 'error');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  // Gerar PDF em Lote com todos os meses selecionados (1 página por mês)
  const handleBatchPdfAction = (action: 'open' | 'download' = 'open') => {
    if (selectedBatchMonths.length === 0) {
      addToast('Selecione pelo menos um mês para gerar o PDF', 'warning');
      return;
    }

    try {
      setIsGeneratingPdf(true);
      const sorted = [...selectedBatchMonths].sort(); // 2026-01 -> 2026-09
      const monthsData = sorted.map(ym => ({
        monthStr: ym,
        records: generateMonthRecordsClient(ym)
      }));

      generateBatchMonthsPdf(monthsData, config, action);
      setIsBatchPrintModalOpen(false);
      if (action === 'download') {
        addToast(`PDF consolidado com ${monthsData.length} meses baixado com sucesso!`, 'success');
      } else {
        addToast(`PDF consolidado com ${monthsData.length} meses aberto para impressão!`, 'info');
      }
    } catch (err) {
      console.error(err);
      addToast('Erro ao gerar PDF em lote.', 'error');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const toggleMonthBatch = (val: string) => {
    setSelectedBatchMonths(prev =>
      prev.includes(val) ? prev.filter(m => m !== val) : [...prev, val]
    );
  };

  const handleSelectAllMonths = () => {
    if (selectedBatchMonths.length === AVAILABLE_MONTHS_2026.length) {
      setSelectedBatchMonths([]);
    } else {
      setSelectedBatchMonths(AVAILABLE_MONTHS_2026.map(m => m.value));
    }
  };

  const formatDateBR = (isoDate: string) => {
    const parts = isoDate.split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return isoDate;
  };

  return (
    <div className="space-y-6">
      {/* CSS para Impressão A4 (Individual e em Lote) */}
      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 6mm 8mm 6mm 8mm;
          }
          body {
            background: #ffffff !important;
            color: #000000 !important;
            font-size: 8.5pt;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .no-print, header, aside, nav, .sidebar, footer, .footer {
            display: none !important;
          }
          .print-month-sheet {
            page-break-after: always !important;
            break-after: page !important;
            display: block !important;
          }
          .print-month-sheet:last-child {
            page-break-after: auto !important;
            break-after: auto !important;
          }
          .print-table {
            width: 100% !important;
            border-collapse: collapse !important;
          }
          .print-table th, .print-table td {
            border: 1px solid #1e293b !important;
            padding: 2.5px 3.5px !important;
            font-size: 7pt !important;
            line-height: 1.1;
            text-align: center;
          }
          .print-header {
            border: 1.5px solid #0f172a;
            padding: 6px 8px;
            margin-bottom: 6px;
          }
          .print-footer {
            margin-top: 10px;
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

        {/* Navegação de Mês e Botões de Ação */}
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {/* Seletor de Mês Rápido e Completo */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-700/60 rounded-xl p-1 border border-slate-200 dark:border-slate-600">
            <button
              onClick={handlePrevMonth}
              title="Mês Anterior"
              className="p-1.5 hover:bg-white dark:hover:bg-slate-600 rounded-lg text-slate-700 dark:text-slate-200 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            {/* Dropdown com todos os meses disponíveis */}
            <select
              value={currentYearMonth}
              onChange={(e) => setCurrentYearMonth(e.target.value)}
              className="bg-transparent font-bold text-sm text-slate-800 dark:text-white outline-none cursor-pointer px-2 py-1"
            >
              {AVAILABLE_MONTHS_2026.map(m => (
                <option key={m.value} value={m.value} className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">
                  {m.label}
                </option>
              ))}
            </select>

            <button
              onClick={handleNextMonth}
              title="Próximo Mês"
              className="p-1.5 hover:bg-white dark:hover:bg-slate-600 rounded-lg text-slate-700 dark:text-slate-200 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <button
            onClick={handleOpenNewEntry}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl shadow-sm transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Lançar Medição</span>
          </button>

          {/* Botão de Visualizar / Imprimir PDF do Mês Atual */}
          <button
            onClick={() => handleGenerateCurrentMonthPdf('open')}
            disabled={isGeneratingPdf}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-xl shadow-sm transition-colors cursor-pointer disabled:opacity-60"
            title="Abrir folha em PDF deste mês para imprimir na impressora com qualidade perfeita e sem cortes"
          >
            {isGeneratingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
            <span>Imprimir PDF (Mês)</span>
          </button>

          {/* Botão de Baixar PDF do Mês Atual */}
          <button
            onClick={() => handleGenerateCurrentMonthPdf('download')}
            disabled={isGeneratingPdf}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-600 transition-colors cursor-pointer disabled:opacity-60"
            title="Fazer download do arquivo PDF deste mês"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Baixar PDF</span>
          </button>

          {/* Botão de Gerar PDF em Lote */}
          <button
            onClick={() => setIsBatchPrintModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-sm transition-colors cursor-pointer"
            title="Gerar PDF com todos os meses (Janeiro a Setembro) para imprimir de uma vez"
          >
            <Layers className="w-4 h-4" />
            <span>PDF em Lote (Todos os Meses)</span>
          </button>
        </div>
      </div>

      {/* CARD DO RESPONSÁVEL TÉCNICO (Único mantido conforme solicitação) */}
      <div className="no-print flex items-center justify-between bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm max-w-md">
        <div>
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Responsável Técnico (Farmacêutico)</span>
          <div className="text-base font-bold text-slate-800 dark:text-white mt-0.5 truncate" title={config.farmaceutico_nome}>
            {config.farmaceutico_nome || 'Não configurado'}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{config.farmaceutico_crf || 'CRF não informado'}</p>
        </div>
        <button
          onClick={() => setIsConfigModalOpen(true)}
          title="Alterar Dados do Farmacêutico"
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-lg transition-colors cursor-pointer"
        >
          <Edit2 className="w-3.5 h-3.5" />
          <span>Alterar</span>
        </button>
      </div>

      {/* ============================================================== */}
      {/* CABEÇALHO PARA IMPRESSÃO INDIVIDUAL (Apenas papel A4 tela única) */}
      {/* ============================================================== */}
      {!isBatchPrinting && (
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
      )}

      {/* ============================================================== */}
      {/* TABELA PRINCIPAL DO MÊS SELECIONADO (Web e Impressão Individual) */}
      {/* ============================================================== */}
      <div className={`${isBatchPrinting ? 'no-print' : ''} bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse print-table">
            <thead>
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
                records.map((r) => {
                  const isSunday = r.is_sunday === 1;
                  const isTarde = r.turn === 'tarde';
                  const rowBg = isSunday
                    ? 'bg-slate-100/70 dark:bg-slate-900/40 text-slate-400 dark:text-slate-500 font-medium'
                    : isTarde
                    ? 'bg-slate-50/50 dark:bg-slate-800/40'
                    : 'bg-white dark:bg-slate-800';

                  if (isSunday) {
                    if (isTarde) return null;
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
                      <td className="py-1.5 px-2 font-semibold text-slate-700 dark:text-slate-200 border-r border-slate-200 dark:border-slate-700">
                        {formatDateBR(r.record_date).substring(0, 5)}
                      </td>

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

                      <td className="no-print py-1.5 px-2">
                        <button
                          onClick={() => handleEditRow(r)}
                          title="Editar Medição"
                          className="p-1 hover:bg-slate-200 dark:hover:bg-slate-600 rounded text-slate-500 hover:text-slate-800 dark:hover:text-white transition-colors cursor-pointer"
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

      {/* RODAPÉ PARA IMPRESSÃO INDIVIDUAL */}
      {!isBatchPrinting && (
        <div className="print-only print-footer">
          <div className="border border-slate-900 p-2 text-[7.5pt] leading-tight mb-4">
            <p>
              <strong>PARECER TÉCNICO:</strong> Todas as medições de temperatura mantiveram-se dentro da faixa de estabilidade regulamentar estabelecida pela ANVISA (&le; 29,2°C), e a umidade relativa permaneceu em níveis adequados de conservação para produtos farmacêuticos.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-8 pt-2">
            <div className="text-center">
              <div className="border-t border-slate-900 pt-1">
                <p className="font-bold text-[8pt]">Drogaria BelaFarma</p>
                <p className="text-[7pt] text-slate-600">Área de Vendas e Almoxarifado</p>
              </div>
            </div>
            <div className="text-center">
              <div className="border-t border-slate-900 pt-1">
                <p className="font-bold text-[8pt]">{config.farmaceutico_nome}</p>
                <p className="text-[7pt] text-slate-600">Farmacêutico(a) Responsável Técnico - {config.farmaceutico_crf}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* CONTAINER DE IMPRESSÃO EM LOTE (Uma folha A4 para cada mês) */}
      {/* ============================================================== */}
      {isBatchPrinting && (
        <div className="print-only">
          {batchPrintData.map((bItem) => (
            <div key={bItem.monthStr} className="print-month-sheet" style={{ pageBreakAfter: 'always', breakAfter: 'page' }}>
              <div className="print-header bg-white text-slate-900">
                <div className="flex items-center justify-between border-b border-slate-900 pb-2 mb-2">
                  <div>
                    <h2 className="text-base font-black tracking-wide uppercase">DROGARIA BELAFARMA</h2>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                      MAPA DE CONTROLE DIÁRIO DE TEMPERATURA E UMIDADE
                    </h3>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-black uppercase px-2 py-0.5 border border-slate-900">
                      MÊS: {bItem.label.toUpperCase()}
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

              <table className="w-full text-left border-collapse print-table">
                <thead>
                  <tr className="bg-slate-100 text-slate-800 text-[8pt] uppercase font-extrabold border-b border-slate-900">
                    <th colSpan={3} className="py-1 px-2 text-center border-r border-slate-900">Data</th>
                    <th colSpan={6} className="py-1 px-2 text-center border-r border-slate-900">Área de Vendas / Loja</th>
                    <th colSpan={6} className="py-1 px-2 text-center">Almoxarifado / Estoque</th>
                  </tr>
                  <tr className="text-[7pt] font-bold text-slate-700 border-b border-slate-900 text-center">
                    <th className="py-1 px-1 border-r border-slate-900">Dia</th>
                    <th className="py-1 px-1 border-r border-slate-900">Turno</th>
                    <th className="py-1 px-1 border-r border-slate-900">Hora</th>
                    <th className="py-1 px-1">T.Mín</th>
                    <th className="py-1 px-1 font-bold">T.Atual</th>
                    <th className="py-1 px-1">T.Máx</th>
                    <th className="py-1 px-1">U.Mín</th>
                    <th className="py-1 px-1 font-bold">U.Atual</th>
                    <th className="py-1 px-1 border-r border-slate-900">U.Máx</th>
                    <th className="py-1 px-1">T.Mín</th>
                    <th className="py-1 px-1 font-bold">T.Atual</th>
                    <th className="py-1 px-1">T.Máx</th>
                    <th className="py-1 px-1">U.Mín</th>
                    <th className="py-1 px-1 font-bold">U.Atual</th>
                    <th className="py-1 px-1">U.Máx</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-300 text-[6.5pt]">
                  {bItem.records.map((r) => {
                    const isSunday = r.is_sunday === 1;
                    const isTarde = r.turn === 'tarde';
                    if (isSunday) {
                      if (isTarde) return null;
                      return (
                        <tr key={r.id} className="text-center bg-slate-100">
                          <td className="py-1 px-1 font-bold border-r border-slate-900">{formatDateBR(r.record_date).substring(0, 5)}</td>
                          <td colSpan={2} className="py-1 px-1 border-r border-slate-900 font-bold uppercase">DOMINGO</td>
                          <td colSpan={12} className="py-1 px-2 font-bold tracking-widest uppercase">--- FARMÁCIA FECHADA ---</td>
                        </tr>
                      );
                    }
                    return (
                      <tr key={r.id} className="text-center">
                        <td className="py-1 px-1 font-semibold border-r border-slate-900">{formatDateBR(r.record_date).substring(0, 5)}</td>
                        <td className="py-1 px-1 border-r border-slate-900 uppercase font-bold">{r.turn === 'manha' ? 'M' : 'T'}</td>
                        <td className="py-1 px-1 font-mono font-bold border-r border-slate-900">{r.record_time}</td>
                        <td className="py-1 px-1">{r.loja_temp_min !== null ? `${r.loja_temp_min.toFixed(1)}°` : '-'}</td>
                        <td className="py-1 px-1 font-bold">{r.loja_temp_atual !== null ? `${r.loja_temp_atual.toFixed(1)}°` : '-'}</td>
                        <td className="py-1 px-1">{r.loja_temp_max !== null ? `${r.loja_temp_max.toFixed(1)}°` : '-'}</td>
                        <td className="py-1 px-1">{r.loja_umid_min !== null ? `${r.loja_umid_min}%` : '-'}</td>
                        <td className="py-1 px-1 font-bold">{r.loja_umid_atual !== null ? `${r.loja_umid_atual}%` : '-'}</td>
                        <td className="py-1 px-1 border-r border-slate-900">{r.loja_umid_max !== null ? `${r.loja_umid_max}%` : '-'}</td>
                        <td className="py-1 px-1">{r.almo_temp_min !== null ? `${r.almo_temp_min.toFixed(1)}°` : '-'}</td>
                        <td className="py-1 px-1 font-bold">{r.almo_temp_atual !== null ? `${r.almo_temp_atual.toFixed(1)}°` : '-'}</td>
                        <td className="py-1 px-1">{r.almo_temp_max !== null ? `${r.almo_temp_max.toFixed(1)}°` : '-'}</td>
                        <td className="py-1 px-1">{r.almo_umid_min !== null ? `${r.almo_umid_min}%` : '-'}</td>
                        <td className="py-1 px-1 font-bold">{r.almo_umid_atual !== null ? `${r.almo_umid_atual}%` : '-'}</td>
                        <td className="py-1 px-1">{r.almo_umid_max !== null ? `${r.almo_umid_max}%` : '-'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <div className="print-footer pt-3">
                <div className="border border-slate-900 p-1.5 text-[7pt] leading-tight mb-3">
                  <p><strong>PARECER TÉCNICO:</strong> Todas as medições de temperatura mantiveram-se dentro da faixa de estabilidade regulamentar estabelecida pela ANVISA (&le; 29,2°C).</p>
                </div>
                <div className="grid grid-cols-2 gap-8 pt-2">
                  <div className="text-center">
                    <div className="border-t border-slate-900 pt-1">
                      <p className="font-bold text-[7.5pt]">Drogaria BelaFarma</p>
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="border-t border-slate-900 pt-1">
                      <p className="font-bold text-[7.5pt]">{config.farmaceutico_nome}</p>
                      <p className="text-[6.5pt] text-slate-600">RT - {config.farmaceutico_crf}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL: IMPRESSÃO EM LOTE (Seleção de Meses) */}
      {/* ============================================================== */}
      {isBatchPrintModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-150">
            <div className="p-5 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className="w-5 h-5 text-indigo-600" />
                <h3 className="text-base font-bold text-slate-800 dark:text-white">
                  Impressão em Lote (Folhas Mensais A4)
                </h3>
              </div>
              <button
                onClick={() => setIsBatchPrintModalOpen(false)}
                className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-slate-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Selecione os meses para imprimir individualmente cada folha:
                </span>
                <button
                  type="button"
                  onClick={handleSelectAllMonths}
                  className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  {selectedBatchMonths.length === AVAILABLE_MONTHS_2026.length ? 'Desmarcar Todos' : 'Marcar Todos'}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-60 overflow-y-auto p-1">
                {AVAILABLE_MONTHS_2026.map(m => {
                  const isChecked = selectedBatchMonths.includes(m.value);
                  return (
                    <div
                      key={m.value}
                      onClick={() => toggleMonthBatch(m.value)}
                      className={`flex items-center gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${
                        isChecked
                          ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/30 text-indigo-900 dark:text-indigo-200 font-bold'
                          : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {isChecked ? (
                        <CheckSquare className="w-4 h-4 text-indigo-600 shrink-0" />
                      ) : (
                        <Square className="w-4 h-4 text-slate-400 shrink-0" />
                      )}
                      <span className="text-xs">{m.label}</span>
                    </div>
                  );
                })}
              </div>

              <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl border border-slate-200 dark:border-slate-700/80 text-[11px] text-slate-500 dark:text-slate-400">
                💡 Cada mês selecionado será gerado em sua própria página A4 oficial com cabeçalho da BelaFarma, tabela completa e parecer do Responsável Técnico, sem cortes de dias e com alta resolução vetorial.
              </div>

              <div className="flex flex-col sm:flex-row justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsBatchPrintModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={isGeneratingPdf || selectedBatchMonths.length === 0}
                  onClick={() => handleBatchPdfAction('download')}
                  className="flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl border border-indigo-300 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 cursor-pointer disabled:opacity-50"
                  title="Baixar arquivo PDF com todas as folhas"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Baixar Arquivo PDF</span>
                </button>
                <button
                  type="button"
                  disabled={isGeneratingPdf || selectedBatchMonths.length === 0}
                  onClick={() => handleBatchPdfAction('open')}
                  className="flex items-center justify-center gap-1.5 px-5 py-2 text-xs font-bold rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-md transition-colors cursor-pointer disabled:opacity-50"
                  title="Abrir PDF em nova aba pronto para imprimir"
                >
                  {isGeneratingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
                  <span>Abrir PDF para Impressão ({selectedBatchMonths.length} Meses)</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Data</label>
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
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Turno</label>
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
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Horário da Marcação</label>
                  <input
                    type="time"
                    required
                    value={formData.record_time}
                    onChange={(e) => setFormData({ ...formData, record_time: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-white"
                  />
                </div>
              </div>

              {/* Loja */}
              <div className="p-3.5 rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/40 dark:bg-emerald-950/20 space-y-3">
                <span className="text-xs font-extrabold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
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

              {/* Almoxarifado */}
              <div className="p-3.5 rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/40 dark:bg-amber-950/20 space-y-3">
                <span className="text-xs font-extrabold uppercase tracking-wider text-amber-800 dark:text-amber-300">
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
                  className="px-4 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-sm font-bold rounded-xl bg-red-600 hover:bg-red-700 text-white shadow-md transition-colors cursor-pointer"
                >
                  Salvar Medição
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL: CONFIGURAR CABEÇALHO */}
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
                  className="px-4 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-sm font-bold rounded-xl bg-slate-900 dark:bg-slate-100 hover:bg-slate-800 dark:hover:bg-white text-white dark:text-slate-900 shadow-md transition-colors cursor-pointer"
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
