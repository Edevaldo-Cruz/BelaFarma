import React, { useState, useEffect, useCallback } from 'react';
import {
  MessageSquare, Clock, Send, Megaphone, History,
  Edit3, Save, X, Play, Eye, Trash2, Plus,
  CheckCircle, XCircle, AlertCircle, RefreshCw,
  ChevronDown, ChevronUp, Loader2, Search,
  ToggleLeft, ToggleRight, Zap, Users, Cake, CreditCard,
  BarChart3
} from 'lucide-react';
import { useToast } from './ToastContext';
import { MessageTemplate, MessageLog, MessageCampaign, MessageSchedule, Customer } from '../types';

// ============================================================================
// TABS
// ============================================================================
type Tab = 'templates' | 'schedules' | 'send' | 'campaigns' | 'log' | 'stats';

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'templates', label: 'Templates', icon: Edit3 },
  { id: 'schedules', label: 'Agendamentos', icon: Clock },
  { id: 'send', label: 'Enviar', icon: Send },
  { id: 'campaigns', label: 'Campanhas', icon: Megaphone },
  { id: 'log', label: 'Histórico', icon: History },
  { id: 'stats', label: 'Estatísticas', icon: BarChart3 },
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
            WhatsApp via OpenClaw — Templates, Agendamentos e Campanhas
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
      {activeTab === 'log' && <LogTab />}
      {activeTab === 'stats' && <StatsTab />}
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
          <table className="w-full text-sm">
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
