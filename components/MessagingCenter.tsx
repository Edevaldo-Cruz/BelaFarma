import React, { useState, useEffect, useCallback } from 'react';
import {
  MessageSquare, Clock, Send, Megaphone, History,
  Edit3, Save, X, Play, Eye, Trash2, Plus,
  CheckCircle, XCircle, AlertCircle, RefreshCw,
  ChevronDown, ChevronUp, Loader2, Search,
  ToggleLeft, ToggleRight, Zap, Users, Cake, CreditCard,
  BarChart3, ArrowLeft, Calendar, ChevronLeft, ChevronRight, ImageIcon, Sparkles, Smile
} from 'lucide-react';
import { useToast } from './ToastContext';
import { MessageTemplate, MessageLog, MessageCampaign, MessageSchedule, Customer } from '../types';

// ============================================================================
// TABS
// ============================================================================
type Tab = 'templates' | 'schedules' | 'send' | 'campaigns' | 'crm-inactive' | 'post-sales' | 'log' | 'stats' | 'whatsapp-groups';

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'templates', label: 'Templates', icon: Edit3 },
  { id: 'schedules', label: 'Agendamentos', icon: Clock },
  { id: 'send', label: 'Enviar', icon: Send },
  { id: 'campaigns', label: 'Campanhas', icon: Megaphone },
  { id: 'crm-inactive', label: 'Reativar Clientes', icon: RefreshCw },
  { id: 'post-sales', label: 'Pós-Venda', icon: CheckCircle },
  { id: 'log', label: 'Histórico', icon: History },
  { id: 'stats', label: 'Estatísticas', icon: BarChart3 },
  { id: 'whatsapp-groups', label: 'Grupos WA', icon: Users },
];

const TYPE_LABELS: Record<string, { label: string; emoji: string; color: string }> = {
  cobranca: { label: 'Cobrança', emoji: '💰', color: 'text-amber-600 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400' },
  aniversario: { label: 'Aniversário', emoji: '🎂', color: 'text-pink-600 bg-pink-50 dark:bg-pink-900/20 dark:text-pink-400' },
  promocao: { label: 'Promoção', emoji: '🏷️', color: 'text-blue-600 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-400' },
  boas_vindas: { label: 'Boas-Vindas', emoji: '👋', color: 'text-green-600 bg-green-50 dark:bg-green-900/20 dark:text-green-400' },
  manual: { label: 'Manual', emoji: '✏️', color: 'text-slate-600 bg-slate-50 dark:bg-slate-800 dark:text-slate-400' },
  teste: { label: 'Teste', emoji: '🧪', color: 'text-purple-600 bg-purple-50 dark:bg-purple-900/20 dark:text-purple-400' },
};

