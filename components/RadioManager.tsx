import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Radio, Plus, Trash2, Edit3, Save, X, Volume2,
  Clock, Zap, RefreshCw, Wifi, WifiOff, Music2, Megaphone,
  Music, Disc3, Play, Pause, SkipBack, SkipForward
} from 'lucide-react';
import { useToast } from './ToastContext';

interface Anuncio {
  id: number;
  titulo: string;
  mensagem: string;
  voz: 'feminina' | 'masculina';
  ativo: boolean;
  criado_em: string;
  validade_ate?: string | null;
}

interface MusicaAtual {
  titulo: string;
  artista: string;
  album: string;
  duracao_s: number;
  progresso_s: number;
  duracao_fmt: string;
  progresso_fmt: string;
  tocando: boolean;
  capa_url: string | null;
}

interface RadioStatus {
  status: 'online' | 'offline';
  hora: string;
  saudacao: string;
  fila: number;
  promos: number;
  intervalo_promo_min: number;
  intervalo_hora_min: number;
  musica_atual: MusicaAtual | null;
}

// Frontend requests go to the Node proxy, avoiding CORS entirely
const API_PREFIX = '/api/radio';

// ─── Componente: Player da Música Atual ──────────────────────────────────────
const PlayerMusica: React.FC<{ musica: MusicaAtual; progresso: number; onAction: (acao: string) => void }> = ({ musica, progresso, onAction }) => {
  const pct = musica.duracao_s > 0 ? Math.min((progresso / musica.duracao_s) * 100, 100) : 0;
  const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  return (
    <div className="flex items-center gap-4 p-4 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm relative overflow-hidden group">
      {/* Capa */}
      <div className="relative flex-shrink-0 z-10">
        {musica.capa_url ? (
          <img
            src={musica.capa_url}
            alt={musica.album}
            className="w-16 h-16 rounded-xl object-cover shadow-md"
          />
        ) : (
          <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
            <Disc3 className="w-8 h-8 text-white animate-spin" style={{ animationDuration: '3s' }} />
          </div>
        )}
      </div>

      {/* Info & Controles */}
      <div className="flex-1 min-w-0 z-10 flex flex-col justify-between">
        <div className="flex justify-between items-start">
          <div className="truncate pr-2">
            <p className="font-black text-sm text-slate-900 dark:text-slate-100 truncate">{musica.titulo}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{musica.artista}</p>
          </div>
          
          {/* Controles do Player */}
          <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-900/50 p-1.5 rounded-xl border border-slate-100 dark:border-slate-700">
            <button onClick={() => onAction('prev')} className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors">
              <SkipBack className="w-4 h-4 text-slate-600 dark:text-slate-400" />
            </button>
            <button onClick={() => onAction(musica.tocando ? 'pause' : 'play')} className={`p-1.5 rounded-lg transition-colors ${musica.tocando ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400' : 'hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400'}`}>
              {musica.tocando ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
            </button>
            <button onClick={() => onAction('next')} className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors">
              <SkipForward className="w-4 h-4 text-slate-600 dark:text-slate-400" />
            </button>
          </div>
        </div>

        {/* Barra de progresso */}
        <div className="mt-2 flex items-center gap-2">
          <span className="text-[10px] font-bold text-slate-400 w-8 text-right">{fmt(progresso)}</span>
          <div className="flex-1 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full transition-all duration-1000"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-[10px] font-bold text-slate-400 w-8">{musica.duracao_fmt}</span>
        </div>
      </div>
      
      {/* Background blur da capa */}
      {musica.capa_url && (
        <div 
          className="absolute inset-0 opacity-10 dark:opacity-20 z-0 bg-cover bg-center blur-xl scale-110"
          style={{ backgroundImage: `url(${musica.capa_url})` }}
        />
      )}
    </div>
  );
};

// ─── Componente Principal ────────────────────────────────────────────────────
export const RadioManager: React.FC = () => {
  const { addToast } = useToast();
  const [anuncios, setAnuncios] = useState<Anuncio[]>([]);
  const [radioStatus, setRadioStatus] = useState<RadioStatus | null>(null);
  const [radioOnline, setRadioOnline] = useState(false);
  const [loading, setLoading] = useState(true);
  const [enviando, setEnviando] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editando, setEditando] = useState<Anuncio | null>(null);
  const [testando, setTestando] = useState(false);
  const [progresso, setProgresso] = useState(0);
  const progressoRef = useRef(0);

  const [gerandoIA, setGerandoIA] = useState(false);
  const [ideiaIA, setIdeiaIA] = useState('');
  
  const [novaPlaylist, setNovaPlaylist] = useState('');
  const [trocandoPlaylist, setTrocandoPlaylist] = useState(false);
  
  const [form, setForm] = useState({
    titulo: '',
    mensagem: '',
    voz: 'feminina' as 'feminina' | 'masculina',
    ativo: true,
    validade_ate: '',
  });

  const carregarAnuncios = useCallback(async () => {
    try {
      const res = await fetch('/api/radio/anuncios');
      const data = await res.json();
      setAnuncios(data);
    } catch {
      console.error('Erro ao carregar anúncios');
    } finally {
      setLoading(false);
    }
  }, []);

  const verificarStatus = useCallback(async () => {
    try {
      // Usa o proxy do Node para contornar qualquer bloqueio do navegador (CORS/Mixed Content)
      const res = await fetch(`${API_PREFIX}/status-proxy`, { signal: AbortSignal.timeout(3000) });
      if (!res.ok) throw new Error('Offline');
      const data: RadioStatus = await res.json();
      setRadioStatus(data);
      setRadioOnline(true);
      // Sincroniza o progresso com o servidor
      if (data.musica_atual) {
        progressoRef.current = data.musica_atual.progresso_s;
        setProgresso(data.musica_atual.progresso_s);
      }
    } catch {
      setRadioOnline(false);
      setRadioStatus(null);
    }
  }, []);

  // Ticker local: incrementa progresso a cada segundo sem precisar chamar API
  useEffect(() => {
    const ticker = setInterval(() => {
      if (radioStatus?.musica_atual?.tocando) {
        progressoRef.current = Math.min(progressoRef.current + 1, radioStatus.musica_atual.duracao_s);
        setProgresso(progressoRef.current);
      }
    }, 1000);
    return () => clearInterval(ticker);
  }, [radioStatus?.musica_atual?.tocando, radioStatus?.musica_atual?.duracao_s]);

  useEffect(() => {
    carregarAnuncios();
    verificarStatus();
    const interval = setInterval(verificarStatus, 15000); // Atualiza a cada 15s
    return () => clearInterval(interval);
  }, [carregarAnuncios, verificarStatus]);

  const salvarAnuncio = async () => {
    if (!form.titulo.trim() || !form.mensagem.trim()) return;
    try {
      const url = editando ? `/api/radio/anuncios/${editando.id}` : '/api/radio/anuncios';
      const method = editando ? 'PUT' : 'POST';
      const payload = {
        ...form,
        validade_ate: form.validade_ate || null
      };
      
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ erro: 'Erro desconhecido' }));
        throw new Error(errorData.erro || 'Erro ao salvar anúncio');
      }

      addToast(editando ? 'Anúncio atualizado com sucesso!' : 'Anúncio criado com sucesso!', 'success');
      setShowForm(false);
      setEditando(null);
      setForm({ titulo: '', mensagem: '', voz: 'feminina', ativo: true, validade_ate: '' });
      setIdeiaIA('');
      carregarAnuncios();
    } catch (e: any) {
      console.error('Erro ao salvar anúncio:', e);
      addToast(`Erro: ${e.message}`, 'error');
    }
  };

  const deletarAnuncio = async (id: number) => {
    if (!confirm('Tem certeza que deseja excluir este anúncio?')) return;
    try {
      const res = await fetch(`/api/radio/anuncios/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Erro ao excluir');
      addToast('Anúncio excluído!', 'success');
      carregarAnuncios();
    } catch (e: any) {
      addToast(e.message, 'error');
    }
  };

  const dispararAnuncio = async (anuncio: Anuncio) => {
    if (!radioOnline) return;
    setEnviando(anuncio.id);
    try {
      const voz = anuncio.voz === 'feminina' ? 'pt-BR-FranciscaNeural' : 'pt-BR-AntonioNeural';
      await fetch(`${API_PREFIX}/anunciar-proxy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mensagem: anuncio.mensagem, voz }),
      });
    } catch {
      console.error('Erro ao disparar anúncio');
    } finally {
      setTimeout(() => setEnviando(null), 2000);
    }
  };

  const dispararTeste = async () => {
    if (!radioOnline) return;
    setTestando(true);
    try {
      await fetch(`${API_PREFIX}/anunciar-proxy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mensagem: 'Teste de anúncio da Rádio Bela Farma. Sistema funcionando corretamente!',
          voz: 'pt-BR-FranciscaNeural'
        }),
      });
    } catch { } finally {
      setTimeout(() => setTestando(false), 3000);
    }
  };

  const abrirEdicao = (anuncio: Anuncio) => {
    setEditando(anuncio);
    setForm({ 
      titulo: anuncio.titulo, 
      mensagem: anuncio.mensagem, 
      voz: anuncio.voz, 
      ativo: anuncio.ativo,
      validade_ate: anuncio.validade_ate || ''
    });
    setIdeiaIA('');
    setShowForm(true);
  };

  const cancelarForm = () => {
    setShowForm(false);
    setEditando(null);
    setForm({ titulo: '', mensagem: '', voz: 'feminina', ativo: true, validade_ate: '' });
    setIdeiaIA('');
  };

  const gerarAnuncioIA = async () => {
    if (!ideiaIA.trim()) return;
    setGerandoIA(true);
    try {
      const res = await fetch(`${API_PREFIX}/gerar-anuncio`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ideia: ideiaIA })
      });
      const data = await res.json();
      if (data.texto) {
        setForm(prev => ({ ...prev, mensagem: data.texto, titulo: prev.titulo || 'Anúncio Gerado' }));
      }
    } catch (e) {
      console.error('Erro na IA');
    } finally {
      setGerandoIA(false);
    }
  };

  const mudarPlaylist = async () => {
    if (!novaPlaylist.trim()) return;
    setTrocandoPlaylist(true);
    try {
      const res = await fetch(`${API_PREFIX}/playlist-proxy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uri: novaPlaylist })
      });
      if (res.ok) {
        setNovaPlaylist('');
        addToast('Playlist enviada para a rádio!', 'success');
        setTimeout(verificarStatus, 1500); // Atualiza para pegar a capa da nova música
      } else {
        const errorData = await res.json().catch(() => ({ erro: 'Rádio offline ou ocupada' }));
        addToast(`Erro: ${errorData.erro}`, 'error');
      }
    } catch (e) {
      addToast("Falha de conexão com a rádio.", "error");
    } finally {
      setTrocandoPlaylist(false);
    }
  };

  const controlarPlayer = async (acao: string) => {
    try {
      // Otimisticamente atualiza o UI
      if (radioStatus && radioStatus.musica_atual) {
        if (acao === 'play') radioStatus.musica_atual.tocando = true;
        if (acao === 'pause') radioStatus.musica_atual.tocando = false;
        setRadioStatus({...radioStatus});
      }
      
      await fetch(`${API_PREFIX}/player-proxy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao })
      });
      setTimeout(verificarStatus, 1000); // Força atualização do estado
    } catch (e) {
      console.error('Erro ao controlar player', e);
    }
  };

  const musica = radioStatus?.musica_atual;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-purple-600 rounded-2xl shadow-lg">
            <Radio className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900 dark:text-slate-100">Rádio Bela Farma</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">Gerenciamento de anúncios e transmissão</p>
          </div>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold text-sm transition-all shadow-md"
        >
          <Plus className="w-4 h-4" />
          Novo Anúncio
        </button>
      </div>

      {/* Status + Player lado a lado */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Status da Rádio */}
        <div className={`rounded-2xl border p-5 ${radioOnline
          ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800'
          : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'}`}>
          <div className="flex items-center gap-3 mb-4">
            {radioOnline
              ? <Wifi className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              : <WifiOff className="w-5 h-5 text-red-500" />}
            <div className="flex-1">
              <p className={`font-black text-sm ${radioOnline ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600'}`}>
                {radioOnline ? '🟢 Rádio Online' : '🔴 Rádio Offline'}
              </p>
              {radioStatus && (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {radioStatus.saudacao} · {radioStatus.hora} · {radioStatus.fila} na fila
                </p>
              )}
            </div>
            <button
              onClick={verificarStatus}
              className="p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-all"
            >
              <RefreshCw className="w-4 h-4 text-slate-500" />
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            {radioStatus && (
              <>
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300">
                  <Megaphone className="w-3.5 h-3.5 text-purple-500" />
                  Promos a cada {radioStatus.intervalo_promo_min} min
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300">
                  <Clock className="w-3.5 h-3.5 text-blue-500" />
                  Hora a cada {radioStatus.intervalo_hora_min} min
                </div>
              </>
            )}
            <button
              onClick={dispararTeste}
              disabled={!radioOnline || testando}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl font-bold text-xs transition-all"
            >
              <Volume2 className="w-3.5 h-3.5" />
              {testando ? 'Enviando...' : 'Testar Áudio'}
            </button>
          </div>
        </div>

        {/* Player da música atual */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-5 bg-white dark:bg-slate-900">
          <div className="flex items-center gap-2 mb-3">
            <Music className="w-4 h-4 text-purple-500" />
            <span className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Tocando Agora</span>
          </div>
          {musica ? (
            <PlayerMusica musica={musica} progresso={progresso} onAction={controlarPlayer} />
          ) : (
            <div className="flex items-center gap-3 p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl">
              <div className="w-16 h-16 rounded-xl bg-slate-200 dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
                <Music2 className="w-8 h-8 text-slate-400 dark:text-slate-500" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-500 dark:text-slate-400">
                  {radioOnline ? 'Nenhuma música tocando' : 'Rádio offline'}
                </p>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                  {radioOnline ? 'Inicie o Spotify no dispositivo Bela Farma Radio' : 'Verifique a conexão com o Pi'}
                </p>
              </div>
            </div>
          )}

          {/* Trocar Playlist */}
          <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
            <label className="block text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">
              Mudar Playlist (Cole o Link do Spotify)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Ex: https://open.spotify.com/playlist/..."
                value={novaPlaylist}
                onChange={(e) => setNovaPlaylist(e.target.value)}
                className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
              <button
                onClick={mudarPlaylist}
                disabled={!novaPlaylist.trim() || trocandoPlaylist || !radioOnline}
                className="px-4 py-2 bg-slate-800 dark:bg-slate-700 hover:bg-slate-900 dark:hover:bg-slate-600 disabled:opacity-50 text-white rounded-lg font-bold text-sm transition-all"
              >
                {trocandoPlaylist ? 'Trocando...' : 'Tocar'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Formulário de criação/edição */}
      {showForm && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-lg space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-black text-slate-900 dark:text-slate-100 text-lg">
              {editando ? 'Editar Anúncio' : 'Novo Anúncio'}
            </h2>
            <button onClick={cancelarForm} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1.5">Título do Anúncio</label>
              <input
                value={form.titulo}
                onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))}
                placeholder="Ex: Promoção de Vitaminas"
                className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>

            <div className="md:col-span-2 space-y-4">
              {/* IA Generator */}
              <div className="p-4 bg-purple-50 dark:bg-purple-900/10 rounded-xl border border-purple-100 dark:border-purple-900/30">
                <label className="block text-sm font-bold text-purple-800 dark:text-purple-300 mb-2 flex items-center gap-2">
                  <Zap className="w-4 h-4" />
                  Criar com Inteligência Artificial
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Ex: Fraldas Pampers em promoção até sexta"
                    value={ideiaIA}
                    onChange={(e) => setIdeiaIA(e.target.value)}
                    className="flex-1 bg-white dark:bg-slate-900 border border-purple-200 dark:border-purple-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                  <button
                    type="button"
                    onClick={gerarAnuncioIA}
                    disabled={gerandoIA || !ideiaIA.trim()}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-lg font-bold text-sm transition-all flex items-center gap-2"
                  >
                    {gerandoIA ? 'Gerando...' : 'Criar Mágica'}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Mensagem do Anúncio</label>
                <textarea
                  required
                  value={form.mensagem}
                  onChange={(e) => setForm({ ...form, mensagem: e.target.value })}
                  className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none h-32"
                  placeholder="Ex: Você está ouvindo Rádio Bela Farma..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Voz do Locutor</label>
                  <select
                    value={form.voz}
                    onChange={(e) => setForm({ ...form, voz: e.target.value as 'feminina' | 'masculina' })}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="feminina">🎙️ Francisca (Feminina)</option>
                    <option value="masculina">🎙️ Antônio (Masculino)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Válido até (Opcional)</label>
                  <input
                    type="date"
                    value={form.validade_ate}
                    onChange={(e) => setForm({ ...form, validade_ate: e.target.value })}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">Após esta data, o anúncio não toca mais.</p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-5">
              <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Anúncio ativo</label>
              <button
                onClick={() => setForm(f => ({ ...f, ativo: !f.ativo }))}
                className={`w-12 h-6 rounded-full transition-colors ${form.ativo ? 'bg-purple-600' : 'bg-slate-300 dark:bg-slate-600'}`}
              >
                <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform mx-0.5 ${form.ativo ? 'translate-x-6' : 'translate-x-0'}`} />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={salvarAnuncio}
              disabled={!form.titulo.trim() || !form.mensagem.trim()}
              className="flex items-center gap-2 px-5 py-2.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-xl font-black text-sm transition-all"
            >
              <Save className="w-4 h-4" />
              {editando ? 'Salvar Alterações' : 'Criar Anúncio'}
            </button>
            <button onClick={cancelarForm} className="px-5 py-2.5 text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 rounded-xl font-bold text-sm transition-all">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Lista de Anúncios */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h2 className="font-black text-slate-900 dark:text-slate-100">Anúncios Cadastrados</h2>
          <span className="text-xs font-bold text-slate-400 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-full">
            {anuncios.length} anúncios
          </span>
        </div>

        {loading ? (
          <div className="p-12 text-center text-slate-400">Carregando...</div>
        ) : anuncios.length === 0 ? (
          <div className="p-12 text-center">
            <Music2 className="w-12 h-12 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
            <p className="text-slate-500 dark:text-slate-400 font-medium">Nenhum anúncio cadastrado</p>
            <p className="text-slate-400 dark:text-slate-500 text-sm mt-1">Clique em "Novo Anúncio" para começar</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {anuncios.map((anuncio) => (
              <div key={anuncio.id} className={`p-5 flex items-start gap-4 transition-all hover:bg-slate-50 dark:hover:bg-slate-800/50 ${!anuncio.ativo ? 'opacity-50' : ''}`}>
                <div className={`mt-1 p-2 rounded-xl flex-shrink-0 ${anuncio.voz === 'feminina' ? 'bg-pink-100 dark:bg-pink-900/30' : 'bg-blue-100 dark:bg-blue-900/30'}`}>
                  <Volume2 className={`w-4 h-4 ${anuncio.voz === 'feminina' ? 'text-pink-600 dark:text-pink-400' : 'text-blue-600 dark:text-blue-400'}`} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-black text-sm text-slate-900 dark:text-slate-100">{anuncio.titulo}</span>
                    {!anuncio.ativo && (
                      <span className="text-[10px] font-black bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 px-2 py-0.5 rounded-full uppercase tracking-wider">Inativo</span>
                    )}
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider ${anuncio.voz === 'feminina' ? 'bg-pink-100 dark:bg-pink-900/30 text-pink-600 dark:text-pink-400' : 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'}`}>
                      {anuncio.voz}
                    </span>
                  </div>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">{anuncio.mensagem}</p>
                  {anuncio.validade_ate && (
                    <p className="text-[10px] font-bold text-orange-500 mt-1 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Válido até: {new Date(anuncio.validade_ate + 'T00:00:00').toLocaleDateString('pt-BR')}
                    </p>
                  )}
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                    {new Date(anuncio.criado_em).toLocaleDateString('pt-BR')}
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => dispararAnuncio(anuncio)}
                    disabled={!radioOnline || enviando === anuncio.id}
                    title={radioOnline ? 'Tocar agora na rádio' : 'Rádio offline'}
                    className="p-2 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-200 dark:hover:bg-emerald-900/50 disabled:opacity-40 rounded-xl transition-all"
                  >
                    {enviando === anuncio.id
                      ? <RefreshCw className="w-4 h-4 animate-spin" />
                      : <Zap className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => abrirEdicao(anuncio)}
                    className="p-2 bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 rounded-xl transition-all"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => deletarAnuncio(anuncio.id)}
                    className="p-2 bg-red-50 dark:bg-red-900/20 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/40 rounded-xl transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
