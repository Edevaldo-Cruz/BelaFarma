import React, { useEffect, useState, useCallback } from 'react';
import { ClipboardList, RefreshCw, AlertTriangle } from 'lucide-react';
import { useToast } from '../ToastContext';

interface Pedido {
  id: string;
  distribuidora: string;
  status: string;
  total: number;
  qtd_itens: number;
  qtd_unidades: number;
  prazo_previsto: string | null;
  nf: string | null;
  created_at: string;
}

const STATUS_LABEL: Record<string, string> = {
  RASCUNHO: 'Rascunho',
  CARRINHO_GERADO: 'Carrinho gerado',
  FINALIZADO_PELO_USUARIO: 'Finalizado por você',
  FATURADO: 'Faturado',
  RECEBIDO: 'Recebido',
  CANCELADO: 'Cancelado'
};

const STATUS_COR: Record<string, string> = {
  CARRINHO_GERADO: 'bg-amber-900/40 text-amber-300 border-amber-700',
  FINALIZADO_PELO_USUARIO: 'bg-blue-900/40 text-blue-300 border-blue-700',
  FATURADO: 'bg-cyan-900/40 text-cyan-300 border-cyan-700',
  RECEBIDO: 'bg-emerald-900/40 text-emerald-300 border-emerald-700',
  CANCELADO: 'bg-slate-800 text-slate-400 border-slate-700',
  RASCUNHO: 'bg-slate-800 text-slate-300 border-slate-700'
};

const brl = (v: number) => 'R$ ' + (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });

const PedidosTab: React.FC = () => {
  const { addToast } = useToast();
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [totais, setTotais] = useState<Record<string, number>>({});
  const [alertas, setAlertas] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const [rp, ra] = await Promise.all([fetch('/api/belaped/pedidos'), fetch('/api/belaped/alertas')]);
      if (rp.ok) {
        const d = await rp.json();
        setPedidos(d.pedidos || []);
        setTotais(d.totais_por_distribuidora || {});
      }
      if (ra.ok) setAlertas((await ra.json()).alertas || []);
    } catch (e: any) {
      addToast('Erro ao carregar pedidos: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { carregar(); }, [carregar]);

  const mudarStatus = async (id: string, status: string) => {
    let nf: string | undefined;
    if (status === 'FATURADO' || status === 'RECEBIDO') {
      nf = window.prompt('Número da NF (opcional):') || undefined;
    }
    const r = await fetch(`/api/belaped/pedidos/${id}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, nf })
    });
    if (r.ok) { addToast('Status atualizado.', 'success'); carregar(); }
    else addToast('Falha ao atualizar status.', 'error');
  };

  return (
    <div className="space-y-4">
      <div className="bg-amber-950/30 border border-amber-800/60 rounded-xl p-3 text-xs text-amber-200">
        🔒 O BelaPed <b>nunca finaliza compras sozinho</b>. Ele só monta o carrinho; você confere e finaliza no portal da distribuidora e depois marca aqui como "Finalizado por você".
      </div>

      {alertas.length > 0 && (
        <div className="space-y-2">
          {alertas.map((a, i) => (
            <div key={i} className={`flex items-start gap-2 p-3 rounded-xl border text-sm ${a.nivel === 'danger' ? 'bg-rose-950/40 border-rose-800 text-rose-200' : 'bg-amber-950/40 border-amber-800 text-amber-200'}`}>
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{a.mensagem}</span>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {Object.entries(totais).map(([dist, tot]) => (
          <div key={dist} className="px-3 py-2 rounded-xl bg-[#0e1626] border border-slate-800">
            <span className="text-[11px] font-black uppercase text-emerald-300 block">{dist}</span>
            <span className="text-sm font-black text-white">{brl(Number(tot))}</span>
          </div>
        ))}
        <button onClick={carregar} disabled={loading} className="ml-auto flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 text-xs font-bold cursor-pointer">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Atualizar
        </button>
      </div>

      <div className="bg-[#0e1626] rounded-2xl border border-slate-800 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] uppercase text-slate-400 border-b border-slate-800">
              <th className="px-3 py-2 text-left whitespace-nowrap">Data</th>
              <th className="px-3 py-2 text-left whitespace-nowrap">Distribuidora</th>
              <th className="px-3 py-2 text-right whitespace-nowrap">Itens</th>
              <th className="px-3 py-2 text-right whitespace-nowrap">Unid.</th>
              <th className="px-3 py-2 text-right whitespace-nowrap">Total</th>
              <th className="px-3 py-2 text-left whitespace-nowrap">Prazo</th>
              <th className="px-3 py-2 text-left whitespace-nowrap">NF</th>
              <th className="px-3 py-2 text-left whitespace-nowrap">Status</th>
              <th className="px-3 py-2 text-left whitespace-nowrap">Ação</th>
            </tr>
          </thead>
          <tbody>
            {pedidos.length === 0 && (
              <tr><td colSpan={9} className="px-3 py-8 text-center text-slate-500">
                <ClipboardList className="w-6 h-6 mx-auto mb-2" />Nenhum pedido registrado ainda.
              </td></tr>
            )}
            {pedidos.map(p => (
              <tr key={p.id} className="border-b border-slate-800/60 hover:bg-slate-900/40">
                <td className="px-3 py-2 whitespace-nowrap text-slate-300">{new Date(p.created_at + 'Z').toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</td>
                <td className="px-3 py-2 whitespace-nowrap font-bold text-white">{p.distribuidora}</td>
                <td className="px-3 py-2 text-right text-slate-300">{p.qtd_itens}</td>
                <td className="px-3 py-2 text-right text-slate-300">{p.qtd_unidades}</td>
                <td className="px-3 py-2 text-right font-black text-white whitespace-nowrap">{brl(p.total)}</td>
                <td className="px-3 py-2 whitespace-nowrap text-slate-400">{p.prazo_previsto || '—'}</td>
                <td className="px-3 py-2 whitespace-nowrap text-slate-400">{p.nf || '—'}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <span className={`px-2 py-0.5 rounded-full border text-[11px] font-bold ${STATUS_COR[p.status] || STATUS_COR.RASCUNHO}`}>{STATUS_LABEL[p.status] || p.status}</span>
                </td>
                <td className="px-3 py-2">
                  <select
                    value=""
                    onChange={e => e.target.value && mudarStatus(p.id, e.target.value)}
                    className="bg-[#080d18] border border-slate-700 rounded-lg text-xs text-slate-200 px-2 py-1 cursor-pointer"
                  >
                    <option value="">Marcar como…</option>
                    {['FINALIZADO_PELO_USUARIO', 'FATURADO', 'RECEBIDO', 'CANCELADO'].map(s => (
                      <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default PedidosTab;