function getTypeInfo(type: string) {
  return TYPE_LABELS[type] || { label: type, emoji: '📩', color: 'text-slate-600 bg-slate-100 dark:bg-slate-800 dark:text-slate-400' };
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export const MessagingCenter: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('templates');
  const { addToast } = useToast();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-3 bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl shadow-lg">
          <MessageSquare className="w-7 h-7 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
            Central de Mensagens
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            WhatsApp via Evolution API — Templates, Agendamentos e Campanhas
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-slate-100 dark:bg-slate-800/50 rounded-2xl overflow-x-auto">
        {TABS.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold whitespace-nowrap transition-all ${
                isActive
                  ? 'bg-white dark:bg-slate-700 text-green-700 dark:text-green-400 shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      {activeTab === 'templates' && <TemplatesTab />}
      {activeTab === 'schedules' && <SchedulesTab />}
      {activeTab === 'send' && <SendTab />}
      {activeTab === 'campaigns' && <CampaignsTab />}
      {activeTab === 'crm-inactive' && <CRMInactiveTab />}
      {activeTab === 'post-sales' && <PostSalesTab />}
      {activeTab === 'log' && <LogTab />}
      {activeTab === 'stats' && <StatsTab />}
      {activeTab === 'whatsapp-groups' && <WhatsAppGroupsTab />}
    </div>
  );
};

// ============================================================================
// TEMPLATES TAB
// ============================================================================
const TemplatesTab: React.FC = () => {
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editName, setEditName] = useState('');
  const [preview, setPreview] = useState<string | null>(null);
  const { addToast } = useToast();

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await fetch('/api/messages/templates');
      const data = await res.json();
      setTemplates(data);
    } catch (err) {
      addToast('Erro ao carregar templates.', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  const handleSave = async (id: string) => {
    try {
      const res = await fetch(`/api/messages/templates/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName, content: editContent }),
      });
      if (res.ok) {
        addToast('Template salvo com sucesso!', 'success');
        setEditingId(null);
        fetchTemplates();
      }
    } catch {
      addToast('Erro ao salvar template.', 'error');
    }
  };

  const handleToggleActive = async (template: MessageTemplate) => {
    try {
      await fetch(`/api/messages/templates/${template.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !template.isActive }),
      });
      fetchTemplates();
    } catch {
      addToast('Erro ao alterar status.', 'error');
    }
  };

  const handlePreview = async (content: string) => {
    try {
      const res = await fetch('/api/messages/templates/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      const data = await res.json();
      setPreview(data.preview);
    } catch {
      addToast('Erro ao gerar preview.', 'error');
    }
  };

  if (loading) return <LoadingState />;

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-2xl p-4">
        <p className="text-sm text-blue-700 dark:text-blue-300 font-medium">
          💡 <strong>Variáveis disponíveis:</strong> {'{nome}'}, {'{apelido}'}, {'{valor}'}, {'{data_vencimento}'}, {'{nome_farmacia}'}, {'{data_hoje}'}, {'{mensagem_promocao}'}
        </p>
      </div>

      {templates.map(tpl => {
        const typeInfo = getTypeInfo(tpl.type);
        const isEditing = editingId === tpl.id;

        return (
          <div
            key={tpl.id}
            className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden shadow-sm"
          >
            <div className="flex items-center justify-between p-4 border-b border-slate-100 dark:border-slate-700">
              <div className="flex items-center gap-3">
                <span className={`px-3 py-1 rounded-full text-xs font-bold ${typeInfo.color}`}>
                  {typeInfo.emoji} {typeInfo.label}
                </span>
                {isEditing ? (
                  <input
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    className="px-3 py-1 border border-slate-300 dark:border-slate-600 rounded-lg text-sm font-bold bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                  />
                ) : (
                  <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{tpl.name}</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleToggleActive(tpl)}
                  className={`p-1.5 rounded-lg transition-colors ${tpl.isActive ? 'text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20' : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                  title={tpl.isActive ? 'Ativo' : 'Inativo'}
                >
                  {tpl.isActive ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                </button>
                {!isEditing ? (
                  <>
                    <button
                      onClick={() => handlePreview(tpl.content)}
                      className="p-1.5 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                      title="Pré-visualizar"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => { setEditingId(tpl.id); setEditContent(tpl.content); setEditName(tpl.name); }}
                      className="p-1.5 text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-lg transition-colors"
                      title="Editar"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => handleSave(tpl.id)}
                      className="p-1.5 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition-colors"
                      title="Salvar"
                    >
                      <Save className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                      title="Cancelar"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </>
                )}
              </div>
            </div>
            <div className="p-4">
              {isEditing ? (
                <textarea
                  value={editContent}
                  onChange={e => setEditContent(e.target.value)}
                  rows={10}
                  className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-xl text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 font-mono resize-y focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
                />
              ) : (
                <pre className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap font-sans leading-relaxed">{tpl.content}</pre>
              )}
            </div>
          </div>
        );
      })}

      {/* Preview Modal */}
      {preview && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setPreview(null)}>
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 max-w-lg w-full shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">📱 Pré-visualização</h3>
              <button onClick={() => setPreview(null)} className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="bg-[#e5ddd5] dark:bg-[#0b141a] rounded-xl p-4">
              <div className="bg-[#dcf8c6] dark:bg-[#005c4b] rounded-lg px-4 py-3 max-w-[85%] ml-auto shadow">
                <pre className="text-sm text-slate-900 dark:text-slate-100 whitespace-pre-wrap font-sans leading-relaxed">{preview}</pre>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 text-right mt-1">
                  {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} ✓✓
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// SCHEDULES TAB
// ============================================================================
const SchedulesTab: React.FC = () => {
  const [schedules, setSchedules] = useState<MessageSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editHour, setEditHour] = useState(0);
  const [editMinute, setEditMinute] = useState(0);
  const [runningJob, setRunningJob] = useState<string | null>(null);
  const { addToast } = useToast();

  const fetchSchedules = useCallback(async () => {
    try {
      const res = await fetch('/api/messages/schedules');
      const data = await res.json();
      setSchedules(data);
    } catch {
      addToast('Erro ao carregar agendamentos.', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSchedules(); }, [fetchSchedules]);

  const handleUpdate = async (id: string, updates: Partial<MessageSchedule>) => {
    try {
      const res = await fetch(`/api/messages/schedules/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        addToast('Agendamento atualizado!', 'success');
        setEditingId(null);
        fetchSchedules();
      }
    } catch {
      addToast('Erro ao atualizar agendamento.', 'error');
    }
  };

  const handleRunNow = async (type: string) => {
    setRunningJob(type);
    try {
      const res = await fetch(`/api/messages/run-job/${type}`, { method: 'POST' });
      const data = await res.json();
      if (data.sent !== undefined) {
        addToast(`Job executado: ${data.sent} enviado(s), ${data.failed} falha(s).`, 'success');
      }
    } catch {
      addToast('Erro ao executar job.', 'error');
    } finally {
      setRunningJob(null);
      fetchSchedules();
    }
  };

  if (loading) return <LoadingState />;

  return (
    <div className="space-y-4">
      {schedules.map(schedule => {
        const typeInfo = getTypeInfo(schedule.type);
        const isEditing = editingId === schedule.id;
        
        return (
          <div key={schedule.id} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className={`px-3 py-1.5 rounded-full text-xs font-bold ${typeInfo.color}`}>
                  {typeInfo.emoji} {typeInfo.label}
                </span>
                <div>
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-200">{schedule.description || schedule.type}</p>
                  {schedule.lastRun && (
                    <p className="text-xs text-slate-400">
                      Última execução: {new Date(schedule.lastRun).toLocaleString('pt-BR')}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3">
                {/* Toggle Enable */}
                <button
                  onClick={() => handleUpdate(schedule.id, { isEnabled: !schedule.isEnabled })}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    schedule.isEnabled
                      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                      : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
                  }`}
                >
                  {schedule.isEnabled ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                  {schedule.isEnabled ? 'Ativo' : 'Inativo'}
                </button>

                {/* Time Display / Edit */}
                {isEditing ? (
                  <div className="flex items-center gap-1">
                    <input
                      type="number" min="0" max="23" value={editHour}
                      onChange={e => setEditHour(Number(e.target.value))}
                      className="w-14 px-2 py-1 border border-slate-300 dark:border-slate-600 rounded-lg text-center text-sm font-bold bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                    />
                    <span className="text-lg font-bold text-slate-400">:</span>
                    <input
                      type="number" min="0" max="59" value={editMinute}
                      onChange={e => setEditMinute(Number(e.target.value))}
                      className="w-14 px-2 py-1 border border-slate-300 dark:border-slate-600 rounded-lg text-center text-sm font-bold bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                    />
                    <button onClick={() => handleUpdate(schedule.id, { hour: editHour, minute: editMinute })}
                      className="p-1.5 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg">
                      <Save className="w-4 h-4" />
                    </button>
                    <button onClick={() => setEditingId(null)} className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => { setEditingId(schedule.id); setEditHour(schedule.hour); setEditMinute(schedule.minute); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-700 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                    title="Clique para editar horário"
                  >
                    <Clock className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                    <span className="text-sm font-bold text-slate-700 dark:text-slate-300">
                      {String(schedule.hour).padStart(2, '0')}:{String(schedule.minute).padStart(2, '0')}
                    </span>
                  </button>
                )}

                {/* Run Now */}
                <button
                  onClick={() => handleRunNow(schedule.type)}
                  disabled={runningJob === schedule.type}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-bold hover:bg-green-700 disabled:opacity-50 transition-all"
                >
                  {runningJob === schedule.type ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Play className="w-4 h-4" />
                  )}
                  Executar agora
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ============================================================================
// SEND TAB (Envio Manual)
// ============================================================================
const SendTab: React.FC = () => {
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string } | null>(null);
  const { addToast } = useToast();

  const handleSend = async () => {
    if (!phone || !message) {
      addToast('Preencha o número e a mensagem.', 'warning');
      return;
    }

    setSending(true);
    try {
      const res = await fetch('/api/messages/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, message, type: 'manual' }),
      });
      const data = await res.json();
      setTestResult(data);
      if (data.success) {
        addToast('Mensagem enviada com sucesso!', 'success');
        setMessage('');
      } else {
        addToast(`Falha: ${data.error}`, 'error');
      }
    } catch {
      addToast('Erro ao enviar.', 'error');
    } finally {
      setSending(false);
    }
  };

  const handleTest = async () => {
    setSending(true);
    try {
      const res = await fetch('/api/messages/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      setTestResult(data);
      if (data.success) {
        addToast('Mensagem de teste enviada!', 'success');
      } else {
        addToast(`Falha no teste: ${data.error}`, 'error');
      }
    } catch {
      addToast('Erro no teste.', 'error');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Envio Manual */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 shadow-sm">
        <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
          <Send className="w-5 h-5 text-green-600" />
          Envio Manual
        </h3>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
              Número (formato +55...)
            </label>
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="+5532999999999"
              className="w-full px-4 py-2.5 border border-slate-300 dark:border-slate-600 rounded-xl text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-green-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
              Mensagem
            </label>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              rows={6}
              placeholder="Digite a mensagem..."
              className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-xl text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 resize-y focus:ring-2 focus:ring-green-500 outline-none"
            />
          </div>
          <button
            onClick={handleSend}
            disabled={sending}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 disabled:opacity-50 transition-all"
          >
            {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            Enviar Mensagem
          </button>
        </div>
      </div>

      {/* Teste e Status */}
      <div className="space-y-4">
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 shadow-sm">
          <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
            <Zap className="w-5 h-5 text-yellow-500" />
            Teste Rápido
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
            Envia uma mensagem de teste para o número do admin configurado no .env
          </p>
          <button
            onClick={handleTest}
            disabled={sending}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-amber-500 text-white rounded-xl font-bold hover:bg-amber-600 disabled:opacity-50 transition-all"
          >
            {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Zap className="w-5 h-5" />}
            Enviar Teste para Admin
          </button>
        </div>

        {testResult && (
          <div className={`border rounded-2xl p-4 ${testResult.success ? 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800' : 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800'}`}>
            <div className="flex items-center gap-2">
              {testResult.success ? (
                <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
              ) : (
                <XCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
              )}
              <p className={`text-sm font-bold ${testResult.success ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
                {testResult.success ? 'Mensagem enviada com sucesso!' : `Falha: ${testResult.error}`}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// CAMPAIGNS TAB
// ============================================================================
const CampaignsTab: React.FC = () => {
  const [campaigns, setCampaigns] = useState<MessageCampaign[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newContent, setNewContent] = useState('');
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [executing, setExecuting] = useState<string | null>(null);
  const { addToast } = useToast();

  const fetchData = useCallback(async () => {
    try {
      const [campRes, custRes] = await Promise.all([
        fetch('/api/messages/campaigns'),
        fetch('/api/customers'),
      ]);
      setCampaigns(await campRes.json());
      setCustomers(await custRes.json());
    } catch {
      addToast('Erro ao carregar dados.', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filteredCustomers = customers.filter(c => {
    if (!searchTerm) return true;
    const s = searchTerm.toLowerCase();
    return (c.name?.toLowerCase().includes(s) || c.nickname?.toLowerCase().includes(s) || c.phone?.includes(s));
  });

  const toggleCustomer = (id: string) => {
    setSelectedCustomerIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const selectAllFiltered = () => {
    const ids = filteredCustomers.filter(c => c.phone).map(c => c.id);
    setSelectedCustomerIds(prev => {
      const newSet = new Set(prev);
      ids.forEach(id => newSet.add(id));
      return Array.from(newSet);
    });
  };

  const deselectAll = () => setSelectedCustomerIds([]);

  const handleCreate = async () => {
    if (!newName || !newContent) {
      addToast('Nome e conteúdo são obrigatórios.', 'warning');
      return;
    }
    try {
      const res = await fetch('/api/messages/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName,
          description: newDesc,
          messageContent: newContent,
          targetCustomerIds: selectedCustomerIds,
        }),
      });
      if (res.ok) {
        addToast('Campanha criada!', 'success');
        setShowCreate(false);
        setNewName(''); setNewDesc(''); setNewContent('');
        setSelectedCustomerIds([]);
        fetchData();
      }
    } catch {
      addToast('Erro ao criar campanha.', 'error');
    }
  };

  const handleExecute = async (id: string) => {
    setExecuting(id);
    try {
      const res = await fetch(`/api/messages/campaigns/${id}/execute`, { method: 'POST' });
      const data = await res.json();
      if (data.sent !== undefined) {
        addToast(`Campanha enviada: ${data.sent} ok, ${data.failed} falhas.`, 'success');
      } else {
        addToast(`Erro: ${data.error}`, 'error');
      }
      fetchData();
    } catch {
      addToast('Erro ao executar campanha.', 'error');
    } finally {
      setExecuting(null);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await fetch(`/api/messages/campaigns/${id}`, { method: 'DELETE' });
      addToast('Campanha excluída.', 'success');
      fetchData();
    } catch {
      addToast('Erro ao excluir.', 'error');
    }
  };

  if (loading) return <LoadingState />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <Megaphone className="w-5 h-5 text-blue-600" />
          Campanhas
        </h3>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition-all"
        >
          <Plus className="w-4 h-4" />
          Nova Campanha
        </button>
      </div>

      {/* Create Campaign Form */}
      {showCreate && (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 shadow-sm space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Nome da Campanha</label>
              <input value={newName} onChange={e => setNewName(e.target.value)}
                className="w-full px-4 py-2.5 border border-slate-300 dark:border-slate-600 rounded-xl text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="Ex: Promoção de Verão" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Descrição</label>
              <input value={newDesc} onChange={e => setNewDesc(e.target.value)}
                className="w-full px-4 py-2.5 border border-slate-300 dark:border-slate-600 rounded-xl text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="Ex: Descontos em vitaminas" />
            </div>
          </div>
          
          <div>
            <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
              Mensagem (use variáveis como {'{nome}'})
            </label>
            <textarea value={newContent} onChange={e => setNewContent(e.target.value)} rows={5}
              className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-xl text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 font-mono resize-y focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="Olá, {nome}! Temos uma promoção especial..." />
          </div>

          {/* Customer Selector */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Selecionar Clientes ({selectedCustomerIds.length} selecionados)
              </label>
              <div className="flex gap-2">
                <button onClick={selectAllFiltered} className="text-xs text-blue-600 hover:text-blue-700 font-bold">Selecionar todos</button>
                <button onClick={deselectAll} className="text-xs text-red-500 hover:text-red-600 font-bold">Limpar</button>
              </div>
            </div>
            <div className="relative mb-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Buscar cliente..."
                className="w-full pl-10 pr-4 py-2 border border-slate-300 dark:border-slate-600 rounded-xl text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div className="max-h-48 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-xl">
              {filteredCustomers.map(c => (
                <label
                  key={c.id}
                  className={`flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors ${
                    !c.phone ? 'opacity-40' : ''
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedCustomerIds.includes(c.id)}
                    onChange={() => toggleCustomer(c.id)}
                    disabled={!c.phone}
                    className="rounded text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-slate-700 dark:text-slate-300 font-medium">{c.name}</span>
                  {c.nickname && <span className="text-xs text-slate-400">({c.nickname})</span>}
                  <span className="ml-auto text-xs text-slate-400">{c.phone || 'sem telefone'}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={handleCreate}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all">
              <Save className="w-5 h-5" />
              Salvar Campanha
            </button>
            <button onClick={() => setShowCreate(false)}
              className="px-4 py-3 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-bold hover:bg-slate-300 dark:hover:bg-slate-600 transition-all">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Campaigns List */}
      {campaigns.map(camp => {
        const customerIds = JSON.parse(camp.targetCustomerIds || '[]');
        return (
          <div key={camp.id} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">{camp.name}</h4>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    camp.status === 'enviada' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                    camp.status === 'enviando' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' :
                    'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400'
                  }`}>
                    {camp.status === 'enviada' ? '✅ Enviada' : camp.status === 'enviando' ? '⏳ Enviando' : '📝 Rascunho'}
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  👥 {customerIds.length} clientes | 
                  {camp.status === 'enviada' ? ` ✅ ${camp.sentCount} ok · ❌ ${camp.failedCount} falhas` : ''}
                  {' · '}{new Date(camp.createdAt).toLocaleDateString('pt-BR')}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {camp.status === 'rascunho' && (
                  <button
                    onClick={() => handleExecute(camp.id)}
                    disabled={executing === camp.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-bold hover:bg-green-700 disabled:opacity-50 transition-all"
                  >
                    {executing === camp.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                    Enviar
                  </button>
                )}
                <button
                  onClick={() => handleDelete(camp.id)}
                  className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        );
      })}

      {campaigns.length === 0 && !showCreate && (
        <div className="text-center py-12 text-slate-400 dark:text-slate-500">
          <Megaphone className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Nenhuma campanha criada ainda.</p>
          <p className="text-sm">Crie uma campanha para disparar promoções!</p>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// LOG TAB
// ============================================================================
const LogTab: React.FC = () => {
  const [logs, setLogs] = useState<MessageLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState('');
  const { addToast } = useToast();

  const fetchLogs = useCallback(async () => {
    try {
      let url = '/api/messages/log?limit=200';
      if (typeFilter) url += `&type=${typeFilter}`;
      const res = await fetch(url);
      setLogs(await res.json());
    } catch {
      addToast('Erro ao carregar histórico.', 'error');
    } finally {
      setLoading(false);
    }
  }, [typeFilter]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  if (loading) return <LoadingState />;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-xl text-sm bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 focus:ring-2 focus:ring-green-500 outline-none"
        >
          <option value="">Todos os tipos</option>
          <option value="cobranca">💰 Cobrança</option>
          <option value="aniversario">🎂 Aniversário</option>
          <option value="promocao">🏷️ Promoção</option>
          <option value="manual">✏️ Manual</option>
          <option value="teste">🧪 Teste</option>
        </select>
        <button onClick={fetchLogs} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
          <RefreshCw className="w-4 h-4" />
        </button>
        <p className="text-xs text-slate-400 ml-auto">{logs.length} registro(s)</p>
      </div>

      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm responsive-table">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-700/50">
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Data</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Tipo</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Destinatário</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {logs.map(log => {
                const typeInfo = getTypeInfo(log.type);
                return (
                  <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                    <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      {new Date(log.sentAt).toLocaleString('pt-BR')}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${typeInfo.color}`}>
                        {typeInfo.emoji} {typeInfo.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-xs font-bold text-slate-700 dark:text-slate-300">{log.customerName || log.phone}</p>
                      {log.customerName && <p className="text-[10px] text-slate-400">{log.phone}</p>}
                    </td>
                    <td className="px-4 py-3">
                      {log.status === 'enviado' ? (
                        <span className="flex items-center gap-1 text-xs font-bold text-green-600 dark:text-green-400">
                          <CheckCircle className="w-3.5 h-3.5" /> Enviado
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs font-bold text-red-600 dark:text-red-400" title={log.errorMessage || ''}>
                          <XCircle className="w-3.5 h-3.5" /> Erro
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {logs.length === 0 && (
          <div className="text-center py-12 text-slate-400 dark:text-slate-500">
            <History className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Nenhuma mensagem enviada ainda.</p>
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// STATS TAB
// ============================================================================
const StatsTab: React.FC = () => {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const { addToast } = useToast();

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/messages/stats');
        setStats(await res.json());
      } catch {
        addToast('Erro ao carregar estatísticas.', 'error');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <LoadingState />;
  if (!stats) return null;

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          label="Total Enviadas"
          value={stats.totalSent}
          icon={<CheckCircle className="w-6 h-6" />}
          color="text-green-600 bg-green-50 dark:bg-green-900/20"
        />
        <StatCard
          label="Falhas"
          value={stats.totalFailed}
          icon={<XCircle className="w-6 h-6" />}
          color="text-red-600 bg-red-50 dark:bg-red-900/20"
        />
        <StatCard
          label="Enviadas Hoje"
          value={stats.todaySent}
          icon={<Zap className="w-6 h-6" />}
          color="text-amber-600 bg-amber-50 dark:bg-amber-900/20"
        />
      </div>

      {/* By Type */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 shadow-sm">
        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-4 uppercase tracking-wider">Por Tipo</h3>
        <div className="space-y-3">
          {(stats.byType || []).map((item: any) => {
            const typeInfo = getTypeInfo(item.type);
            const total = item.sent + item.failed;
            const successRate = total > 0 ? Math.round((item.sent / total) * 100) : 0;
            return (
              <div key={item.type} className="flex items-center gap-3">
                <span className={`px-3 py-1 rounded-full text-xs font-bold min-w-[100px] text-center ${typeInfo.color}`}>
                  {typeInfo.emoji} {typeInfo.label}
                </span>
                <div className="flex-1 h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-green-500 rounded-full transition-all"
                    style={{ width: `${successRate}%` }}
                  />
                </div>
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400 min-w-[60px] text-right">
                  {item.sent}/{total}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Last 7 Days */}
      {stats.last7Days && stats.last7Days.length > 0 && (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 shadow-sm">
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-4 uppercase tracking-wider">Últimos 7 Dias</h3>
          <div className="flex items-end gap-2 h-32">
            {stats.last7Days.map((day: any) => {
              const maxCount = Math.max(...stats.last7Days.map((d: any) => d.count));
              const height = maxCount > 0 ? (day.count / maxCount) * 100 : 0;
              const dayLabel = new Date(day.day + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short' });
              return (
                <div key={day.day} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">{day.count}</span>
                  <div
                    className="w-full bg-gradient-to-t from-green-500 to-emerald-400 rounded-t-lg transition-all min-h-[4px]"
                    style={{ height: `${Math.max(height, 4)}%` }}
                  />
                  <span className="text-[10px] text-slate-400 dark:text-slate-500">{dayLabel}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// WHATSAPP GROUPS TAB (CALENDAR VIEW)
// ============================================================================
const WhatsAppGroupsTab: React.FC = () => {
  const [groups, setGroups] = useState<any[]>([]);
  const [scheduledPosts, setScheduledPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  
  // Calendar States
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  
  // Form States
  const [showCreate, setShowCreate] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<string>('');
  const [manualGroupName, setManualGroupName] = useState('');
  const [isCustomGroup, setIsCustomGroup] = useState(false);
  const [content, setContent] = useState('');
  const [scheduledTime, setScheduledTime] = useState('10:00');
  
  // Imagens e Legendas IA
  const [mediaFiles, setMediaFiles] = useState<{ id: string; file: File; base64: string; caption: string; loading: boolean }[]>([]);
  
  const { addToast } = useToast();

  const incrementGroupUsage = (groupId: string) => {
    if (!groupId) return;
    try {
      const usage = JSON.parse(localStorage.getItem('whatsapp_groups_usage') || '{}');
      usage[groupId] = (usage[groupId] || 0) + 1;
      localStorage.setItem('whatsapp_groups_usage', JSON.stringify(usage));
    } catch (e) {}
  };

  const sortedGroups = React.useMemo(() => {
    let usage: Record<string, number> = {};
    try { usage = JSON.parse(localStorage.getItem('whatsapp_groups_usage') || '{}'); } catch(e) {}
    return [...groups].sort((a, b) => {
      const aUsage = usage[a.id] || 0;
      const bUsage = usage[b.id] || 0;
      if (bUsage !== aUsage) return bUsage - aUsage;
      const aName = a.subject || a.name || a.id;
      const bName = b.subject || b.name || b.id;
      return aName.localeCompare(bName);
    });
  }, [groups]);

  const handleGenerateCaption = async (fileId: string, base64: string) => {
    try {
      const res = await fetch('/api/generate-description', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64 })
      });
      const data = await res.json();
      if (data.description) {
        setMediaFiles(prev => prev.map(m => m.id === fileId ? { ...m, caption: data.description, loading: false } : m));
      } else {
        setMediaFiles(prev => prev.map(m => m.id === fileId ? { ...m, loading: false } : m));
      }
    } catch {
      setMediaFiles(prev => prev.map(m => m.id === fileId ? { ...m, loading: false } : m));
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    
    const newItems = Array.from(files).map(file => {
      return {
        id: Math.random().toString(36).substr(2, 9),
        file,
        base64: '',
        caption: '',
        loading: true
      };
    });

    setMediaFiles(prev => [...prev, ...newItems]);

    // Lê base64 e chama IA
    for (const item of newItems) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        setMediaFiles(prev => prev.map(m => m.id === item.id ? { ...m, base64: base64String } : m));
        handleGenerateCaption(item.id, base64String);
      };
      reader.readAsDataURL(item.file as Blob);
    }
  };

  const removeMedia = (id: string) => {
    setMediaFiles(prev => prev.filter(m => m.id !== id));
  };
  
  const handleImmediateSend = async () => {
    if (!selectedGroup) {
      addToast('Selecione um grupo primeiro.', 'warning');
      return;
    }

    if (mediaFiles.length === 0 && !content) {
      addToast('Escreva uma mensagem ou adicione imagens.', 'warning');
      return;
    }

    setSubmitting(true);
    try {
      const groupObj = groups.find(g => g.id === selectedGroup || g.subject === selectedGroup || g.name === selectedGroup);
      const groupId = groupObj ? groupObj.id : selectedGroup;
      const groupName = groupObj ? (groupObj.subject || groupObj.name) : selectedGroup;

      incrementGroupUsage(groupId);

      // Se houver imagens, envia cada uma separadamente com sua legenda
      if (mediaFiles.length > 0) {
        for (const media of mediaFiles) {
          const formData = new FormData();
          formData.append('groupId', groupId);
          formData.append('groupName', groupName);
          formData.append('content', media.caption);
          formData.append('media', media.file);
          
          await fetch('/api/whatsapp/send-immediate', {
            method: 'POST',
            body: formData
          });
        }
      } 
      // Se tiver apenas texto geral
      if (content && mediaFiles.length === 0) {
        const formData = new FormData();
        formData.append('groupId', groupId);
        formData.append('groupName', groupName);
        formData.append('content', content);
        await fetch('/api/whatsapp/send-immediate', {
          method: 'POST',
          body: formData
        });
      }

      addToast('Envio concluído com sucesso!', 'success');
      setContent('');
      setMediaFiles([]);
      setManualGroupName('');
      setIsCustomGroup(false);
    } catch (err) {
      addToast('Erro de conexão ao enviar agora.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const fetchData = useCallback(async () => {
    try {
      const [groupsRes, postsRes] = await Promise.all([
        fetch('/api/whatsapp/groups'),
        fetch('/api/whatsapp/scheduled-posts')
      ]);
      setGroups(await groupsRes.json());
      setScheduledPosts(await postsRes.json());
    } catch (err) {
      addToast('Erro ao carregar dados.', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Calendar Logic
  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    return { firstDay, daysInMonth, year, month };
  };

  const { firstDay, daysInMonth, year, month } = getDaysInMonth(currentMonth);
  
  const days = Array.from({ length: 42 }, (_, i) => {
    const dayNumber = i - firstDay + 1;
    const isCurrentMonth = dayNumber > 0 && dayNumber <= daysInMonth;
    return isCurrentMonth ? new Date(year, month, dayNumber) : null;
  });

  const nextMonth = () => setCurrentMonth(new Date(year, month + 1, 1));
  const prevMonth = () => setCurrentMonth(new Date(year, month - 1, 1));
  const today = new Date();

  const getPostsForDate = (date: Date) => {
    return scheduledPosts.filter(post => {
      const postDate = new Date(post.scheduledAt);
      return postDate.getDate() === date.getDate() &&
             postDate.getMonth() === date.getMonth() &&
             postDate.getFullYear() === date.getFullYear();
    }).sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
  };

  const handleDayClick = (date: Date) => {
    setSelectedDate(date);
    setShowCreate(false); // Reset form when changing days
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGroup || !selectedDate || !scheduledTime) {
      addToast('Preencha os campos obrigatórios do grupo e data.', 'warning');
      return;
    }
    
    if (mediaFiles.length === 0 && !content) {
      addToast('Escreva uma mensagem ou adicione imagens.', 'warning');
      return;
    }

    setSubmitting(true);
    try {
      const [hours, minutes] = scheduledTime.split(':');
      const finalDate = new Date(selectedDate);
      finalDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);

      const groupObj = groups.find(g => g.id === selectedGroup || g.subject === selectedGroup);
      const groupId = groupObj ? groupObj.id : selectedGroup;
      const groupName = groupObj ? groupObj.subject : selectedGroup;

      incrementGroupUsage(groupId);

      if (mediaFiles.length > 0) {
        for (const media of mediaFiles) {
          const formData = new FormData();
          formData.append('groupId', groupId);
          formData.append('groupName', groupName);
          formData.append('content', media.caption);
          formData.append('scheduledAt', finalDate.toISOString());
          formData.append('media', media.file);
          await fetch('/api/whatsapp/scheduled-posts', { method: 'POST', body: formData });
        }
      } 
      
      if (content && mediaFiles.length === 0) {
        const formData = new FormData();
        formData.append('groupId', groupId);
        formData.append('groupName', groupName);
        formData.append('content', content);
        formData.append('scheduledAt', finalDate.toISOString());
        await fetch('/api/whatsapp/scheduled-posts', { method: 'POST', body: formData });
      }

      addToast('Agendamento criado com sucesso!', 'success');
      setShowCreate(false);
      setContent('');
      setMediaFiles([]);
      setManualGroupName('');
      setIsCustomGroup(false);
      fetchData();
    } catch (err) {
      addToast('Erro de conexão.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja realmente cancelar este agendamento?')) return;
    try {
      const res = await fetch(`/api/whatsapp/scheduled-posts/${id}`, { method: 'DELETE' });
      if (res.ok) {
        addToast('Agendamento excluído.', 'success');
        fetchData();
      }
    } catch {
      addToast('Erro ao excluir.', 'error');
    }
  };

  if (loading) return <LoadingState />;

  // Se um dia foi selecionado, mostra a "Visão do Dia"
  if (selectedDate) {
    const dayPosts = getPostsForDate(selectedDate);
    const dateTitle = selectedDate.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });

    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
        <div className="flex items-center justify-between bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSelectedDate(null)}
              className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors text-slate-500"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h3 className="text-lg font-black text-slate-800 dark:text-slate-100 capitalize">{dateTitle}</h3>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{dayPosts.length} agendamento(s) para este dia</p>
            </div>
          </div>
          <button
            onClick={() => setShowCreate(!showCreate)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-black transition-all shadow-md ${
              showCreate 
                ? 'bg-slate-200 text-slate-700 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-200' 
                : 'bg-green-600 text-white hover:bg-green-700 shadow-green-500/20'
            }`}
          >
            {showCreate ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {showCreate ? 'Cancelar' : 'Nova Postagem'}
          </button>
        </div>

        {showCreate && (
          <form onSubmit={handleSubmit} className="bg-gradient-to-br from-white to-green-50/30 dark:from-slate-800 dark:to-slate-800 border border-green-100 dark:border-slate-700 rounded-3xl p-6 shadow-xl space-y-5 animate-in fade-in slide-in-from-top-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <Calendar className="w-4 h-4 text-green-600 dark:text-green-400" />
              </div>
              <h4 className="text-base font-black text-slate-800 dark:text-slate-200">Criar Novo Agendamento</h4>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Grupo do WhatsApp</label>
                  <button 
                    type="button"
                    onClick={() => { setLoading(true); fetchData(); }}
                    className="text-[9px] font-black text-blue-500 hover:text-blue-600 flex items-center gap-1 uppercase"
                  >
                    <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} /> Atualizar Grupos
                  </button>
                </div>
                <div className="relative">
                  <select
                    value={isCustomGroup ? 'custom' : selectedGroup}
                    onChange={e => {
                      const val = e.target.value;
                      if (val === 'custom') {
                        setIsCustomGroup(true);
                        setSelectedGroup('');
                      } else {
                        setIsCustomGroup(false);
                        setSelectedGroup(val);
                      }
                    }}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-medium outline-none focus:ring-2 focus:ring-green-500 shadow-sm appearance-none cursor-pointer"
                  >
                    <option value="">Selecione um grupo...</option>
                    {sortedGroups.map(g => (
                      <option key={g.id} value={g.id}>
                        {g.subject || g.name || g.id}
                      </option>
                    ))}
                    <option value="custom">-- Digitar nome manualmente --</option>
                  </select>
                  <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                </div>
                
                {isCustomGroup && (
                  <input
                    type="text"
                    value={manualGroupName}
                    onChange={e => {
                      setManualGroupName(e.target.value);
                      setSelectedGroup(e.target.value);
                    }}
                    placeholder="Digite o nome exato do grupo..."
                    className="w-full mt-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-medium outline-none focus:ring-2 focus:ring-green-500 shadow-sm animate-in fade-in slide-in-from-top-2"
                  />
                )}
                <p className="text-[10px] text-green-600 font-bold ml-1">O robô pesquisará pelo nome do grupo selecionado.</p>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Horário do Disparo</label>
                <input
                  type="time"
                  value={scheduledTime}
                  onChange={e => setScheduledTime(e.target.value)}
                  className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-medium outline-none focus:ring-2 focus:ring-green-500 shadow-sm"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Imagens e Legendas Inteligentes</label>
              
              <div className="flex items-center gap-4 p-4 bg-white dark:bg-slate-900 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl cursor-pointer hover:border-green-400 transition-colors relative">
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={handleFileChange}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                />
                <ImageIcon className="w-6 h-6 text-slate-400" />
                <span className="text-sm font-bold text-slate-500">
                  Clique para adicionar várias imagens (a IA criará as legendas!)
                </span>
              </div>

              {mediaFiles.length > 0 && (
                <div className="space-y-4 mt-4">
                  {mediaFiles.map((media) => (
                    <div key={media.id} className="flex flex-col sm:flex-row gap-4 p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm relative">
                      <button 
                        type="button" 
                        onClick={() => removeMedia(media.id)}
                        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow-md hover:bg-red-600"
                      >
                        <X className="w-4 h-4" />
                      </button>
                      <div className="w-full sm:w-32 h-32 flex-shrink-0 bg-slate-100 rounded-lg overflow-hidden border border-slate-200 flex items-center justify-center">
                        {media.base64 ? (
                          <img src={media.base64} alt="Preview" className="w-full h-full object-cover" />
                        ) : (
                          <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                        )}
                      </div>
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-bold text-slate-500">Legenda da Imagem</label>
                          {media.loading && <span className="text-xs text-green-600 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> IA escrevendo...</span>}
                        </div>
                        <textarea
                          value={media.caption}
                          onChange={(e) => {
                            const newCaption = e.target.value;
                            setMediaFiles(prev => prev.map(m => m.id === media.id ? { ...m, caption: newCaption } : m));
                          }}
                          className="w-full h-24 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-sm resize-none focus:ring-2 focus:ring-green-500 outline-none"
                          placeholder="Aguarde a IA ou escreva sua legenda aqui..."
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {mediaFiles.length === 0 && (
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Ou envie apenas um Texto (sem imagem)</label>
                <textarea
                  value={content}
                  onChange={e => setContent(e.target.value)}
                  rows={3}
                  placeholder="Escreva a mensagem..."
                  className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-medium outline-none focus:ring-2 focus:ring-green-500 resize-none shadow-sm"
                />
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
              <button
                type="submit"
                disabled={submitting}
                className="py-3.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-black text-sm shadow-xl shadow-amber-500/20 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Clock className="w-5 h-5" />}
                Agendar para as {scheduledTime}
              </button>

              <button
                type="button"
                onClick={handleImmediateSend}
                disabled={submitting}
                className="py-3.5 bg-green-600 hover:bg-green-700 text-white rounded-xl font-black text-sm shadow-xl shadow-green-500/30 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Zap className="w-5 h-5" />}
                Disparar Agora 🚀
              </button>
            </div>
          </form>
        )}

        <div className="grid grid-cols-1 gap-4">
          {dayPosts.length === 0 && !showCreate ? (
            <div className="text-center py-16 bg-slate-50 dark:bg-slate-800/50 rounded-3xl border-2 border-dashed border-slate-200 dark:border-slate-700">
              <div className="w-16 h-16 bg-white dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm">
                <Clock className="w-8 h-8 text-slate-300" />
              </div>
              <p className="text-slate-500 font-bold">Nenhuma postagem agendada para este dia.</p>
              <button 
                onClick={() => setShowCreate(true)}
                className="mt-4 px-4 py-2 text-sm font-bold text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-xl transition-colors"
              >
                + Criar primeira postagem do dia
              </button>
            </div>
          ) : (
            dayPosts.map(post => {
              const postTime = new Date(post.scheduledAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
              const isError = post.status === 'Erro';
              const isSent = post.status === 'Enviado';
              const isPending = post.status === 'Pendente';

              return (
                <div key={post.id} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all flex flex-col md:flex-row gap-4 relative overflow-hidden group">
                  {/* Decorative side bar */}
                  <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${
                    isSent ? 'bg-green-500' : isError ? 'bg-red-500' : 'bg-amber-400'
                  }`} />
                  
                  <div className="flex-1 space-y-3 pl-2">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="flex items-center gap-1.5 px-3 py-1 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-black uppercase tracking-wider">
                        <Users className="w-3.5 h-3.5" /> {post.groupName || post.groupId || 'Grupo'}
                      </span>
                      <span className={`px-3 py-1 rounded-lg text-xs font-black uppercase tracking-wider flex items-center gap-1.5 ${
                        isSent ? 'bg-green-50 text-green-600' : 
                        isError ? 'bg-red-50 text-red-600' : 
                        'bg-amber-50 text-amber-600'
                      }`}>
                        {isSent && <CheckCircle className="w-3 h-3" />}
                        {isError && <XCircle className="w-3 h-3" />}
                        {isPending && <Clock className="w-3 h-3" />}
                        {post.status}
                      </span>
                      <span className="text-xs font-bold text-slate-400 flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        {postTime}
                      </span>
                    </div>
                    
                    <p className="text-sm text-slate-600 dark:text-slate-300 line-clamp-3 bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl border border-slate-100 dark:border-slate-700">
                      {post.content}
                    </p>
                    
                    {post.mediaPath && (
                      <div className="inline-flex items-center gap-1.5 px-2 py-1 bg-blue-50 text-blue-600 rounded text-[10px] font-black uppercase tracking-widest">
                        <ImageIcon className="w-3.5 h-3.5" /> Contém imagem
                      </div>
                    )}
                    
                    {post.errorMessage && (
                      <p className="text-xs text-red-600 font-bold bg-red-50 p-2.5 rounded-xl border border-red-100 flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        {post.errorMessage}
                      </p>
                    )}
                  </div>
                  
                  <div className="flex md:flex-col justify-end gap-2 items-center md:items-end">
                    {isPending && (
                      <button
                        onClick={() => handleDelete(post.id)}
                        className="p-3 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-all"
                        title="Excluir agendamento"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  }

  // Visualização de Calendário
  const monthName = currentMonth.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const weekDays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Calendar className="w-6 h-6 text-green-600" />
            Calendário de Disparos
          </h3>
          
          <a
            href="/uploads/belafarma-agent.zip"
            download="belafarma-agent.zip"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-xl text-xs font-black shadow-md hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 transition-all cursor-pointer"
            title="Baixar Robô de Disparos do WhatsApp para Windows"
          >
            <Zap className="w-3.5 h-3.5 text-amber-300 animate-pulse" />
            Baixar Robô Windows 🤖
          </a>
        </div>
        
        <div className="flex items-center bg-white dark:bg-slate-800 rounded-xl p-1 shadow-sm border border-slate-200 dark:border-slate-700 self-end sm:self-auto">
          <button onClick={prevMonth} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors text-slate-600">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="px-4 text-sm font-black text-slate-700 dark:text-slate-200 capitalize min-w-[150px] text-center">
            {monthName}
          </span>
          <button onClick={nextMonth} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors text-slate-600">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
        {/* Cabeçalho dos Dias */}
        <div className="grid grid-cols-7 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
          {weekDays.map(day => (
            <div key={day} className="py-3 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">
              {day}
            </div>
          ))}
        </div>

        {/* Grid de Dias */}
        <div className="grid grid-cols-7">
          {days.map((date, i) => {
            if (!date) {
              return <div key={`empty-${i}`} className="min-h-[120px] bg-slate-50/50 dark:bg-slate-900/20 border-r border-b border-slate-100 dark:border-slate-800/50" />;
            }

            const dayPosts = getPostsForDate(date);
            const isToday = date.getDate() === today.getDate() && date.getMonth() === today.getMonth() && date.getFullYear() === today.getFullYear();
            
            return (
              <div
                key={date.toISOString()}
                onClick={() => handleDayClick(date)}
                className={`min-h-[120px] border-r border-b border-slate-100 dark:border-slate-800/50 p-2 cursor-pointer transition-all hover:bg-slate-50 dark:hover:bg-slate-700/30 group relative ${
                  isToday ? 'bg-green-50/30 dark:bg-green-900/10' : ''
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className={`w-7 h-7 flex items-center justify-center rounded-full text-xs font-black ${
                    isToday 
                      ? 'bg-green-600 text-white shadow-md shadow-green-500/30' 
                      : 'text-slate-600 dark:text-slate-400 group-hover:text-green-600'
                  }`}>
                    {date.getDate()}
                  </span>
                  {dayPosts.length > 0 && (
                    <span className="text-[9px] font-black text-slate-400 bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded">
                      {dayPosts.length}
                    </span>
                  )}
                </div>

                <div className="space-y-1.5">
                  {dayPosts.slice(0, 3).map(post => {
                    const isSent = post.status === 'Enviado';
                    const isError = post.status === 'Erro';
                    return (
                      <div 
                        key={post.id}
                        title={post.content}
                        className={`text-[9px] font-bold px-2 py-1 rounded truncate transition-all ${
                          isSent ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                          isError ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                          'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                        }`}
                      >
                        {new Date(post.scheduledAt).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})} - {post.groupName || 'Grupo'}
                      </div>
                    );
                  })}
                  {dayPosts.length > 3 && (
                    <div className="text-[9px] font-black text-slate-400 text-center pt-1">
                      + {dayPosts.length - 3} postagens
                    </div>
                  )}
                </div>

                {/* Botão sutil de + que aparece no hover */}
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 pointer-events-none bg-white/40 dark:bg-slate-900/40 backdrop-blur-[1px] transition-opacity">
                  <div className="w-8 h-8 rounded-full bg-green-600 text-white flex items-center justify-center shadow-lg transform scale-90 group-hover:scale-100 transition-all">
                    <Plus className="w-5 h-5" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
// ============================================================================
// POST-SALES (PÓS-VENDA) TAB
// ============================================================================
const PostSalesTab: React.FC = () => {
  const [newCustomers, setNewCustomers] = useState<any[]>([]);
  const [selectedClientIds, setSelectedClientIds] = useState<string[]>([]);
  const [daysPeriod, setDaysPeriod] = useState<number>(15);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [messageText, setMessageText] = useState(
    'Olá, {nome}! Tudo bem? Passando para agradecer a preferência na sua compra na BelaFarma. Deu tudo certo com o seu atendimento e a entrega? Esperamos que tenha tido uma ótima experiência! Qualquer dúvida estou à disposição. 💚'
  );
  const [expandedClientId, setExpandedClientId] = useState<string | null>(null);
  
  // Novos estados para pós-venda inteligente
  const [customMessages, setCustomMessages] = useState<Record<string, string>>({});
  const [auditingClients, setAuditingClients] = useState<Record<string, boolean>>({});
  const [generatingMessages, setGeneratingMessages] = useState<Record<string, boolean>>({});

  const { addToast } = useToast();

  const fetchNewCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/marketing/new-customers?days=${daysPeriod}`);
      if (res.ok) {
        const data = await res.json();
        setNewCustomers(data.newCustomers || []);
      } else {
        addToast('Erro ao carregar novos clientes.', 'error');
      }
    } catch {
      addToast('Erro de rede ao buscar novos clientes.', 'error');
    } finally {
      setLoading(false);
    }
  }, [daysPeriod, addToast]);

  useEffect(() => {
    fetchNewCustomers();
  }, [fetchNewCustomers]);

  const selectAll = () => {
    setSelectedClientIds(newCustomers.map(c => c.id || c.phone));
  };

  const deselectAll = () => {
    setSelectedClientIds([]);
  };

  const toggleClient = (id: string) => {
    setSelectedClientIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleSendPostSales = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedClientIds.length === 0) {
      addToast('Por favor, selecione pelo menos um cliente para receber a mensagem.', 'warning');
      return;
    }
    if (!messageText.trim() && !selectedClientIds.some(id => customMessages[id])) {
      addToast('A mensagem não pode estar em branco.', 'warning');
      return;
    }

    setSubmitting(true);
    try {
      const selectedClients = newCustomers.filter(c => 
        selectedClientIds.includes(c.id || c.phone)
      );

      const res = await fetch('/api/marketing/post-sales/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clients: selectedClients.map(c => {
            const key = c.id || c.phone;
            return {
              id: c.id,
              name: c.name,
              phone: c.phone,
              messageText: customMessages[key] || null
            };
          }),
          messageText
        })
      });

      if (res.ok) {
        const data = await res.json();
        addToast(`Pós-venda enviado com sucesso! ${data.sent} mensagens enviadas e ${data.failed} erros.`, 'success');
        deselectAll();
        fetchNewCustomers();
      } else {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Erro no disparo.');
      }
    } catch (err: any) {
      addToast(err.message || 'Erro ao processar envios.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
      {/* Top Info Banner */}
      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-indigo-950/20 dark:to-blue-950/20 border border-blue-100 dark:border-indigo-900/30 rounded-3xl p-6 shadow-sm flex items-start gap-4">
        <div className="p-3 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-blue-200/50 dark:border-indigo-800/30 shrink-0">
          <CheckCircle className="w-6 h-6 text-blue-600 animate-pulse" />
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-black text-slate-800 dark:text-slate-100 tracking-tight">
            Programa de Pós-Venda & Sucesso do Cliente
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium leading-relaxed max-w-3xl">
            Acompanhe os clientes novos conquistados nos últimos dias, verifique o que eles compraram e envie uma mensagem de agradecimento ou pesquisa de satisfação de forma automatizada pelo WhatsApp principal. Fidelize sua clientela desde o primeiro contato!
          </p>
        </div>
      </div>

      {/* Control Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="text-xs font-black text-slate-500 dark:text-slate-455 uppercase tracking-widest">Período de conquista:</span>
          <div className="flex bg-slate-100 dark:bg-slate-900 p-1 rounded-xl">
            {[7, 15, 30, 45].map(d => (
              <button
                key={d}
                type="button"
                onClick={() => setDaysPeriod(d)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  daysPeriod === d
                    ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-xs'
                    : 'text-slate-500 hover:text-slate-750 dark:text-slate-400'
                }`}
              >
                Últimos {d} dias
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={selectAll}
            className="px-4 py-2 text-xs font-black bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-xl transition-all shadow-sm cursor-pointer"
          >
            Selecionar Todos ({newCustomers.length})
          </button>
          <button
            onClick={deselectAll}
            className="px-4 py-2 text-xs font-black border border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-350 rounded-xl transition-all shadow-sm cursor-pointer"
          >
            Limpar Seleção
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
          <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
          <p className="text-sm font-bold text-slate-500 dark:text-slate-450">Buscando novos clientes conquistados...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Table Column */}
          <div className="lg:col-span-8 bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden animate-in fade-in duration-300">
            <div className="px-6 py-4 border-b border-slate-150 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30 flex items-center justify-between">
              <h3 className="text-sm font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                Novos Clientes Cadastrados ({newCustomers.length})
              </h3>
              <span className="text-[10px] font-black text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30 px-2.5 py-1 rounded-full uppercase tracking-wider">
                {selectedClientIds.length} Selecionados
              </span>
            </div>

            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left border-collapse min-w-[700px] responsive-table">
                <thead>
                  <tr className="border-b border-slate-150 dark:border-slate-700 bg-slate-50/30 dark:bg-slate-850/50 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                    <th className="py-4 px-5 text-center w-12">
                      <input
                        type="checkbox"
                        checked={selectedClientIds.length === newCustomers.length && newCustomers.length > 0}
                        onChange={(e) => {
                          if (e.target.checked) selectAll();
                          else deselectAll();
                        }}
                        className="w-4.5 h-4.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                    </th>
                    <th className="py-4 px-4">Cliente</th>
                    <th className="py-4 px-4 text-center">Cadastro</th>
                    <th className="py-4 px-4">Última Compra</th>
                    <th className="py-4 px-4 text-center">Status Pós-Venda</th>
                    <th className="py-4 px-4 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-150 dark:divide-slate-700">
                  {newCustomers.map(client => {
                    const key = client.id || client.phone;
                    const isSelected = selectedClientIds.includes(key);
                    const isExpanded = expandedClientId === key;
                    
                    const registerDate = client.createdAt ? new Date(client.createdAt).toLocaleDateString('pt-BR') : 'Sem data';
                    const lastSaleDate = client.lastSaleDate ? new Date(client.lastSaleDate).toLocaleDateString('pt-BR') : 'Nenhuma';
                    const valueFormatted = client.lastSaleValue ? `R$ ${client.lastSaleValue.toFixed(2)}` : 'R$ 0,00';
                    const purchasesCount = client.purchasedProducts?.length || 0;

                    return (
                      <React.Fragment key={key}>
                        <tr
                          onClick={() => toggleClient(key)}
                          className={`hover:bg-slate-50/50 dark:hover:bg-slate-750/15 cursor-pointer transition-all ${
                            isSelected ? 'bg-blue-50/10 dark:bg-blue-950/5' : ''
                          }`}
                        >
                          <td className="py-4 px-5 text-center" onClick={e => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleClient(key)}
                              className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                            />
                          </td>

                          <td className="py-4 px-4 min-w-[180px]">
                            <div className="flex flex-col">
                              <span className="text-sm font-bold text-slate-800 dark:text-slate-100">
                                {client.name}
                              </span>
                              <span className="text-xs text-slate-400 mt-0.5">📱 {client.phone}</span>
                            </div>
                          </td>

                          <td className="py-4 px-4 text-center whitespace-nowrap">
                            <span className="text-xs font-bold text-slate-600 dark:text-slate-330">
                              {registerDate}
                            </span>
                          </td>

                          <td className="py-4 px-4">
                            {client.lastSaleDate ? (
                              <div className="flex flex-col">
                                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                                  {lastSaleDate} — {valueFormatted}
                                </span>
                                <span className="text-[10px] text-blue-600 dark:text-blue-400 font-black uppercase tracking-wider mt-0.5">
                                  🛍️ {purchasesCount} produtos comprados
                                </span>
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400 italic">Sem vendas registradas</span>
                            )}
                          </td>

                          <td className="py-4 px-4 text-center whitespace-nowrap">
                            <span className={`text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider ${
                              client.postSalesStatus === 'Enviado'
                                ? 'bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400 border border-green-200/30'
                                : 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 border border-amber-200/30'
                            }`}>
                              {client.postSalesStatus === 'Enviado' ? '✉️ Enviado' : '⏳ Pendente'}
                            </span>
                            {client.sentAt && (
                              <span className="block text-[9px] text-slate-400 mt-1">
                                em {new Date(client.sentAt).toLocaleDateString('pt-BR')}
                              </span>
                            )}
                          </td>

                          <td className="py-4 px-4 text-center whitespace-nowrap" onClick={e => e.stopPropagation()}>
                            <button
                              onClick={() => setExpandedClientId(isExpanded ? null : key)}
                              className={`p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl text-slate-400 hover:text-slate-650 dark:hover:text-slate-200 transition-all`}
                              title="Ver Produtos Comprados"
                            >
                              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </button>
                          </td>
                        </tr>

                        {isExpanded && (
                          <tr className="bg-slate-50/50 dark:bg-slate-900/10">
                            <td colSpan={6} className="px-6 py-4 border-t border-slate-100 dark:border-slate-700/50">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in slide-in-from-top-2 duration-300">
                                <div className="space-y-2 pr-4 border-r border-transparent md:border-slate-150 dark:md:border-slate-800">
                                  <h4 className="text-[10px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-widest flex items-center gap-1.5">
                                    🛍️ Produtos da Última Compra
                                  </h4>
                                  {purchasesCount > 0 ? (
                                    <div className="flex flex-wrap gap-2 pt-1">
                                      {client.purchasedProducts.map((p: any, idx: number) => (
                                        <span
                                          key={idx}
                                          className="text-xs font-bold text-blue-700 bg-blue-50 dark:bg-blue-950/40 dark:text-blue-400 px-3 py-1.5 rounded-xl border border-blue-200/30 flex items-center gap-1"
                                        >
                                          📦 {p.productName} (x{p.quantity})
                                        </span>
                                      ))}
                                    </div>
                                  ) : (
                                    <div className="space-y-3">
                                      <p className="text-xs text-slate-400 italic py-1">Nenhum produto cadastrado nesta compra.</p>
                                      
                                      <button
                                        type="button"
                                        disabled={auditingClients[key]}
                                        onClick={async (e) => {
                                          e.stopPropagation();
                                          setAuditingClients(prev => ({ ...prev, [key]: true }));
                                          try {
                                            const auditRes = await fetch('/api/marketing/post-sales/audit', {
                                              method: 'POST',
                                              headers: { 'Content-Type': 'application/json' },
                                              body: JSON.stringify({ phone: client.phone, customerId: client.id })
                                            });
                                            if (auditRes.ok) {
                                              const auditData = await auditRes.json();
                                              if (auditData.success) {
                                                const detectedProducts = (auditData.products || []).map((pName: string) => ({
                                                  productName: `${pName} (WhatsApp)`,
                                                  quantity: 1
                                                }));
                                                
                                                setNewCustomers(prev => prev.map(c => {
                                                  const cKey = c.id || c.phone;
                                                  if (cKey === key) {
                                                    return {
                                                      ...c,
                                                      purchasedProducts: detectedProducts,
                                                      address: auditData.address || c.address
                                                    };
                                                  }
                                                  return c;
                                                }));

                                                if (auditData.suggestedMessage) {
                                                  setCustomMessages(prev => ({ ...prev, [key]: auditData.suggestedMessage }));
                                                }
                                                addToast('Conversa do WhatsApp analisada com sucesso pela Belinha!', 'success');
                                              } else {
                                                addToast(auditData.details || 'Nenhum dado capturado no WhatsApp.', 'info');
                                              }
                                            } else {
                                              addToast('Erro ao auditar conversa do WhatsApp.', 'error');
                                            }
                                          } catch (err) {
                                            addToast('Erro ao conectar com o serviço de auditoria.', 'error');
                                          } finally {
                                            setAuditingClients(prev => ({ ...prev, [key]: false }));
                                          }
                                        }}
                                        className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-4 py-2.5 bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white font-black text-xs rounded-xl shadow-md hover:shadow-lg active:scale-95 transition-all cursor-pointer disabled:opacity-50 disabled:scale-100"
                                      >
                                        {auditingClients[key] ? (
                                          <>
                                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                            Belinha lendo chat...
                                          </>
                                        ) : (
                                          <>
                                            <Zap className="w-3.5 h-3.5 text-amber-300 animate-pulse" />
                                            Rastrear WhatsApp com Belinha 🤖
                                          </>
                                        )}
                                      </button>
                                    </div>
                                  )}
                                </div>

                                <div className="space-y-2">
                                  <h4 className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest flex items-center gap-1.5">
                                    📍 Informações do Cliente (CRM)
                                  </h4>
                                  <div className="text-xs space-y-1 text-slate-500 dark:text-slate-400 font-medium">
                                    <p><strong className="text-slate-600 font-bold">Endereço:</strong> {client.address}</p>
                                    <p><strong className="text-slate-600 font-bold">Notas/Observações:</strong> {client.notes || 'Sem anotações registradas'}</p>
                                  </div>
                                </div>

                                {/* Custom Message Section */}
                                <div className="col-span-1 md:col-span-2 pt-4 border-t border-slate-200 dark:border-slate-700 space-y-3">
                                  <div className="flex items-center justify-between">
                                    <h4 className="text-[10px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-widest flex items-center gap-1.5">
                                      ✉️ Mensagem de Pós-Venda Personalizada (Belinha)
                                    </h4>
                                    {(purchasesCount > 0 || client.purchasedProducts?.length > 0) && (
                                      <button
                                        type="button"
                                        disabled={generatingMessages[key]}
                                        onClick={async (e) => {
                                          e.stopPropagation();
                                          setGeneratingMessages(prev => ({ ...prev, [key]: true }));
                                          try {
                                            const genRes = await fetch('/api/marketing/post-sales/generate-message', {
                                              method: 'POST',
                                              headers: { 'Content-Type': 'application/json' },
                                              body: JSON.stringify({ name: client.name, products: client.purchasedProducts.map((p: any) => p.productName) })
                                            });
                                            if (genRes.ok) {
                                              const genData = await genRes.json();
                                              if (genData.success) {
                                                setCustomMessages(prev => ({ ...prev, [key]: genData.suggestedMessage }));
                                                addToast('Mensagem personalizada gerada pela Belinha!', 'success');
                                              }
                                            } else {
                                              addToast('Erro ao gerar mensagem com a IA.', 'error');
                                            }
                                          } catch (err) {
                                            addToast('Erro de rede ao gerar mensagem.', 'error');
                                          } finally {
                                            setGeneratingMessages(prev => ({ ...prev, [key]: false }));
                                          }
                                        }}
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400 dark:hover:bg-blue-900/30 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer disabled:opacity-50"
                                      >
                                        {generatingMessages[key] ? (
                                          <>
                                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                            Gerando...
                                          </>
                                        ) : (
                                          <>
                                            <Sparkles className="w-3.5 h-3.5 text-blue-500" />
                                            Gerar com a Belinha ✨
                                          </>
                                        )}
                                      </button>
                                    )}
                                  </div>
                                  
                                  <textarea
                                    value={customMessages[key] || ''}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setCustomMessages(prev => ({ ...prev, [key]: val }));
                                    }}
                                    placeholder="Escreva ou gere uma mensagem específica para este cliente (ou deixe em branco para usar o modelo geral do painel)..."
                                    className="w-full h-24 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs outline-none focus:ring-2 focus:ring-blue-500 font-medium resize-none shadow-sm text-slate-800 dark:text-slate-200"
                                  />
                                  {customMessages[key] && (
                                    <div className="flex justify-between items-center text-[10px] text-green-600 font-bold">
                                      <span>✓ Mensagem customizada ativa para este cliente!</span>
                                      <button
                                        type="button"
                                        onClick={() => setCustomMessages(prev => {
                                          const next = { ...prev };
                                          delete next[key];
                                          return next;
                                        })}
                                        className="text-red-500 hover:text-red-650 transition-colors"
                                      >
                                        Limpar e usar geral
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {newCustomers.length === 0 && (
              <div className="text-center py-20 text-slate-400 dark:text-slate-500">
                <SmileIcon className="w-14 h-14 mx-auto mb-3 opacity-30 text-blue-500 animate-bounce" />
                <p className="font-bold text-slate-600 dark:text-slate-350">Nenhum cliente cadastrado neste período.</p>
                <p className="text-xs max-w-sm mx-auto mt-1">Experimente ampliar o filtro de dias acima para buscar novos contatos.</p>
              </div>
            )}
          </div>

          {/* Dispatch Column */}
          <div className="lg:col-span-4 bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm p-6 space-y-5">
            <h3 className="text-sm font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider border-b border-slate-100 dark:border-slate-700 pb-3 flex items-center gap-2">
              <Megaphone className="w-4 h-4 text-blue-600" />
              Configurar Pós-Venda
            </h3>

            <form onSubmit={handleSendPostSales} className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                  Mensagem de Agradecimento & Sucesso:
                </label>
                <textarea
                  required
                  value={messageText}
                  onChange={e => setMessageText(e.target.value)}
                  rows={6}
                  placeholder="Olá, {nome}! Obrigado pela compra..."
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500 transition-all shadow-sm text-slate-800 dark:text-slate-200 font-medium"
                />
                <span className="block text-[10px] text-slate-400 font-medium">
                  Use a tag <code className="text-blue-600 font-bold">{'{nome}'}</code> para que a IA/sistema insira o nome do cliente de forma dinâmica!
                </span>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={submitting || selectedClientIds.length === 0}
                  className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:from-slate-300 disabled:to-slate-400 dark:disabled:from-slate-800 dark:disabled:to-slate-700 text-white font-black py-4 rounded-xl text-xs uppercase tracking-wider shadow-md hover:scale-[1.01] active:scale-[0.99] disabled:scale-100 transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Disparando Mensagens...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      Enviar Pós-Venda ({selectedClientIds.length})
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// CRM INACTIVE CUSTOMERS TAB
// ============================================================================
const CRMInactiveTab: React.FC = () => {
  const [inactiveCustomers, setInactiveCustomers] = useState<any[]>([]);
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<string[]>([]);
  const [inactivityDays, setInactivityDays] = useState<number>(30);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [expandedCustomerId, setExpandedCustomerId] = useState<string | null>(null);
  
  // Form para disparo
  const [campaignName, setCampaignName] = useState('');
  const [messageText, setMessageText] = useState('');
  const { addToast } = useToast();

  // Busca dados de clientes inativos e templates
  const fetchInactiveData = useCallback(async () => {
    setLoading(true);
    try {
      const [custRes, tempRes] = await Promise.all([
        fetch(`/api/marketing/inactive-customers?days=${inactivityDays}`),
        fetch('/api/messages/templates')
      ]);
      if (custRes.ok && tempRes.ok) {
        const custData = await custRes.json();
        const list = Array.isArray(custData) ? custData : (custData.inactiveCustomers || []);
        setInactiveCustomers(list);
        setTemplates(await tempRes.json());
      } else {
        addToast('Erro ao carregar dados dos clientes inativos.', 'error');
      }
    } catch (err) {
      addToast('Erro de rede ao buscar dados.', 'error');
    } finally {
      setLoading(false);
    }
  }, [inactivityDays, addToast]);

  useEffect(() => {
    fetchInactiveData();
  }, [fetchInactiveData]);

  // Preencher nome da campanha sugerido
  useEffect(() => {
    const today = new Date().toLocaleDateString('pt-BR');
    setCampaignName(`Reativação CRM - Sem contato há ${inactivityDays} dias (${today})`);
  }, [inactivityDays]);

  // Ao selecionar um template, preenche a mensagem
  const handleTemplateChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const templateId = e.target.value;
    setSelectedTemplateId(templateId);
    const selected = templates.find(t => t.id === templateId);
    if (selected) {
      setMessageText(selected.content);
    } else {
      setMessageText('');
    }
  };

  // Sugere mensagem inteligente personalizada para o cliente individual
  const handleSmartMessage = (customer: any) => {
    let customMsg = `Olá, ${customer.systemName || customer.whatsappName || 'tudo bem'}! ✨\n\nPassando para saber se está precisando de alguma coisa. `;
    
    if (customer.purchasedProducts && customer.purchasedProducts.length > 0) {
      const lastProduct = customer.purchasedProducts[0].productName;
      customMsg += `Notei que faz um tempinho que você levou o seu *${lastProduct}*. Precisa de reposição ou de mais algum medicamento? 💊`;
    } else if (customer.searchedProducts && customer.searchedProducts.length > 0) {
      const lastSearched = customer.searchedProducts[0].productName;
      customMsg += `Lembrei que você havia nos consultado sobre o *${lastSearched}* anteriormente. O produto já está disponível ou precisa de ajuda com alguma outra fórmula? 🧪`;
    } else {
      customMsg += `Fazia um tempinho que não nos falávamos por aqui! Se precisar de qualquer medicamento, dermocosmético ou dica de saúde, é só me chamar.`;
    }
    
    customMsg += `\n\nQualquer coisa, estamos aqui no WhatsApp da BelaFarma! 🚀`;
    setMessageText(customMsg);
    
    // Auto-seleciona apenas este cliente para facilitar o reengajamento rápido individual!
    const key = customer.customerId || customer.phone;
    if (!selectedCustomerIds.includes(key)) {
      setSelectedCustomerIds([key]);
    }
    
    addToast(`Mensagem personalizada gerada para ${customer.systemName || customer.whatsappName}!`, 'success');
  };

  // Seleções individuais
  const toggleCustomer = (id: string) => {
    setSelectedCustomerIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  // Selecionar todos filtrados
  const selectAll = () => {
    const ids = inactiveCustomers.filter(c => c.phone).map(c => c.customerId || c.phone);
    setSelectedCustomerIds(ids);
  };

  const deselectAll = () => setSelectedCustomerIds([]);

  // Disparar campanha
  const handleDispatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedCustomerIds.length === 0) {
      addToast('Selecione pelo menos um cliente para entrar em contato.', 'warning');
      return;
    }
    if (!campaignName || !messageText) {
      addToast('Preencha o nome da campanha e o texto da mensagem.', 'warning');
      return;
    }

    setSubmitting(true);
    try {
      // 1. Identifica os contatos selecionados
      const selectedContacts = inactiveCustomers.filter(c => 
        selectedCustomerIds.includes(c.customerId || c.phone)
      );

      const finalCustomerIds: string[] = [];

      // 2. Cadastra no CRM (de forma transparente em lote) quem veio apenas do WhatsApp sem cadastro
      const registrationPromises = selectedContacts.map(async (contact) => {
        if (contact.isRegistered && contact.customerId) {
          finalCustomerIds.push(contact.customerId);
        } else {
          // Cadastra automaticamente na tabela customers
          const newCustomerId = `cust-wa-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
          const registerRes = await fetch('/api/customers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: newCustomerId,
              name: contact.systemName || contact.whatsappName || `Cliente WA ${contact.phone.slice(-4)}`,
              nickname: contact.whatsappName || '',
              phone: contact.phone,
              notes: 'Cadastrado automaticamente via Reengajamento CRM de Clientes Inativos'
            })
          });

          if (registerRes.ok) {
            finalCustomerIds.push(newCustomerId);
            // Atualiza dados locais
            contact.customerId = newCustomerId;
            contact.isRegistered = true;
          } else {
            console.error(`Falha ao registrar cliente ${contact.phone} no CRM.`);
          }
        }
      });

      if (registrationPromises.length > 0) {
        await Promise.all(registrationPromises);
      }

      if (finalCustomerIds.length === 0) {
        throw new Error('Nenhum cliente válido pôde ser registrado ou enviado para a campanha.');
      }

      // 3. Criar a campanha com os IDs dos clientes cadastrados
      const campaignRes = await fetch('/api/messages/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: campaignName,
          description: `Disparo automático para clientes inativos há mais de ${inactivityDays} dias.`,
          messageContent: messageText,
          targetCustomerIds: finalCustomerIds,
        }),
      });

      if (!campaignRes.ok) {
        throw new Error('Falha ao registrar campanha no banco de dados.');
      }

      const campaignData = await campaignRes.json();
      const campaignId = campaignData.id;

      // 4. Executar a campanha para disparar as mensagens via Evolution API
      const executeRes = await fetch(`/api/messages/campaigns/${campaignId}/execute`, {
        method: 'POST'
      });

      if (!executeRes.ok) {
        throw new Error('Falha ao agendar os envios das mensagens.');
      }

      const executeData = await executeRes.json();
      
      addToast(`Campanha disparada com sucesso! ${executeData.sent} mensagens colocadas na fila de envio.`, 'success');
      
      // Limpa seleções
      setSelectedCustomerIds([]);
      setMessageText('');
      setSelectedTemplateId('');
      
      // Recarrega a lista para atualizar interações
      fetchInactiveData();
    } catch (err: any) {
      addToast(err.message || 'Erro ao processar disparo.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
      {/* Top Info Banner */}
      <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-emerald-950/20 dark:to-green-950/20 border border-green-100 dark:border-green-900/30 rounded-3xl p-6 shadow-sm flex items-start gap-4">
        <div className="p-3 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-green-200/50 dark:border-green-800/30 shrink-0">
          <RefreshCw className="w-6 h-6 text-green-600 animate-spin" style={{ animationDuration: '6s' }} />
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-black text-slate-800 dark:text-slate-100 tracking-tight">
            Campanha de Retenção e Reengajamento CRM
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium leading-relaxed max-w-3xl">
            Esta tela analisa de forma inteligente todo o seu banco de dados local da farmácia (fechamentos de caixa, crediários, vendas PDV e histórico do WhatsApp principal) para identificar clientes que estão sumidos. Veja abaixo o histórico de produtos que eles compraram ou procuraram e use as mensagens inteligentes para reengajar!
          </p>
        </div>
      </div>

      {/* Control Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
        <div className="flex items-center gap-3 flex-1">
          <label className="text-xs font-black text-slate-500 uppercase tracking-widest whitespace-nowrap">
            Tempo de Inatividade:
          </label>
          <select
            value={inactivityDays}
            onChange={e => setInactivityDays(Number(e.target.value))}
            className="px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-green-500 outline-none transition-all shadow-sm max-w-xs"
          >
            <option value="7">Mais de 7 dias sem contato</option>
            <option value="15">Mais de 15 dias sem contato</option>
            <option value="30">Mais de 30 dias (1 mês)</option>
            <option value="45">Mais de 45 dias</option>
            <option value="60">Mais de 60 dias (2 meses)</option>
            <option value="90">Mais de 90 dias (3 meses)</option>
            <option value="120">Mais de 120 dias (4 meses)</option>
            <option value="180">Mais de 180 dias (Semestre)</option>
          </select>
        </div>

        <div className="flex gap-2">
          <button
            onClick={selectAll}
            className="px-4 py-2 text-xs font-black bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-xl transition-all shadow-sm"
          >
            Selecionar Todos ({inactiveCustomers.length})
          </button>
          <button
            onClick={deselectAll}
            className="px-4 py-2 text-xs font-black border border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-300 rounded-xl transition-all shadow-sm"
          >
            Limpar Seleção
          </button>
        </div>
      </div>

      {loading ? (
        <LoadingState />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-8 bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden animate-in fade-in duration-300">
            <div className="px-6 py-4 border-b border-slate-150 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30 flex items-center justify-between">
              <h3 className="text-sm font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                Auditoria de Conversas e Clientes Inativos ({inactiveCustomers.length})
              </h3>
              <span className="text-[10px] font-black text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 px-2.5 py-1 rounded-full uppercase tracking-wider">
                {selectedCustomerIds.length} Selecionados
              </span>
            </div>

            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left border-collapse min-w-[750px] responsive-table">
                <thead>
                  <tr className="border-b border-slate-150 dark:border-slate-700 bg-slate-50/30 dark:bg-slate-850/50 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                    <th className="py-4 px-5 text-center w-12">
                      <input
                        type="checkbox"
                        checked={selectedCustomerIds.length === inactiveCustomers.length && inactiveCustomers.length > 0}
                        onChange={(e) => {
                          if (e.target.checked) selectAll();
                          else deselectAll();
                        }}
                        className="w-4.5 h-4.5 rounded border-slate-300 text-green-600 focus:ring-green-500 cursor-pointer"
                      />
                    </th>
                    <th className="py-4 px-4">Cliente / Telefone</th>
                    <th className="py-4 px-4 text-center">Inativo</th>
                    <th className="py-4 px-4 text-center">Atendido</th>
                    <th className="py-4 px-4">Desfecho Comercial</th>
                    <th className="py-4 px-4">Endereço Extraído</th>
                    <th className="py-4 px-4 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-150 dark:divide-slate-700">
                  {inactiveCustomers.map(customer => {
                    const key = customer.customerId || customer.phone;
                    const isSelected = selectedCustomerIds.includes(key);
                    const isExpanded = expandedCustomerId === key;
                    
                    let helperText = 'Nunca interagiu';
                    if (customer.lastInteraction) {
                      const lastDate = new Date(customer.lastInteraction);
                      helperText = `Último contato em ${lastDate.toLocaleDateString('pt-BR')}`;
                    }

                    // Modalidade Badge styling
                    let modalBadgeClass = "bg-slate-100 text-slate-700 dark:bg-slate-750 dark:text-slate-350";
                    let modalText = "❓ Outro";
                    
                    if (customer.modalidade === 'entrega') {
                      modalBadgeClass = "bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-450 border border-green-200/40";
                      modalText = "🛵 Entrega";
                    } else if (customer.modalidade === 'retirada') {
                      modalBadgeClass = "bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-450 border border-blue-200/40";
                      modalText = "🏪 Retirada";
                    } else if (customer.modalidade === 'abandonou_apos_preco') {
                      modalBadgeClass = "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-450 border border-amber-200/40";
                      modalText = "💸 Abandono (Preço)";
                    } else if (customer.modalidade === 'nao_atendido') {
                      modalBadgeClass = "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-450 border border-red-200/40";
                      modalText = "⚠️ Não Atendido";
                    }

                    const purchasesCount = customer.purchasedProducts?.length || 0;
                    const shortagesCount = customer.searchedProducts?.length || 0;

                    const handleCopyAddress = (e: React.MouseEvent, address: string) => {
                      e.stopPropagation();
                      if (address && address !== 'Não informado na conversa') {
                        navigator.clipboard.writeText(address);
                        addToast('Endereço copiado para a área de transferência! 📋', 'success');
                      }
                    };

                    return (
                      <React.Fragment key={key}>
                        {/* Main Info Row */}
                        <tr 
                          onClick={() => toggleCustomer(key)}
                          className={`hover:bg-slate-50/50 dark:hover:bg-slate-750/15 cursor-pointer transition-all ${
                            isSelected ? 'bg-green-50/10 dark:bg-green-950/5' : ''
                          }`}
                        >
                          <td className="py-4 px-5 text-center" onClick={e => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleCustomer(key)}
                              className="w-4 h-4 rounded border-slate-300 text-green-600 focus:ring-green-500 cursor-pointer"
                            />
                          </td>
                          
                          <td className="py-4 px-4 min-w-[200px]">
                            <div className="flex flex-col">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-sm font-bold text-slate-800 dark:text-slate-100">
                                  {customer.systemName || customer.name}
                                </span>
                                {customer.whatsappName && customer.whatsappName !== customer.systemName && (
                                  <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">
                                    ({customer.whatsappName})
                                  </span>
                                )}
                              </div>
                              <span className="text-xs text-slate-400 mt-0.5">📱 {customer.phone}</span>
                              
                              <div className="flex gap-1.5 mt-1">
                                {customer.isRegistered ? (
                                  <span className="text-[8px] font-black text-green-650 bg-green-50 dark:bg-green-950/30 px-1 py-0.5 rounded border border-green-200/30 uppercase tracking-widest">
                                    ✓ CRM
                                  </span>
                                ) : (
                                  <span className="text-[8px] font-black text-slate-450 bg-slate-100 dark:bg-slate-700/50 px-1 py-0.5 rounded border border-slate-200/30 uppercase tracking-widest">
                                    Sem Cadastro
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>

                          <td className="py-4 px-4 text-center whitespace-nowrap">
                            <div className="flex flex-col items-center">
                              <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                                customer.inactivityDays >= 45 
                                  ? 'bg-red-50 text-red-650 dark:bg-red-950/30 dark:text-red-400' 
                                  : 'bg-amber-50 text-amber-650 dark:bg-amber-950/30 dark:text-amber-400'
                              }`}>
                                {customer.inactivityDays} dias
                              </span>
                              <span className="text-[9px] text-slate-400 mt-0.5 whitespace-nowrap">{helperText}</span>
                            </div>
                          </td>

                          <td className="py-4 px-4 text-center whitespace-nowrap">
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                              customer.atendido 
                                ? 'bg-emerald-50 text-emerald-655 dark:bg-emerald-950/30 dark:text-emerald-450 border border-emerald-100 dark:border-emerald-900/30' 
                                : 'bg-rose-50 text-rose-655 dark:bg-rose-950/30 dark:text-rose-455 border border-rose-100 dark:border-rose-900/30'
                            }`}>
                              {customer.atendido ? '✔️ Sim' : '❌ Não'}
                            </span>
                          </td>

                          <td className="py-4 px-4 min-w-[160px]">
                            <div className="flex flex-col">
                              <span className={`text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-wider w-max ${modalBadgeClass}`}>
                                {modalText}
                              </span>
                              <span className="text-[10px] text-slate-400 mt-1 leading-normal">
                                {customer.modalidadeDescricao}
                              </span>
                            </div>
                          </td>

                          <td className="py-4 px-4 max-w-xs">
                            <div 
                              onClick={(e) => handleCopyAddress(e, customer.endereco)}
                              className={`group text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-900 p-2 rounded-xl border border-slate-150 dark:border-slate-750 flex items-center justify-between gap-2 hover:border-green-300 dark:hover:border-green-800 transition-all ${
                                customer.endereco && customer.endereco !== 'Não informado na conversa' ? 'cursor-pointer active:scale-98' : ''
                              }`}
                              title={customer.endereco && customer.endereco !== 'Não informado na conversa' ? "Clique para Copiar Endereço" : ""}
                            >
                              <span className="truncate max-w-[160px]" style={{ direction: 'ltr' }}>
                                {customer.endereco}
                              </span>
                              {customer.endereco && customer.endereco !== 'Não informado na conversa' && (
                                <span className="text-[10px] opacity-0 group-hover:opacity-100 text-green-600 font-bold shrink-0 transition-opacity">
                                  📋 Copiar
                                </span>
                              )}
                            </div>
                          </td>

                          <td className="py-4 px-4 text-center whitespace-nowrap" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                onClick={() => handleSmartMessage(customer)}
                                className="p-2 bg-gradient-to-br from-green-50 to-emerald-50 hover:from-green-100 hover:to-emerald-100 dark:from-slate-700 dark:hover:from-slate-600 dark:to-slate-750 rounded-xl text-green-600 dark:text-green-400 hover:scale-105 active:scale-95 transition-all border border-green-200/50 dark:border-slate-600"
                                title="Gerar Mensagem Inteligente baseada no Histórico"
                              >
                                <Zap className="w-3.5 h-3.5" />
                              </button>

                              <button
                                onClick={() => setExpandedCustomerId(isExpanded ? null : key)}
                                className={`p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-all`}
                                title="Ver Detalhes do Histórico"
                              >
                                {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                              </button>
                            </div>
                          </td>
                        </tr>

                        {/* Expandible Drawer Row */}
                        {isExpanded && (
                          <tr className="bg-slate-50/50 dark:bg-slate-900/10">
                            <td colSpan={7} className="px-6 py-4 border-t border-slate-100 dark:border-slate-700/50">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in slide-in-from-top-2 duration-300">
                                {/* Identified Products */}
                                <div className="space-y-2 border-r border-transparent md:border-slate-150 dark:md:border-slate-800 pr-4">
                                  <h4 className="text-[10px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-widest flex items-center gap-1.5">
                                    🛍️ Produtos Identificados pela IA (Conversa WA)
                                  </h4>
                                  
                                  {purchasesCount > 0 ? (
                                    <div className="flex flex-wrap gap-2 pt-1">
                                      {customer.purchasedProducts.map((p: any, idx: number) => (
                                        <span 
                                          key={idx} 
                                          className="text-xs font-bold text-blue-700 bg-blue-50 dark:bg-blue-950/40 dark:text-blue-400 px-3 py-1.5 rounded-xl border border-blue-200/30 flex items-center gap-1.5"
                                        >
                                          📦 {p.productName}
                                        </span>
                                      ))}
                                    </div>
                                  ) : (
                                    <p className="text-xs text-slate-400 italic py-1">
                                      Nenhum produto com compra fechada detectado na conversa recente.
                                    </p>
                                  )}

                                  {shortagesCount > 0 && (
                                    <div className="space-y-2 pt-2">
                                      <h5 className="text-[9px] font-black text-purple-600 dark:text-purple-400 uppercase tracking-widest">
                                        📋 Desejos / Faltas Consultadas
                                      </h5>
                                      <div className="flex flex-wrap gap-2">
                                        {customer.searchedProducts.map((s: any, idx: number) => (
                                          <span 
                                            key={idx} 
                                            className="text-xs font-bold text-purple-700 bg-purple-50 dark:bg-purple-950/40 dark:text-purple-450 px-3 py-1.5 rounded-xl border border-purple-200/30 flex items-center gap-1.5"
                                          >
                                            ⚠️ {s.productName}
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>

                                {/* CRM and Context Notes */}
                                <div className="space-y-2">
                                  <h4 className="text-[10px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-widest flex items-center gap-1.5">
                                    📝 Ficha e Anotações Internas (CRM)
                                  </h4>
                                  
                                  <div className="bg-white dark:bg-slate-800 p-3.5 rounded-2xl border border-slate-150 dark:border-slate-700 space-y-2 shadow-xs">
                                    <div className="text-xs space-y-1">
                                      <p className="text-slate-400"><strong className="text-slate-500 font-black">Última Mensagem:</strong> "{customer.lastMessage || 'Sem conteúdo de texto'}"</p>
                                      {customer.customerNotes && (
                                        <p className="text-slate-400"><strong className="text-slate-500 font-black">Anotação CRM:</strong> {customer.customerNotes}</p>
                                      )}
                                      <p className="text-slate-405"><strong className="text-slate-550 font-black">Fidelização:</strong> {customer.isRegistered ? 'Cliente cadastrado no banco CRM' : 'Contato não cadastrado (registro automático pendente)'}</p>
                                    </div>
                                    
                                    {customer.ideiaReativacao && (
                                      <div className="mt-3 p-3.5 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20 border border-amber-150 dark:border-amber-900/35 rounded-xl space-y-1">
                                        <span className="text-[10px] font-black text-amber-700 dark:text-amber-400 uppercase tracking-widest flex items-center gap-1">
                                          💡 Ideia de Reativação da Isa (IA)
                                        </span>
                                        <p className="text-xs font-bold text-slate-700 dark:text-slate-200 italic leading-relaxed">
                                          "{customer.ideiaReativacao}"
                                        </p>
                                      </div>
                                    )}
                                    
                                    <div className="pt-2 flex gap-2">
                                      <button 
                                        onClick={() => handleSmartMessage(customer)}
                                        className="text-[10px] font-black bg-slate-100 hover:bg-slate-200 dark:bg-slate-750 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 px-3 py-1.5 rounded-xl transition-all flex items-center gap-1 cursor-pointer"
                                      >
                                        ✨ Usar Reengajamento Personalizado
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {inactiveCustomers.length === 0 && (
              <div className="text-center py-20 text-slate-400 dark:text-slate-500">
                <SmileIcon className="w-14 h-14 mx-auto mb-3 opacity-30 text-green-500 animate-bounce" />
                <p className="font-bold text-slate-600 dark:text-slate-350">Sensacional! Nenhum cliente inativo encontrado.</p>
                <p className="text-xs max-w-sm mx-auto mt-1">Todos os clientes foram contactados ou compraram no WhatsApp/Balcão nos últimos {inactivityDays} dias!</p>
              </div>
            )}
          </div>

          {/* Dispatch Section */}
          <div className="lg:col-span-5 bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm p-6 space-y-5">
            <h3 className="text-sm font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider border-b border-slate-100 dark:border-slate-700 pb-3 flex items-center gap-2">
              <Megaphone className="w-4 h-4 text-green-600" />
              Configurar Mensagem de Promoção
            </h3>

            <form onSubmit={handleDispatch} className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                  Nome da Campanha CRM:
                </label>
                <input
                  type="text"
                  required
                  value={campaignName}
                  onChange={e => setCampaignName(e.target.value)}
                  placeholder="Ex: Reativação CRM de Maio"
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-medium outline-none focus:ring-2 focus:ring-green-500 transition-all shadow-sm text-slate-800 dark:text-slate-200"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                  Importar de um Template (Opcional):
                </label>
                <select
                  value={selectedTemplateId}
                  onChange={handleTemplateChange}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-bold text-slate-750 dark:text-slate-300 focus:ring-2 focus:ring-green-500 outline-none transition-all shadow-sm"
                >
                  <option value="">Selecione um template para preencher...</option>
                  {templates.filter(t => t.isActive).map(temp => (
                    <option key={temp.id} value={temp.id}>
                      {temp.name} ({temp.type === 'cobranca' ? '💰' : temp.type === 'promocao' ? '🏷️' : '📩'} {temp.type})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                  Conteúdo da Mensagem (Promoção):
                </label>
                <textarea
                  required
                  value={messageText}
                  onChange={e => setMessageText(e.target.value)}
                  rows={6}
                  placeholder="Escreva a oferta ou mensagem de reengajamento..."
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-medium outline-none focus:ring-2 focus:ring-green-500 resize-none shadow-sm text-slate-800 dark:text-slate-200"
                />
                <span className="text-[10px] font-bold text-slate-400 leading-normal block">
                  💡 Variáveis disponíveis: {'{nome}'}, {'{apelido}'}
                </span>
                <span className="text-[10px] font-bold text-slate-400 leading-normal block mt-1">
                  Nota: Se o cliente não possuir cadastro no CRM, ele será inscrito automaticamente durante o envio!
                </span>
              </div>

              <button
                type="submit"
                disabled={submitting || selectedCustomerIds.length === 0}
                className="w-full py-4 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white rounded-2xl font-black text-sm shadow-xl shadow-green-500/25 dark:shadow-green-950/40 transition-all disabled:opacity-50 flex items-center justify-center gap-2 hover:-translate-y-0.5 active:translate-y-0 cursor-pointer"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Enviando para Fila...
                  </>
                ) : (
                  <>
                    <Play className="w-5 h-5" />
                    Disparar Promoção ({selectedCustomerIds.length} Clientes) 🚀
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

// Lucide replacement for missing Smile icon in import
const SmileIcon: React.FC<any> = (props) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <circle cx="12" cy="12" r="10" />
    <path d="M8 14s1.5 2 4 2 4-2 4-2" />
    <line x1="9" x2="9.01" y1="9" y2="9" />
    <line x1="15" x2="15.01" y1="9" y2="9" />
  </svg>
);

// ============================================================================
// HELPER COMPONENTS
// ============================================================================
const LoadingState: React.FC = () => (
  <div className="flex items-center justify-center py-12">
    <Loader2 className="w-8 h-8 text-green-600 animate-spin" />
  </div>
);

const StatCard: React.FC<{ label: string; value: number; icon: React.ReactNode; color: string }> = ({ label, value, icon, color }) => (
  <div className={`rounded-2xl p-5 ${color} border border-transparent`}>
    <div className="flex items-center justify-between">
      <div>
        <p className="text-xs font-bold uppercase tracking-wider opacity-70">{label}</p>
        <p className="text-3xl font-black mt-1">{value}</p>
      </div>
      <div className="opacity-30">{icon}</div>
    </div>
  </div>
);
