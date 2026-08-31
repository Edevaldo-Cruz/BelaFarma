import React, { useState, useEffect, useMemo } from 'react';
import { 
  ShieldCheck, 
  Send, 
  Edit3, 
  XCircle, 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  MessageSquare, 
  Phone, 
  Building2, 
  FileText, 
  RefreshCw, 
  Filter, 
  ExternalLink,
  Bell,
  Smartphone,
  Eye,
  Check,
  X
} from 'lucide-react';
import { FilaAprovacaoItem, User } from '../../types';
import { useToast } from '../ToastContext';

interface ComprasAprovacaoFilaProps {
  user: User;
  theme: 'light' | 'dark';
  onApprovalsUpdated?: () => void;
}

export const ComprasAprovacaoFila: React.FC<ComprasAprovacaoFilaProps> = ({
  user,
  theme,
  onApprovalsUpdated
}) => {
  const { addToast } = useToast();
  const [fila, setFila] = useState<FilaAprovacaoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroStatus, setFiltroStatus] = useState<string>('pendente');
  const [filtroTipo, setFiltroTipo] = useState<string>('TODOS');

  // Modais de Ação
  const [itemParaAprovar, setItemParaAprovar] = useState<FilaAprovacaoItem | null>(null);
  const [itemParaEditar, setItemParaEditar] = useState<FilaAprovacaoItem | null>(null);
  const [textoEditado, setTextoEditado] = useState('');
  const [itemParaRejeitar, setItemParaRejeitar] = useState<FilaAprovacaoItem | null>(null);
  const [motivoRejeicao, setMotivoRejeicao] = useState('');
  const [processandoAcao, setProcessandoAcao] = useState(false);

  const carregarFila = async () => {
    try {
      setLoading(true);
      const url = filtroStatus === 'pendente' 
        ? '/api/central-compras/aprovacoes/pendentes' 
        : `/api/central-compras/aprovacoes?status=${filtroStatus}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.data)) {
          setFila(data.data);
        }
      }
    } catch (err: any) {
      addToast('Erro ao carregar fila de aprovação: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    carregarFila();
  }, [filtroStatus]);

  const filaFiltrada = useMemo(() => {
    return fila.filter(item => {
      if (filtroTipo === 'TODOS') return true;
      return item.tipo === filtroTipo;
    });
  }, [fila, filtroTipo]);

  const pendentesCount = useMemo(() => {
    return fila.filter(i => i.status === 'pendente').length;
  }, [fila]);

  // Aprovar e disparar mensagem via WhatsApp Baileys Compras
  const handleAprovar = async () => {
    if (!itemParaAprovar) return;
    try {
      setProcessandoAcao(true);
      const res = await fetch(`/api/central-compras/aprovacoes/${itemParaAprovar.id}/aprovar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          usuario: user.name
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        addToast('✅ Mensagem autorizada e disparada com sucesso para o representante!', 'success');
        setItemParaAprovar(null);
        carregarFila();
        if (onApprovalsUpdated) onApprovalsUpdated();
      } else {
        addToast('Erro ao aprovar mensagem: ' + (data.error || 'Falha no envio do WhatsApp'), 'error');
      }
    } catch (err: any) {
      addToast('Falha na comunicação: ' + err.message, 'error');
    } finally {
      setProcessandoAcao(false);
    }
  };

  // Salvar Edição
  const handleSalvarEdicao = async () => {
    if (!itemParaEditar) return;
    if (!textoEditado.trim()) {
      addToast('O texto da mensagem não pode ser vazio.', 'warning');
      return;
    }

    try {
      setProcessandoAcao(true);
      const res = await fetch(`/api/central-compras/aprovacoes/${itemParaEditar.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          novoTexto: textoEditado
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        addToast('✅ Mensagem editada com sucesso! Pronta para aprovação.', 'success');
        setItemParaEditar(null);
        carregarFila();
      } else {
        addToast('Erro ao editar: ' + (data.error || 'Falha no servidor'), 'error');
      }
    } catch (err: any) {
      addToast('Falha na comunicação: ' + err.message, 'error');
    } finally {
      setProcessandoAcao(false);
    }
  };

  // Rejeitar Mensagem
  const handleRejeitar = async () => {
    if (!itemParaRejeitar) return;
    if (!motivoRejeicao.trim()) {
      addToast('Informe o motivo da rejeição.', 'warning');
      return;
    }

    try {
      setProcessandoAcao(true);
      const res = await fetch(`/api/central-compras/aprovacoes/${itemParaRejeitar.id}/rejeitar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          motivo: motivoRejeicao,
          usuario: user.name
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        addToast('Mensagem rejeitada e descartada da fila.', 'info');
        setItemParaRejeitar(null);
        setMotivoRejeicao('');
        carregarFila();
        if (onApprovalsUpdated) onApprovalsUpdated();
      } else {
        addToast('Erro ao rejeitar: ' + (data.error || 'Falha no servidor'), 'error');
      }
    } catch (err: any) {
      addToast('Falha na comunicação: ' + err.message, 'error');
    } finally {
      setProcessandoAcao(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Banner de Governança Estrita */}
      <div className="p-5 rounded-2xl bg-gradient-to-r from-red-600/10 via-amber-500/10 to-transparent border border-red-200 dark:border-red-900/60 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="p-3 bg-red-600 text-white rounded-2xl shadow-md shrink-0">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
              Fila de Aprovação Obrigatória (Human-in-the-Loop)
              <span className="px-2.5 py-0.5 rounded-full bg-red-600 text-white text-[10px] font-black uppercase tracking-wider animate-pulse">
                Trava Ativa
              </span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              Nenhuma mensagem gerada por robôs ou cotações é enviada ao WhatsApp dos fornecedores sem revisão e autorização expressa do administrador.
            </p>
          </div>
        </div>

        {/* Status do Alerta Duplo */}
        <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300">
          <Smartphone className="w-4 h-4 text-emerald-500" />
          <span>Alerta Duplo ADM Ativo</span>
        </div>
      </div>

      {/* Barra de Filtros */}
      <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="text-xs font-black uppercase text-slate-400 mr-1 flex items-center gap-1">
            <Filter className="w-3.5 h-3.5" /> Status:
          </span>
          {[
            { id: 'pendente', label: `Pendentes (${pendentesCount})` },
            { id: 'aprovado', label: 'Aprovados/Enviados' },
            { id: 'rejeitado', label: 'Rejeitados' },
            { id: 'todos', label: 'Histórico Completo' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setFiltroStatus(tab.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                filtroStatus === tab.id
                  ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-sm font-black'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <select
            value={filtroTipo}
            onChange={(e) => setFiltroTipo(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 focus:outline-none"
          >
            <option value="TODOS">Todos os Tipos</option>
            <option value="cotacao">Cotações</option>
            <option value="pedido">Pedidos de Compra</option>
            <option value="notificacao">Notificações</option>
          </select>

          <button
            onClick={carregarFila}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
            title="Atualizar fila"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Lista de Mensagens na Fila */}
      {loading ? (
        <div className="p-12 text-center text-slate-400 font-bold bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2 text-red-600" />
          Carregando mensagens da fila de aprovação...
        </div>
      ) : filaFiltrada.length === 0 ? (
        <div className="p-12 text-center text-slate-400 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
          <CheckCircle2 className="w-10 h-10 mx-auto mb-3 text-emerald-500" />
          <p className="font-bold text-slate-700 dark:text-slate-200">Fila limpa! Nenhuma mensagem pendente de aprovação.</p>
          <p className="text-xs text-slate-400 mt-1">Quando novas solicitações de cotação ou pedidos forem gerados pelo robô, elas aparecerão aqui para sua revisão.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filaFiltrada.map(item => {
            const isPendente = item.status === 'pendente';
            const isAprovado = item.status === 'aprovado' || item.status === 'enviado' || item.status === 'editado_enviado';
            const isRejeitado = item.status === 'rejeitado';

            return (
              <div
                key={item.id}
                className={`p-5 rounded-2xl border bg-white dark:bg-slate-900 shadow-sm transition-all space-y-4 ${
                  isPendente 
                    ? 'border-amber-300 dark:border-amber-800/80 bg-gradient-to-r from-amber-50/20 to-transparent' 
                    : 'border-slate-200 dark:border-slate-800 opacity-80'
                }`}
              >
                {/* Topo do Card */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-3">
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                      item.tipo === 'cotacao' ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300' :
                      item.tipo === 'pedido' ? 'bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300' :
                      'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300'
                    }`}>
                      {item.tipo.toUpperCase()}
                    </span>

                    <div className="flex items-center gap-1.5 text-xs font-black text-slate-900 dark:text-white">
                      <Building2 className="w-3.5 h-3.5 text-slate-400" />
                      <span>{item.fornecedorNome}</span>
                    </div>

                    <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                      <Phone className="w-3.5 h-3.5 text-slate-400" />
                      <span>{item.destinatarioNome} ({item.destinatarioTelefone})</span>
                    </div>
                  </div>

                  {/* Status Badge */}
                  <div className="flex items-center gap-2">
                    {item.notificadoAdmin === 1 && isPendente && (
                      <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-900/60">
                        <Smartphone className="w-3 h-3" /> ADM Notificado
                      </span>
                    )}

                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase ${
                      isPendente ? 'bg-amber-100 text-amber-900 dark:bg-amber-900/60 dark:text-amber-300 animate-pulse' :
                      isAprovado ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300' :
                      'bg-red-100 text-red-800 dark:bg-red-900/60 dark:text-red-300'
                    }`}>
                      {item.status}
                    </span>
                  </div>
                </div>

                {/* Pré-visualização formatada (Estilo WhatsApp) */}
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 font-mono text-xs text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">
                  {item.mensagemTexto}
                </div>

                {/* Detalhes de Auditoria e Ações */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
                  <div className="text-[11px] text-slate-400">
                    Gerado em: {new Date(item.createdAt).toLocaleString('pt-BR')}
                    {item.aprovadoPor && ` • Aprovado por: ${item.aprovadoPor}`}
                    {item.rejeitadoMotivo && ` • Motivo rejeição: "${item.rejeitadoMotivo}"`}
                  </div>

                  {isPendente && (
                    <div className="flex items-center gap-2 justify-end">
                      <button
                        onClick={() => {
                          setItemParaEditar(item);
                          setTextoEditado(item.mensagemTexto);
                        }}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-black uppercase tracking-wider cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        Editar Texto
                      </button>

                      <button
                        onClick={() => setItemParaRejeitar(item)}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-900/60 text-xs font-black uppercase tracking-wider hover:bg-red-100 dark:hover:bg-red-900/60 transition-all cursor-pointer"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        Rejeitar
                      </button>

                      <button
                        onClick={() => setItemParaAprovar(item)}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white text-xs font-black uppercase tracking-wider shadow-md transition-all cursor-pointer active:scale-95"
                      >
                        <Send className="w-3.5 h-3.5" />
                        Aprovar e Enviar Agora
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal: Confirmar Aprovação Expressa */}
      {itemParaAprovar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-lg p-6 rounded-[2.5rem] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 rounded-2xl">
                <Send className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900 dark:text-white">
                  Confirmar Envio pelo WhatsApp Comercial
                </h3>
                <p className="text-xs text-slate-400 font-bold">
                  Destinatário: {itemParaAprovar.destinatarioNome} ({itemParaAprovar.destinatarioTelefone})
                </p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono text-slate-700 dark:text-slate-300 max-h-48 overflow-y-auto whitespace-pre-wrap">
              {itemParaAprovar.mensagemTexto}
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setItemParaAprovar(null)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-black uppercase text-slate-600 dark:text-slate-400"
              >
                Cancelar
              </button>
              <button
                onClick={handleAprovar}
                disabled={processandoAcao}
                className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase tracking-wider shadow-md transition-all cursor-pointer flex items-center gap-2"
              >
                {processandoAcao ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                Autorizar e Despachar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Editar Mensagem */}
      {itemParaEditar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-xl p-6 rounded-[2.5rem] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
              <Edit3 className="w-5 h-5 text-amber-500" />
              Editar Mensagem antes da Aprovação
            </h3>

            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">
                Texto a ser transmitido via WhatsApp:
              </label>
              <textarea
                rows={8}
                value={textoEditado}
                onChange={(e) => setTextoEditado(e.target.value)}
                className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono text-xs text-slate-900 dark:text-white leading-relaxed focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setItemParaEditar(null)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-black uppercase text-slate-600 dark:text-slate-400"
              >
                Cancelar
              </button>
              <button
                onClick={handleSalvarEdicao}
                disabled={processandoAcao}
                className="px-5 py-2.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-black uppercase tracking-wider shadow-md cursor-pointer"
              >
                Salvar Alterações
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Rejeitar Mensagem */}
      {itemParaRejeitar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md p-6 rounded-[2.5rem] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
              <XCircle className="w-5 h-5 text-red-500" />
              Rejeitar e Descartar Mensagem
            </h3>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Motivo da Rejeição (obrigatório para auditoria):
              </label>
              <input
                type="text"
                value={motivoRejeicao}
                onChange={(e) => setMotivoRejeicao(e.target.value)}
                placeholder="Ex: Preço acima do teto orçamentário mensal, distribuidora sem prazo..."
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setItemParaRejeitar(null)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-black uppercase text-slate-600 dark:text-slate-400"
              >
                Cancelar
              </button>
              <button
                onClick={handleRejeitar}
                disabled={processandoAcao || !motivoRejeicao.trim()}
                className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-black uppercase tracking-wider shadow-md cursor-pointer disabled:opacity-50"
              >
                Confirmar Rejeição
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
