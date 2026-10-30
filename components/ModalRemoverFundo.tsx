import React, { useState, useEffect, useRef } from 'react';
import {
  Scissors,
  X,
  Check,
  RefreshCw,
  Download,
  Sliders,
  Sparkles,
  AlertCircle
} from 'lucide-react';
import { recortarFundo } from './encarteTemplates';
import { ItemLiquidacaoArte } from './LiquidacaoEncarteArtes';

interface ModalRemoverFundoProps {
  item: ItemLiquidacaoArte | null;
  onClose: () => void;
  onSucesso: (novaUrl: string) => void;
}

export const ModalRemoverFundo: React.FC<ModalRemoverFundoProps> = ({
  item,
  onClose,
  onSucesso
}) => {
  const [sensibilidade, setSensibilidade] = useState<number>(25);
  const [processando, setProcessando] = useState<boolean>(false);
  const [salvando, setSalvando] = useState<boolean>(false);
  const [previewRecortado, setPreviewRecortado] = useState<string>('');
  const [erro, setErro] = useState<string | null>(null);

  // Executa o recorte com o valor de sensibilidade
  const executarRecorte = async (sens: number) => {
    if (!item?.imagem_url) return;
    setProcessando(true);
    setErro(null);
    try {
      const resultado = await recortarFundo(item.imagem_url, sens);
      if (resultado && resultado.startsWith('data:image/png')) {
        setPreviewRecortado(resultado);
      } else {
        setPreviewRecortado(resultado);
        setErro('O fundo não pôde ser destacado automaticamente (pode ser que já esteja transparente ou não tenha bordas claras contínuas).');
      }
    } catch (e: any) {
      setErro('Erro ao processar imagem: ' + (e.message || 'Falha de carregamento'));
    } finally {
      setProcessando(false);
    }
  };

  useEffect(() => {
    if (item?.imagem_url) {
      executarRecorte(sensibilidade);
    }
  }, [item?.imagem_url]);

  // Debounce para o slider de sensibilidade
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const handleMudarSensibilidade = (novaSens: number) => {
    setSensibilidade(novaSens);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      executarRecorte(novaSens);
    }, 250);
  };

  const handleSalvarRecorte = async () => {
    if (!item || !previewRecortado) return;
    setSalvando(true);
    try {
      const res = await fetch('/api/liquidacao/salvar-imagem-manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          produto_id: item.produto_id,
          imagem_base64: previewRecortado
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        onSucesso(data.imagem_url);
        onClose();
      } else {
        alert(data.error || 'Erro ao salvar imagem recortada.');
      }
    } catch (e: any) {
      alert('Erro de conexão ao salvar imagem: ' + e.message);
    } finally {
      setSalvando(false);
    }
  };

  const handleBaixarPng = () => {
    if (!previewRecortado || !item) return;
    const a = document.createElement('a');
    a.href = previewRecortado;
    a.download = `recorte_${item.produto_id}_${item.descricao.substring(0, 20)}.png`;
    a.click();
  };

  if (!item) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-2xl overflow-hidden space-y-4 p-6">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-2xl bg-orange-100 dark:bg-orange-950 text-orange-600 dark:text-orange-400">
              <Scissors size={20} />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                Removedor de Fundo da Embalagem (PNG Transparente)
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-md">
                #{item.produto_id} • {item.descricao}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Comparação Antes e Depois */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Lado 1: Original */}
          <div className="space-y-1.5 text-center">
            <span className="text-[11px] font-black text-slate-500 uppercase tracking-wider block">
              1. Imagem Original
            </span>
            <div className="h-60 rounded-2xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-3 flex items-center justify-center overflow-hidden">
              <img
                src={item.imagem_url}
                alt="Original"
                className="max-h-full max-w-full object-contain"
              />
            </div>
          </div>

          {/* Lado 2: Recortada com padrão xadrez/checkerboard */}
          <div className="space-y-1.5 text-center">
            <div className="flex items-center justify-between px-1">
              <span className="text-[11px] font-black text-orange-600 dark:text-orange-400 uppercase tracking-wider flex items-center gap-1">
                <Sparkles size={12} />
                2. Fundo Transparente
              </span>
              {processando && (
                <span className="text-[10px] text-orange-500 font-bold flex items-center gap-1 animate-pulse">
                  <RefreshCw size={10} className="animate-spin" />
                  Recortando...
                </span>
              )}
            </div>
            <div
              className="h-60 rounded-2xl border-2 border-orange-400/80 p-3 flex items-center justify-center overflow-hidden relative"
              style={{
                backgroundImage: `linear-gradient(45deg, #e2e8f0 25%, transparent 25%), linear-gradient(-45deg, #e2e8f0 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e2e8f0 75%), linear-gradient(-45deg, transparent 75%, #e2e8f0 75%)`,
                backgroundSize: '16px 16px',
                backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
                backgroundColor: '#ffffff'
              }}
            >
              {previewRecortado ? (
                <img
                  src={previewRecortado}
                  alt="Recortado"
                  className="max-h-full max-w-full object-contain drop-shadow-md"
                />
              ) : (
                <span className="text-xs text-slate-400">Processando recorte...</span>
              )}
            </div>
          </div>
        </div>

        {/* Ajuste Fino de Sensibilidade / Tolerância */}
        <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-xs font-black text-slate-700 dark:text-slate-300">
            <span className="flex items-center gap-1.5">
              <Sliders size={14} className="text-orange-500" />
              Tolerância / Sensibilidade do Recorte:
            </span>
            <span className="font-mono text-orange-600 font-black">{sensibilidade}%</span>
          </div>
          <input
            type="range"
            min="10"
            max="55"
            step="1"
            value={sensibilidade}
            onChange={e => handleMudarSensibilidade(parseInt(e.target.value))}
            className="w-full accent-orange-600 cursor-pointer"
          />
          <div className="flex justify-between text-[10px] text-slate-400 font-bold">
            <span>Mais Suave (Preserva detalhes claros)</span>
            <span>Mais Agressivo (Remove sombras e fundos cinzas)</span>
          </div>
        </div>

        {erro && (
          <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-xs flex items-center gap-2">
            <AlertCircle size={14} className="shrink-0" />
            <span>{erro}</span>
          </div>
        )}

        {/* Rodapé e Ações */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
          <button
            type="button"
            onClick={handleBaixarPng}
            disabled={!previewRecortado || processando}
            className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            title="Baixar cópia PNG transparente para o seu computador"
          >
            <Download size={13} />
            <span>Baixar PNG</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-bold cursor-pointer"
            >
              Cancelar
            </button>

            <button
              type="button"
              onClick={handleSalvarRecorte}
              disabled={salvando || processando || !previewRecortado}
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 text-white text-xs font-black flex items-center gap-2 shadow-md shadow-orange-500/20 cursor-pointer disabled:opacity-50 active:scale-95 transition-all"
            >
              {salvando ? <RefreshCw size={13} className="animate-spin" /> : <Check size={14} />}
              <span>{salvando ? 'Salvando Foto...' : 'Salvar como Foto Oficial'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
