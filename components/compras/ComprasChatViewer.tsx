import React, { useState, useEffect, useRef } from 'react';
import { 
  ArrowLeft, 
  Send, 
  ExternalLink, 
  ShoppingBag, 
  TrendingDown, 
  CheckCheck, 
  Sparkles, 
  Calendar, 
  Building2, 
  Phone,
  RefreshCw,
  Search,
  MessageSquare
} from 'lucide-react';
import { OportunidadeMinerada, User } from '../../types';

interface ComprasChatViewerProps {
  oportunidade: OportunidadeMinerada;
  theme: 'light' | 'dark';
  onVoltar: () => void;
  onCriarCotacao?: (op: OportunidadeMinerada) => void;
}

interface MensagemChat {
  id: string;
  message_id?: string;
  remote_jid?: string;
  telefone?: string;
  nome_contato?: string;
  from_me: number;
  timestamp: number;
  data_hora?: string;
  tipo_mensagem?: string;
  texto_mensagem?: string;
}

export const ComprasChatViewer: React.FC<ComprasChatViewerProps> = ({
  oportunidade,
  theme,
  onVoltar,
  onCriarCotacao
}) => {
  const [mensagens, setMensagens] = useState<MensagemChat[]>([]);
  const [loading, setLoading] = useState(true);
  const [contato, setContato] = useState<{ nome: string; distribuidora: string; telefone: string; representante?: string } | null>(null);
  const [mensagemAlvoId, setMensagemAlvoId] = useState<string | null>(null);
  const targetMessageRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const carregarContexto = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (oportunidade.mensagemId) params.append('mensagemId', oportunidade.mensagemId);
        else if (oportunidade.id) params.append('mensagemId', oportunidade.id);
        if (oportunidade.telefone) params.append('telefone', oportunidade.telefone);
        const prod = oportunidade.produtoNome || (oportunidade as any).produto_nome;
        if (prod) params.append('produtoNome', prod);

        const res = await fetch(`/api/central-compras/mineracao/contexto-mensagem?${params.toString()}`);
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.data) {
            setMensagens(data.data.mensagens || []);
            setContato(data.data.contato || null);
            setMensagemAlvoId(data.data.mensagemAlvoId || null);
          }
        }
      } catch (err) {
        console.warn('Erro ao carregar contexto de conversa:', err);
      } finally {
        setLoading(false);
      }
    };

    carregarContexto();
  }, [oportunidade]);

  // Scroll suave até a mensagem que cita o produto
  useEffect(() => {
    if (!loading && targetMessageRef.current) {
      setTimeout(() => {
        targetMessageRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 300);
    }
  }, [loading, mensagens]);

  // Formata o telefone para exibição
  const telefoneLimpo = (contato?.telefone || oportunidade.telefone || '').replace(/\D/g, '');
  const telefoneFormatado = telefoneLimpo.length >= 10
    ? `+55 (${telefoneLimpo.slice(0, 2)}) ${telefoneLimpo.slice(2, 7)}-${telefoneLimpo.slice(7)}`
    : telefoneLimpo;

  const produtoNome = (oportunidade.produtoNome || (oportunidade as any).produto_nome || '').trim();
  const precoOfertadoNum = Number(oportunidade.precoOfertado || (oportunidade as any).preco_ofertado || 0);
  const precoUltCompraNum = oportunidade.precoUltCompra 
    ? Number(oportunidade.precoUltCompra) 
    : (oportunidade as any).preco_ult_compra_digifarma 
      ? Number((oportunidade as any).preco_ult_compra_digifarma) 
      : null;

  const linkWhatsAppWeb = telefoneLimpo
    ? `https://wa.me/${telefoneLimpo.startsWith('55') ? telefoneLimpo : '55' + telefoneLimpo}?text=${encodeURIComponent(`Olá! Gostaria de confirmar a oferta do item: *${produtoNome}* por R$ ${precoOfertadoNum.toFixed(2)}.`)}`
    : null;

  // Função para destacar o trecho do produto dentro do texto da mensagem
  const renderizarTextoComDestaque = (texto: string) => {
    if (!texto) return null;
    
    // Divide o texto por linhas
    const linhas = texto.split('\n');
    return linhas.map((linha, idx) => {
      // Verifica se a linha contém o nome do produto ou palavras-chave
      const termos = produtoNome.toLowerCase().split(/\s+/).filter(t => t.length > 3);
      const linhaLower = linha.toLowerCase();
      const contemProduto = termos.some(termo => linhaLower.includes(termo));

      if (contemProduto) {
        return (
          <div 
            key={idx} 
            className="my-1.5 p-2 rounded-xl bg-amber-200/90 dark:bg-amber-950/80 border-l-4 border-amber-500 text-slate-900 dark:text-amber-100 font-bold shadow-sm transition-all"
          >
            <div className="flex items-center gap-1 text-[10px] text-amber-700 dark:text-amber-400 uppercase tracking-widest font-black mb-0.5">
              <Sparkles className="w-3 h-3" />
              <span>Oferta Mapeada</span>
            </div>
            <span>{linha}</span>
          </div>
        );
      }

      return (
        <span key={idx} className="block leading-relaxed">
          {linha}
        </span>
      );
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center p-2 sm:p-4 md:p-6 bg-slate-900/70 backdrop-blur-md animate-in fade-in duration-200">
      <div className="flex flex-col w-full max-w-6xl h-full max-h-[92vh] rounded-3xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
        {/* Topo / Header Estilo WhatsApp */}
        <header className="px-5 py-3.5 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shadow-sm z-10">
        <div className="flex items-center gap-3.5">
          <button
            onClick={onVoltar}
            className="p-2 -ml-1 rounded-xl text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer flex items-center gap-1 text-xs font-black uppercase"
            title="Voltar ao Radar de Ofertas"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Radar</span>
          </button>

          {/* Avatar e Dados do Contato */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white font-black flex items-center justify-center text-sm shadow-md">
              {(contato?.nome || oportunidade.representante || oportunidade.distribuidora || 'R').charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-black text-slate-900 dark:text-slate-100">
                  {contato?.nome || oportunidade.representante || 'Representante Comercial'}
                </h2>
                <span className="px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 text-[10px] font-black uppercase tracking-wider">
                  WhatsApp
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  🏢 {contato?.distribuidora || oportunidade.distribuidora}
                </span>
                {telefoneFormatado && (
                  <>
                    <span>•</span>
                    <span>📞 {telefoneFormatado}</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Ações Rápidas no Cabeçalho */}
        <div className="flex items-center gap-2">
          {linkWhatsAppWeb && (
            <a
              href={linkWhatsAppWeb}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black uppercase tracking-wider shadow-sm transition-all cursor-pointer active:scale-95"
            >
              <MessageSquare className="w-4 h-4" />
              <span className="hidden md:inline">Conversar no WhatsApp</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      </header>

      {/* Card Fixo de Destaque da Oferta Minerada */}
      <div className="px-5 py-3 bg-slate-50 dark:bg-slate-900/90 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 z-10">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Item Selecionado</span>
              {oportunidade.categoria && (
                <span className="text-[10px] font-bold text-slate-500 px-2 py-0.5 rounded bg-slate-200/60 dark:bg-slate-800">
                  {oportunidade.categoria}
                </span>
              )}
            </div>
            <h3 className="text-sm font-black text-slate-900 dark:text-slate-100">
              {produtoNome}
            </h3>
          </div>
        </div>

        {/* Preços e Ação de Cotar */}
        <div className="flex items-center gap-4">
          <div className="text-right">
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Preço Ofertado</span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-base font-black text-emerald-600 dark:text-emerald-400">
                R$ {precoOfertadoNum.toFixed(2)}
              </span>
              {precoUltCompraNum && (
                <span className="text-xs text-slate-400 line-through">
                  R$ {precoUltCompraNum.toFixed(2)}
                </span>
              )}
            </div>
          </div>

          {(oportunidade.economiaPercentual || 0) > 0 && (
            <div className="px-2.5 py-1 rounded-xl bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 text-xs font-black border border-emerald-300 dark:border-emerald-800">
              -{oportunidade.economiaPercentual?.toFixed(1)}%
            </div>
          )}

          {onCriarCotacao && (
            <button
              onClick={() => onCriarCotacao(oportunidade)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 text-xs font-black uppercase tracking-wider shadow-sm transition-all cursor-pointer active:scale-95"
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              <span>Adicionar à Cotação</span>
            </button>
          )}
        </div>
      </div>

      {/* Área de Mensagens (Estilo WhatsApp) */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3 bg-[#efeae2] dark:bg-[#0b141a] transition-colors">
        {loading ? (
          <div className="py-24 text-center text-xs text-slate-400 flex flex-col items-center gap-2">
            <RefreshCw className="w-6 h-6 animate-spin text-emerald-600" />
            <span className="font-bold">Carregando conversa com o representante...</span>
          </div>
        ) : mensagens.length === 0 ? (
          <div className="py-20 text-center text-slate-400 space-y-2">
            <MessageSquare className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-700" />
            <p className="text-xs font-bold">Nenhum histórico de mensagens arquivado para este número.</p>
          </div>
        ) : (
          <>
            {/* Divisor de Data */}
            <div className="flex justify-center my-3">
              <span className="px-3 py-1 rounded-lg bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm text-[11px] font-bold text-slate-600 dark:text-slate-300 shadow-sm border border-slate-200/50 dark:border-slate-700/50">
                {oportunidade.dataOferta ? new Date(oportunidade.dataOferta).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }) : 'Conversa Recente'}
              </span>
            </div>

            {/* Balões de Mensagem */}
            {mensagens.map((msg) => {
              const isMe = msg.from_me === 1;
              const isTarget = msg.message_id === mensagemAlvoId || msg.id === mensagemAlvoId || (mensagens.length === 1);
              const dataHoraTexto = msg.data_hora
                ? new Date(msg.data_hora).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                : '';

              return (
                <div
                  key={msg.id || msg.message_id}
                  ref={isTarget ? targetMessageRef : null}
                  className={`flex ${isMe ? 'justify-end' : 'justify-start'} transition-all`}
                >
                  <div
                    className={`max-w-[85%] sm:max-w-xl rounded-2xl p-3.5 shadow-sm text-sm relative transition-all ${
                      isMe
                        ? 'bg-[#d9fdd3] dark:bg-[#005c4b] text-slate-900 dark:text-slate-100 rounded-tr-none'
                        : 'bg-white dark:bg-[#202c33] text-slate-900 dark:text-slate-100 rounded-tl-none'
                    } ${isTarget ? 'ring-2 ring-amber-400 dark:ring-amber-500 shadow-md scale-[1.01]' : ''}`}
                  >
                    {/* Nome do remetente se for recebida */}
                    {!isMe && (
                      <span className="text-[11px] font-black text-emerald-700 dark:text-emerald-400 block mb-1">
                        {msg.nome_contato || contato?.nome || 'Representante'}
                      </span>
                    )}

                    {/* Texto com Destaque do Produto */}
                    <div className="text-xs sm:text-sm whitespace-pre-wrap break-words">
                      {renderizarTextoComDestaque(msg.texto_mensagem || '')}
                    </div>

                    {/* Rodapé com Hora e Status */}
                    <div className="flex items-center justify-end gap-1 mt-1 text-[10px] text-slate-400 dark:text-slate-500 select-none">
                      <span>{dataHoraTexto}</span>
                      {isMe && <CheckCheck className="w-3.5 h-3.5 text-blue-500 inline" />}
                    </div>
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  </div>
  );
};
