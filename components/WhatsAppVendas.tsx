import React, { useState, useEffect, useRef } from 'react';
import {
  MessageSquare, Search, RefreshCw, Send, Package,
  AlertTriangle, CheckCircle, Clock, X, Phone,
  ShoppingBag, Pill, Image as ImageIcon, Loader2, Sparkles,
  LogOut, ArrowLeft, User, MapPin, Mail, FileText
} from 'lucide-react';
import { useToast } from './ToastContext';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Chat {
  id: string; // JID do WhatsApp
  phone: string;
  name: string;
  unreadCount: number;
  lastMessage: string;
  timestamp: number;
}

interface Message {
  id: string;
  fromMe: boolean;
  text: string;
  isImage?: boolean;
  imageUrl?: string | null;
  timestamp: number;
}

interface Product {
  id: number;
  name: string;
  barcode: string;
  price: number;
  stock: number;
  imageUrl: string | null;
  category: string | null;
  brand: string | null;
}

async function imageUrlToBase64(url: string): Promise<string> {
  const response = await fetch(url);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export function WhatsAppVendas({ onClose, isWidget = false }: { onClose?: () => void; isWidget?: boolean }) {
  const { addToast } = useToast();

  const postMessageToWhatsApp = (payload: any) => {
    if (isWidget) {
      window.parent.postMessage(payload, '*');
    } else {
      const iframe = document.getElementById('wa-iframe') as HTMLIFrameElement;
      if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage(payload, '*');
      }
    }
  };

  // Estados dos Chats e Mensagens
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChat, setActiveChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  
  // Estados de Busca de Produtos
  const [productQuery, setProductQuery] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [crmStatus, setCrmStatus] = useState<'pesquisado' | 'comprado'>('pesquisado');

  // Estados de Loading
  const [loadingChats, setLoadingChats] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [searchingProducts, setSearchingProducts] = useState(false);
  const [sendingMsg, setSendingMsg] = useState(false);
  const [sendingProduct, setSendingProduct] = useState<number | null>(null);
  
  // Estado de Busca de Chats
  const [chatSearchQuery, setChatSearchQuery] = useState('');

  // Ref de scroll para o final das mensagens
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Múltipla Seleção (Carrinho com status do CRM)
  interface CartItem {
    product: Product;
    status: 'comprado' | 'pesquisado';
  }
  const [selectedProducts, setSelectedProducts] = useState<CartItem[]>([]);

  // Abas da Coluna 3
  const [activeTab, setActiveTab] = useState<'estoque' | 'cliente'>('estoque');

  // Ficha do Cliente
  const [clientInfo, setClientInfo] = useState<{
    id?: string;
    name: string;
    nickname: string;
    cpf: string;
    phone: string;
    email: string;
    address: string;
    notes: string;
  } | null>(null);

  const [clientHistory, setClientHistory] = useState<Array<{
    productName: string;
    status: string;
    date: string;
  }>>([]);

  const [loadingClient, setLoadingClient] = useState(false);
  const [savingClient, setSavingClient] = useState(false);

  // Estados de busca no CRM
  const [crmSearchQuery, setCrmSearchQuery] = useState('');
  const [crmSearchResults, setCrmSearchResults] = useState<any[]>([]);
  const [isSearchingCrm, setIsSearchingCrm] = useState(false);
  const [showCrmSearch, setShowCrmSearch] = useState(false);

  // Categorias de Produtos
  const [selectedCategory, setSelectedCategory] = useState('Todos');

  // Helper para classificar categoria de produto de forma dinâmica
  const getProductCategory = (prod: Product): string => {
    if (prod.category) {
      const catLower = prod.category.toLowerCase();
      if (catLower.includes('desodorante') || catLower.includes('antiperspirante')) return 'Desodorantes';
      if (catLower.includes('hidratante') || catLower.includes('creme') || catLower.includes('loção')) return 'Hidratantes';
      if (catLower.includes('pastilha') || catLower.includes('garganta')) return 'Pastilhas';
      if (catLower.includes('medicamento') || catLower.includes('comprimido') || catLower.includes('droga')) return 'Medicamentos';
      return prod.category;
    }
    
    const nameLower = prod.name.toLowerCase();
    if (nameLower.includes('desodorante') || nameLower.includes('spray corporal') || nameLower.includes('rexona') || nameLower.includes('dove') || nameLower.includes('roll-on')) return 'Desodorantes';
    if (nameLower.includes('hidratante') || nameLower.includes('creme corporal') || nameLower.includes('loção') || nameLower.includes('cerave') || nameLower.includes('nivea')) return 'Hidratantes';
    if (nameLower.includes('pastilha') || nameLower.includes('strepsils') || nameLower.includes('valda') || nameLower.includes('garganta') || nameLower.includes('past.garg')) return 'Pastilhas';
    if (nameLower.includes('shampoo') || nameLower.includes('condicionador') || nameLower.includes('cabelo')) return 'Cabelos';
    if (nameLower.includes('neopiridin') || nameLower.includes('furosemida') || nameLower.includes('dorflex') || nameLower.includes('paracetamol')) return 'Medicamentos';
    
    return 'Outros';
  };

  // Extrai categorias exclusivas dos produtos da busca atual
  const categoriesList = React.useMemo(() => {
    const list = new Set<string>();
    products.forEach(p => {
      list.add(getProductCategory(p));
    });
    return ['Todos', ...Array.from(list)];
  }, [products]);

  // Filtra produtos conforme a categoria ativa
  const filteredProducts = React.useMemo(() => {
    if (selectedCategory === 'Todos') return products;
    return products.filter(p => getProductCategory(p) === selectedCategory);
  }, [products, selectedCategory]);

  // Resetar categoria se ela não existir mais na nova busca
  useEffect(() => {
    if (!categoriesList.includes(selectedCategory)) {
      setSelectedCategory('Todos');
    }
  }, [categoriesList]);

  // Som de Notificação
  const prevMaxTimestampRef = useRef<number>(0);

  const tocarSino = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(880, audioCtx.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(440, audioCtx.currentTime + 0.5);

      gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.3, audioCtx.currentTime + 0.05);
      gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 1.5);

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      oscillator.start(audioCtx.currentTime);
      oscillator.stop(audioCtx.currentTime + 1.5);
    } catch (e) {
      console.log('Navegador bloqueou áudio ou erro interno:', e);
    }
  };

  const toggleProductSelection = (product: Product) => {
    setSelectedProducts(prev => {
      const exists = prev.some(item => item.product.id === product.id);
      if (exists) {
        return prev.filter(item => item.product.id !== product.id);
      } else {
        return [...prev, { product, status: crmStatus as 'comprado' | 'pesquisado' }];
      }
    });
  };

  const isProductSelected = (productId: number) => {
    return selectedProducts.some(item => item.product.id === productId);
  };

  const toggleCartItemStatus = (productId: number) => {
    setSelectedProducts(prev => prev.map(item => {
      if (item.product.id === productId) {
        return { 
          ...item, 
          status: item.status === 'comprado' ? 'pesquisado' : 'comprado' 
        };
      }
      return item;
    }));
  };

  // Helper: Detectar se um telefone é um LID temporário (números BR reais têm no máximo 13 dígitos)
  const isLidNumber = (phone: string): boolean => {
    if (!phone) return false;
    if (phone.includes(':')) return true;
    const digits = phone.replace(/\D/g, '');
    return digits.length > 13;
  };

  // Helper: Obter o telefone efetivo para envio (usa clientInfo.phone se o chat ativo for um LID)
  const getEffectivePhone = (): string | null => {
    if (!activeChat) return null;
    const chatPhone = activeChat.phone;
    
    // Se o telefone do chat NÃO é um LID, usa ele normalmente
    if (!isLidNumber(chatPhone)) return chatPhone;
    
    // Se É um LID, tenta usar o telefone cadastrado do cliente
    if (clientInfo?.phone) {
      const clientClean = clientInfo.phone.replace(/\D/g, '');
      if (clientClean.length >= 10 && clientClean.length <= 13 && clientClean !== chatPhone.replace(/\D/g, '')) {
        return clientClean;
      }
    }
    
    // Não tem alternativa válida
    return null;
  };

  // Verifica se a última mensagem do cliente foi nas últimas 24 horas
  const canSend = React.useMemo(() => {
    if (!activeChat) return false;
    
    // Se estiver carregando mensagens e a lista local for vazia, permitimos o envio temporariamente
    // para que não mostre bloqueio falso no primeiro segundo de transição
    if (messages.length === 0 && loadingMessages) return true;
    
    const incoming = messages.filter(m => !m.fromMe);
    if (incoming.length === 0) return false;
    
    const lastIncoming = incoming[incoming.length - 1];
    const diffMs = Date.now() - lastIncoming.timestamp;
    const twentyFourHours = 24 * 60 * 60 * 1000;
    
    return diffMs < twentyFourHours;
  }, [activeChat, messages, loadingMessages]);

  const handleSendSelectedList = async () => {
    if (!activeChat || selectedProducts.length === 0 || sendingMsg || !canSend) return;

    setSendingMsg(true);

    let textMsg = `*Orçamento - BelaFarma*\n\n`;
    selectedProducts.forEach((item) => {
      const priceFormatted = parseFloat(item.product.price as any).toFixed(2).replace('.', ',');
      textMsg += `• *${item.product.name}*\n💵 Preço: *R$ ${priceFormatted}*\n\n`;
    });
    
    const total = selectedProducts.reduce((sum, item) => sum + item.product.price, 0);
    const totalFormatted = total.toFixed(2).replace('.', ',');
    textMsg += `-------------------------\n💰 *Total: R$ ${totalFormatted}*`;

    // Resolver telefone efetivo (fallback para número real do cliente se for LID)
    const effectivePhone = getEffectivePhone();
    if (!effectivePhone) {
      addToast('⚠️ Este contato possui um identificador temporário (LID). Vá na aba "Ficha do Cliente", edite o WhatsApp para o número real e clique em "Usar Número Real".', 'error');
      setSendingMsg(false);
      return;
    }

    try {
      const res = await fetch('/api/whatsapp-vendas/send-cart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: effectivePhone,
          text: textMsg,
          items: selectedProducts.map(item => ({
            productName: item.product.name,
            price: item.product.price,
            status: item.status
          })),
          skipWhatsApp: true
        })
      });

      if (res.ok) {
        postMessageToWhatsApp({
          source: 'belafarma-crm',
          type: 'send-product-media',
          text: textMsg,
          imageUrl: null,
          imageBase64: null
        });

        addToast(`✅ Lista com ${selectedProducts.length} produtos enviada e salva no CRM!`, 'success');
        
        setMessages(prev => [...prev, {
          id: `local_${Date.now()}`,
          fromMe: true,
          text: textMsg,
          timestamp: Date.now()
        }]);
        
        setChats(prev => prev.map(c => 
          c.id === activeChat.id ? { ...c, lastMessage: `[Lista] ${selectedProducts.length} itens`, timestamp: Date.now() } : c
        ));

        setSelectedProducts([]);
        // Recarregar os dados de CRM do cliente se a ficha estiver ativa
        loadCustomerData(activeChat.phone);
      } else {
        const data = await res.json();
        addToast(data.error || 'Erro ao enviar lista.', 'error');
      }
    } catch (err) {
      addToast('Erro de conexão ao enviar lista.', 'error');
    } finally {
      setSendingMsg(false);
    }
  };

  // Carrega Ficha do Cliente do SQLite
  const loadCustomerData = async (phoneStr: string) => {
    setLoadingClient(true);
    try {
      const res = await fetch(`/api/whatsapp-vendas/customers/${encodeURIComponent(phoneStr)}`);
      const data = await res.json();
      if (data.success) {
        setClientInfo(data.customer);
        setClientHistory(data.history || []);
      } else {
        addToast('Erro ao carregar dados do cliente.', 'error');
      }
    } catch (err) {
      addToast('Erro de rede ao buscar dados do cliente.', 'error');
    } finally {
      setLoadingClient(false);
    }
  };

  // Função para buscar clientes no CRM
  const handleSearchCrm = async (query: string) => {
    setCrmSearchQuery(query);
    if (query.trim().length < 2) {
      setCrmSearchResults([]);
      return;
    }
    setIsSearchingCrm(true);
    try {
      const res = await fetch(`/api/whatsapp-vendas/search-customers?query=${encodeURIComponent(query)}`);
      const data = await res.json();
      if (data.success) {
        setCrmSearchResults(data.customers || []);
      }
    } catch (err) {
      console.error('Erro ao buscar clientes no CRM:', err);
    } finally {
      setIsSearchingCrm(false);
    }
  };

  // Função para selecionar um cliente do CRM e preencher a ficha
  const handleSelectCrmCustomer = (customer: any) => {
    setClientInfo({
      id: customer.id,
      name: customer.name || '',
      nickname: customer.nickname || '',
      cpf: customer.cpf || '',
      phone: customer.phone || '',
      email: customer.email || '',
      address: customer.address || '',
      notes: customer.notes || ''
    });
    
    // Buscar histórico do cliente selecionado
    if (customer.phone) {
      loadCustomerHistory(customer.phone);
    }
    
    setShowCrmSearch(false);
    setCrmSearchQuery('');
    setCrmSearchResults([]);
    addToast(`👤 Selecionado: ${customer.name}. Salve para vincular ao WhatsApp.`, 'info');
  };

  // Carrega histórico do cliente selecionado
  const loadCustomerHistory = async (phone: string) => {
    try {
      const res = await fetch(`/api/whatsapp-vendas/customers/${encodeURIComponent(phone)}`);
      const data = await res.json();
      if (data.success) {
        setClientHistory(data.history || []);
      }
    } catch (e) {
      console.warn('Erro ao carregar histórico:', e);
    }
  };

  // Salva Ficha do Cliente no SQLite
  const handleSaveCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientInfo || !activeChat || savingClient) return;

    setSavingClient(true);
    try {
      const res = await fetch(`/api/whatsapp-vendas/customers/${encodeURIComponent(activeChat.phone)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(clientInfo)
      });
      const data = await res.json();
      if (data.success) {
        addToast('✅ Cadastro do cliente salvo com sucesso!', 'success');
        // Atualiza visualmente o nome na lista de chats
        setChats(prev => prev.map(c => 
          c.id === activeChat.id ? { ...c, name: clientInfo.name } : c
        ));
        setActiveChat(prev => prev ? { ...prev, name: clientInfo.name } : null);
      } else {
        addToast(data.error || 'Erro ao salvar cadastro.', 'error');
      }
    } catch (err) {
      addToast('Erro de rede ao salvar dados do cliente.', 'error');
    } finally {
      setSavingClient(false);
    }
  };

  // Monitora mudança de chat ativo para carregar os dados cadastrais
  useEffect(() => {
    if (activeChat) {
      loadCustomerData(activeChat.phone);
    } else {
      setClientInfo(null);
      setClientHistory([]);
      setActiveTab('estoque');
    }
  }, [activeChat]);

  // Som de notificação em segundo plano
  useEffect(() => {
    if (chats.length > 0) {
      const currentMaxTimestamp = Math.max(...chats.map(c => c.timestamp || 0));
      if (prevMaxTimestampRef.current > 0 && currentMaxTimestamp > prevMaxTimestampRef.current) {
        if (document.hidden || !document.hasFocus()) {
          tocarSino();
        }
      }
      prevMaxTimestampRef.current = currentMaxTimestamp;
    }
  }, [chats]);

  // 1. Carrega a lista de chats do WhatsApp
  const loadChats = async (silent = false) => {
    if (!silent) setLoadingChats(true);
    try {
      const res = await fetch('/api/whatsapp-vendas/chats');
      const data = await res.json();
      if (data.success) {
        setChats(data.chats || []);
        if (data.offline) {
          addToast('⚠️ Evolution API Offline. Exibindo contatos locais do CRM.', 'warning');
        }
      } else {
        addToast('Erro ao obter conversas do WhatsApp.', 'error');
      }
    } catch (err) {
      addToast('Erro de conexão ao buscar conversas.', 'error');
    } finally {
      setLoadingChats(false);
    }
  };

  // 2. Carrega as mensagens de um chat selecionado
  const loadMessages = async (chatId: string, silent = false) => {
    if (!silent) setLoadingMessages(true);
    try {
      const res = await fetch(`/api/whatsapp-vendas/messages/${encodeURIComponent(chatId)}`);
      const data = await res.json();
      if (data.success) {
        // Evita condição de corrida: só atualiza as mensagens se o chat ainda for o ativo
        setActiveChat(currentActive => {
          if (currentActive && currentActive.id === chatId) {
            setMessages(data.messages || []);
          }
          return currentActive;
        });
      }
    } catch (err) {
      console.error('Erro ao buscar mensagens:', err);
    } finally {
      // Evita ocultar o loading de um novo chat se o antigo terminar depois
      setActiveChat(currentActive => {
        if (currentActive && currentActive.id === chatId) {
          setLoadingMessages(false);
        }
        return currentActive;
      });
    }
  };

  // 3. Pesquisa produtos no Digifarma
  const searchProducts = async (queryStr: string) => {
    if (queryStr.length < 2) {
      setProducts([]);
      return;
    }
    setSearchingProducts(true);
    try {
      const res = await fetch(`/api/whatsapp-vendas/search-products?q=${encodeURIComponent(queryStr)}`);
      const data = await res.json();
      if (data.success) {
        // Garantir que produtos com estoque/saldo apareçam primeiro
        const sortedProducts = (data.products || []).sort((a: Product, b: Product) => {
          const aStock = a.stock > 0 ? 1 : 0;
          const bStock = b.stock > 0 ? 1 : 0;
          return bStock - aStock; // coloca 1 antes de 0
        });
        setProducts(sortedProducts);
      }
    } catch (err) {
      addToast('Erro ao pesquisar produtos no estoque.', 'error');
    } finally {
      setSearchingProducts(false);
    }
  };

  // 4. Envia mensagem de texto comum no chat ativo
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!activeChat || !inputText.trim() || sendingMsg) return;

    // Resolver telefone efetivo (fallback para número real do cliente se for LID)
    const effectivePhone = getEffectivePhone();
    if (!effectivePhone) {
      addToast('⚠️ Este contato possui um identificador temporário (LID). Vá na aba "Ficha do Cliente", edite o WhatsApp para o número real e clique em "Usar Número Real".', 'error');
      return;
    }

    setSendingMsg(true);
    const textToSend = inputText;
    setInputText('');

    try {
      const res = await fetch('/api/whatsapp-vendas/send-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: effectivePhone,
          text: textToSend
        })
      });

      if (res.ok) {
        // Atualizar mensagens localmente para agilidade visual
        setMessages(prev => [...prev, {
          id: `local_${Date.now()}`,
          fromMe: true,
          text: textToSend,
          timestamp: Date.now()
        }]);
        
        // Atualiza a última mensagem na lista de chats
        setChats(prev => prev.map(c => 
          c.id === activeChat.id ? { ...c, lastMessage: textToSend, timestamp: Date.now() } : c
        ));
      } else {
        const data = await res.json();
        console.error('[WhatsAppVendas] Erro ao enviar:', data, 'phone usado:', effectivePhone);
        addToast(data.error || 'Erro ao enviar mensagem.', 'error');
      }
    } catch (err) {
      addToast('Erro de conexão ao enviar mensagem.', 'error');
    } finally {
      setSendingMsg(false);
    }
  };

  // 5. Envia as fotos/infos de um produto para o chat ativo (sendImage decide se manda foto ou apenas texto)
  const handleSendProduct = async (product: Product, sendImage = true) => {
    if (!activeChat) {
      addToast('Selecione uma conversa ativa antes de enviar o produto!', 'warning');
      return;
    }
    if (!canSend) {
      addToast('Envio bloqueado: a janela de 24 horas expirou.', 'error');
      return;
    }

    // Resolver telefone efetivo (fallback para número real do cliente se for LID)
    const effectivePhone = getEffectivePhone();
    if (!effectivePhone) {
      addToast('⚠️ Este contato possui um identificador temporário (LID). Vá na aba "Ficha do Cliente", edite o WhatsApp para o número real e clique em "Usar Número Real".', 'error');
      return;
    }

    setSendingProduct(product.id);
    try {
      const priceFormatted = parseFloat(product.price as any).toFixed(2).replace('.', ',');
      const textMsg = `*${product.name}*\n💵 Preço: *R$ ${priceFormatted}*`;

      const res = await fetch('/api/whatsapp-vendas/send-product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: effectivePhone,
          productId: product.id,
          productName: product.name,
          price: product.price,
          stock: product.stock,
          imageUrl: sendImage ? product.imageUrl : null,
          status: crmStatus,
          skipWhatsApp: true
        })
      });

      if (res.ok) {
        let imageBase64: string | null = null;
        if (sendImage && product.imageUrl) {
          try {
            imageBase64 = await imageUrlToBase64(product.imageUrl);
          } catch (err) {
            console.error('Erro ao converter imagem para base64:', err);
          }
        }

        postMessageToWhatsApp({
          source: 'belafarma-crm',
          type: 'send-product-media',
          text: textMsg,
          imageUrl: sendImage ? product.imageUrl : null,
          imageBase64: imageBase64
        });

        addToast(`✅ Produto "${product.name}" enviado com sucesso!`, 'success');
        
        // Recarregar histórico de mensagens
        await loadMessages(activeChat.id, true);
        
        // Atualiza a lista de chats com a última interação
        setChats(prev => prev.map(c => 
          c.id === activeChat.id ? { ...c, lastMessage: `[Produto] ${product.name}`, timestamp: Date.now() } : c
        ));
      } else {
        const data = await res.json();
        addToast(data.error || 'Erro ao enviar produto.', 'error');
      }
    } catch (err) {
      addToast('Erro de rede ao enviar produto.', 'error');
    } finally {
      setSendingProduct(null);
    }
  };

  // Auto-scroll para a última mensagem
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Carrega chats na montagem do componente
  useEffect(() => {
    loadChats();
  }, []);

  // Escuta atualizações em tempo real via Server-Sent Events (SSE)
  useEffect(() => {
    console.log('[WhatsAppVendas] Conectando ao canal de atualizações em tempo real (SSE)...');
    const eventSource = new EventSource('/api/webhook/stream');

    eventSource.onmessage = (event) => {
      if (event.data === 'message') {
        console.log('[WhatsAppVendas] 🔔 Atualização recebida do webhook. Atualizando chats e mensagens...');
        loadChats(true);
        if (activeChat) {
          loadMessages(activeChat.id, true);
        }
      }
    };

    eventSource.onerror = () => {
      console.warn('[WhatsAppVendas] Conexão SSE perdida ou em erro. O navegador tentará reconectar automaticamente.');
    };

    return () => {
      console.log('[WhatsAppVendas] Fechando canal de eventos SSE...');
      eventSource.close();
    };
  }, [activeChat]);

  // Polling periódico apenas como fallback de segurança (intervalo maior, 15 segundos)
  useEffect(() => {
    const interval = setInterval(() => {
      loadChats(true);
      if (activeChat) {
        loadMessages(activeChat.id, true);
      }
    }, 15000);

    return () => clearInterval(interval);
  }, [activeChat]);

  // Executa busca de produtos com debounce
  useEffect(() => {
    const delayDebounce = setTimeout(() => {
      searchProducts(productQuery);
    }, 400);

    return () => clearTimeout(delayDebounce);
  }, [productQuery]);

  // Seleciona um chat da lista
  const handleSelectChat = (chat: Chat) => {
    setActiveChat(chat);
    setMessages([]);
    loadMessages(chat.id);
    // Limpar contagem de não lidas visualmente
    setChats(prev => prev.map(c => c.id === chat.id ? { ...c, unreadCount: 0 } : c));
  };

  // Inicia chat temporário com um número novo digitado
  const handleStartTempChat = (phoneNum: string, initialName?: string) => {
    const cleanNum = phoneNum.replace(/\D/g, '');
    const jid = cleanNum.includes('@') ? cleanNum : `${cleanNum.length >= 12 ? cleanNum : '55' + cleanNum}@s.whatsapp.net`;
    const tempChat: Chat = {
      id: jid,
      phone: cleanNum,
      name: initialName || `Novo Contato (+${cleanNum})`,
      unreadCount: 0,
      lastMessage: 'Iniciar nova conversa',
      timestamp: Date.now()
    };
    
    // Adiciona na lista para visualização se não existir
    setChats(prev => {
      if (!prev.some(c => c.phone === cleanNum)) {
        return [tempChat, ...prev];
      }
      return prev;
    });
    
    setActiveChat(tempChat);
    setMessages([]);
    loadMessages(jid);
  };

  // Formata timestamp do chat
  const formatTime = (ts: number) => {
    const date = new Date(ts);
    const now = new Date();
    if (date.toDateString() === now.toDateString()) {
      return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  };

  // Filtra chats
  // Aparelhos pareados (":") são removidos da listagem, mas permitimos LIDs (Linked Device IDs)
  const filteredChats = chats
    .filter(c => !c.phone.includes(':')) // Remove apenas aparelhos pareados da listagem, mas mantém LIDs
    .filter(c => {
      if (!chatSearchQuery.trim()) {
        return c.timestamp > 0;
      }
      const query = chatSearchQuery.toLowerCase();
      return c.name.toLowerCase().includes(query) || c.phone.includes(query);
    });

  return (
    <div className="flex h-full w-full gap-0 overflow-hidden bg-red-50/15 dark:bg-slate-950 p-0 m-0 border-none animate-in fade-in duration-300">
      
      {/* ── COLUNA 1: Lista de Conversas ──────────────────────────────────────── */}
      {!isWidget && (
        <div className="w-[360px] lg:w-[420px] flex-shrink-0 flex flex-col h-full bg-white dark:bg-slate-900 border-r border-red-100/40 dark:border-red-950/45">
        
        {/* Header do Painel Esquerdo */}
        <div className="h-24 bg-red-50/40 dark:bg-red-950/20 border-b border-red-100/40 dark:border-red-950/45 px-6 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-red-650 dark:bg-red-600 flex items-center justify-center font-extrabold text-white text-lg shadow-md">
              BF
            </div>
            <div>
              <h2 className="text-lg lg:text-xl font-extrabold text-red-950 dark:text-red-100 leading-tight">BelaFarma</h2>
              <p className="text-sm text-red-600 font-bold flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse"></span>
                WhatsApp Vendas
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={() => loadChats()}
              disabled={loadingChats}
              className="p-3 rounded-full hover:bg-red-50 dark:hover:bg-red-950/40 text-slate-500 hover:text-red-600 transition disabled:opacity-50"
              title="Recarregar conversas"
            >
              <RefreshCw className={`w-6 h-6 ${loadingChats ? 'animate-spin text-red-650' : ''}`} />
            </button>
            
            {onClose && (
              <button
                onClick={onClose}
                className="p-3 rounded-full hover:bg-red-100/60 dark:hover:bg-red-950/50 text-slate-500 hover:text-red-600 transition"
                title="Voltar ao Belinha"
              >
                <LogOut className="w-6 h-6" />
              </button>
            )}
          </div>
        </div>

        {/* Busca de Chats */}
        <div className="p-5 bg-red-50/10 dark:bg-slate-900/30 border-b border-red-100/20 dark:border-red-950/30 flex-shrink-0">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-6 h-6 text-red-400/80" />
            <input
              type="text"
              placeholder="Buscar conversa ativa..."
              value={chatSearchQuery}
              onChange={e => setChatSearchQuery(e.target.value)}
              className="w-full pl-12 pr-6 py-3.5 text-base rounded-lg border border-red-100/30 dark:border-red-950/40 bg-red-50/50 dark:bg-slate-800 text-red-950 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-red-600 focus:bg-white dark:focus:bg-slate-850 transition-all"
            />
          </div>
        </div>

        {/* Lista de Contatos */}
        <div className="flex-1 overflow-y-auto">

          {loadingChats && chats.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-2 text-slate-400">
              <Loader2 className="w-6 h-6 animate-spin text-red-600" />
              <span className="text-xs">Buscando chats...</span>
            </div>
          ) : filteredChats.length === 0 ? (
            <div className="text-center py-10 text-slate-400 text-xs italic">
              Nenhuma conversa ativa encontrada
            </div>
          ) : (
            filteredChats.map(chat => {
              const isActive = activeChat?.id === chat.id;
              return (
                <button
                  key={chat.id}
                  onClick={() => handleSelectChat(chat)}
                  className={`w-full text-left px-6 py-5 flex items-center gap-5 transition-all duration-155 border-b border-red-50/50 dark:border-red-950/20 relative ${
                    isActive 
                      ? 'bg-red-50/60 dark:bg-red-950/20 border-l-4 border-red-600'
                      : 'bg-white dark:bg-slate-900 hover:bg-red-50/20 dark:hover:bg-red-950/10 border-l-4 border-transparent'
                  }`}
                >
                  {/* Avatar Circular com a Inicial */}
                  <div className={`w-16 h-16 rounded-full flex items-center justify-center font-extrabold text-2xl text-white flex-shrink-0 ${
                    isActive ? 'bg-red-650' : 'bg-red-100 dark:bg-red-950 text-red-800 dark:text-red-200'
                  }`}>
                    {chat.name[0]?.toUpperCase() || '?'}
                  </div>
                  
                  {/* Detalhes do Chat */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-lg font-extrabold text-red-950 dark:text-white truncate block">{chat.name}</span>
                      <span className="text-sm text-slate-400 dark:text-slate-500 font-bold">{formatTime(chat.timestamp)}</span>
                    </div>
                    <p className="text-base text-slate-500 dark:text-slate-400 truncate mt-2 leading-relaxed">{chat.lastMessage}</p>
                  </div>

                  {/* Badge de Mensagens Não Lidas */}
                  {chat.unreadCount > 0 && (
                    <span className="w-7 h-7 bg-red-650 text-white rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 absolute right-5 bottom-4 shadow-sm animate-in zoom-in duration-300">
                      {chat.unreadCount}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>
      )}

      {/* ── COLUNA 2: Janela de Conversa ──────────────────────────────────────── */}
      {!isWidget && (
        <div className="flex-1 flex flex-col h-full bg-[#fff8f8] dark:bg-[#0e0707]">
        {activeChat ? (
          <>
            {/* Header do Chat Ativo */}
            <div className={`border-b border-red-100/40 dark:border-red-950/45 bg-red-50/40 dark:bg-red-950/20 flex-shrink-0 flex flex-col`}>
              <div className="h-24 px-6 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={`w-16 h-16 rounded-full flex items-center justify-center font-extrabold text-white text-2xl shadow-md ${
                    isLidNumber(activeChat.phone) ? 'bg-amber-500' : 'bg-red-650 dark:bg-red-600'
                  }`}>
                    {activeChat.name[0]?.toUpperCase() || '?'}
                  </div>
                  <div>
                    <h3 className="text-lg lg:text-xl font-extrabold text-red-950 dark:text-white leading-tight">{activeChat.name}</h3>
                    <div className="flex items-center gap-2 text-sm text-red-650 font-bold">
                      <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                      <span>Online</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {/* Info de Telefone */}
                  <div className="p-3.5 rounded-full text-red-950 dark:text-red-200 text-base font-bold font-mono bg-red-50/80 dark:bg-red-950/40 border border-red-100/30 dark:border-red-900/30 flex items-center gap-2">
                    <Phone className="w-5 h-5 text-red-650" />
                    <span>{activeChat.phone}</span>
                  </div>
                  
                  <button 
                    onClick={() => setActiveChat(null)}
                    className="p-2.5 rounded-full hover:bg-red-50 dark:hover:bg-red-950/40 text-slate-500 hover:text-red-650 transition md:hidden"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Aviso de LID — número inválido */}
              {isLidNumber(activeChat.phone) && (
                <div className="px-4 py-2.5 bg-amber-50 dark:bg-amber-950/30 border-t border-amber-200 dark:border-amber-800 flex items-start gap-2.5 text-xs text-amber-800 dark:text-amber-300">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-500" />
                  <div>
                    <p className="font-bold">Contato com identificador temporário (LID — {activeChat.phone.replace(/\D/g, '').length} dígitos)</p>
                    <p>
                      Acesse a aba <strong>Ficha do Cliente</strong>, edite o campo <strong>WhatsApp</strong> para o número real (ex: <strong>5532988634755</strong>) e clique em <strong>Usar Número Real</strong>.
                      {clientInfo?.phone && !isLidNumber(clientInfo.phone) && clientInfo.phone.replace(/\D/g, '') !== activeChat.phone.replace(/\D/g, '') && (
                        <span className="ml-1 text-green-700 dark:text-green-400 font-bold">
                          ✅ Já há um número real salvo ({clientInfo.phone}) — os envios usarão este automaticamente.
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Balões de Mensagem */}
            <div className="flex-1 overflow-y-auto p-8 space-y-5 bg-[#fffbfb] dark:bg-[#0a0505] relative">
              {loadingMessages && messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-2 text-slate-400">
                  <Loader2 className="w-10 h-10 animate-spin text-red-600" />
                  <span className="text-sm">Carregando conversa...</span>
                </div>
              ) : (
                messages.map((msg) => {
                  return (
                    <div 
                      key={msg.id}
                      className={`flex ${msg.fromMe ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-200`}
                    >
                      <div className={`max-w-[70%] rounded-lg px-5 py-4 text-base shadow-sm relative ${
                        msg.fromMe 
                          ? 'bg-red-600 dark:bg-red-700 text-white rounded-tr-none border border-red-700 dark:border-red-800'
                          : 'bg-white dark:bg-red-950/25 text-slate-900 dark:text-red-100 rounded-tl-none border border-red-100/40 dark:border-red-950/40'
                      }`}>
                        
                        {/* Se for Imagem */}
                        {msg.isImage && (
                          <div className="mb-4 rounded-lg overflow-hidden border border-black/10 max-w-sm">
                            {msg.imageUrl ? (
                              <img 
                                src={msg.imageUrl} 
                                alt="Imagem do produto" 
                                className="w-full h-auto max-h-96 object-contain bg-white block"
                                onError={(e) => {
                                  // Em caso de falha de carregamento da imagem, esconde o elemento img
                                  (e.target as HTMLElement).style.display = 'none';
                                }}
                              />
                            ) : (
                              <div className="p-6 bg-black/5 flex items-center justify-center text-slate-400">
                                <ImageIcon className="w-12 h-12" />
                              </div>
                            )}
                          </div>
                        )}

                        <p className="whitespace-pre-line font-normal leading-relaxed text-[17px]">{msg.text}</p>
                        
                        <div className={`text-xs text-right mt-2 font-mono select-none ${
                          msg.fromMe 
                            ? 'text-red-100/90 dark:text-red-200/70' 
                            : 'text-slate-400 dark:text-slate-500'
                        }`}>
                          {new Date(msg.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Aviso de Janela de 24 horas expirada */}
            {!canSend && (
              <div className="px-8 py-3 bg-amber-50 dark:bg-amber-950/30 border-t border-b border-amber-200 dark:border-amber-800 flex items-center gap-3 text-sm text-amber-800 dark:text-amber-300">
                <AlertTriangle className="w-5 h-5 flex-shrink-0 text-amber-500" />
                <span>
                  <strong>Janela de 24 horas expirada:</strong> Só é permitido responder clientes que enviaram mensagem nas últimas 24 horas para evitar bloqueios.
                </span>
              </div>
            )}

            {/* Input de Mensagem */}
            <form onSubmit={handleSendMessage} className="h-24 px-8 border-t border-red-100/40 dark:border-red-950/45 flex gap-4 items-center bg-red-50/40 dark:bg-red-950/20 flex-shrink-0">
              <input
                type="text"
                placeholder={canSend ? "Escreva uma mensagem..." : "Envio bloqueado: a janela de 24h expirou."}
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                disabled={sendingMsg || !canSend}
                className="flex-1 px-6 py-4 text-lg rounded-lg border border-red-100/30 dark:border-red-950/40 bg-white dark:bg-slate-900 text-slate-800 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-red-650 transition-all disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!inputText.trim() || sendingMsg || !canSend}
                className="p-4 bg-red-650 hover:bg-red-700 text-white rounded-full disabled:opacity-50 disabled:cursor-not-allowed transition shadow-md shadow-red-500/20 flex-shrink-0"
              >
                {sendingMsg ? <Loader2 className="w-6 h-6 animate-spin" /> : <Send className="w-6 h-6" />}
              </button>
            </form>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-red-900/60 dark:text-red-200/60 gap-3">
            <div className="w-16 h-16 rounded-full bg-red-50/20 dark:bg-red-950/15 flex items-center justify-center text-red-500 shadow-sm border border-red-100/20 dark:border-red-900/20">
              <MessageSquare className="w-8 h-8 text-red-500" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-red-950 dark:text-red-100">Central de Vendas e Atendimento</h3>
              <p className="text-xs text-slate-500 dark:text-slate-450 max-w-xs mx-auto mt-1">
                Selecione um cliente na lista da esquerda para visualizar a conversa e iniciar o suporte consultivo.
              </p>
            </div>
          </div>
        )}
      </div>
      )}

      {/* ── COLUNA 3: Painel Lateral (Estoque ou Ficha do Cliente) ─────────────── */}
      <div className={`${isWidget ? 'w-full' : 'w-[440px] lg:w-[500px]'} flex-shrink-0 flex flex-col h-full bg-white dark:bg-slate-900 border-l border-red-100/40 dark:border-red-950/45`}>
        
        {/* Header da Coluna 3 com Abas */}
        <div className="h-24 bg-red-50/40 dark:bg-red-950/20 border-b border-red-100/40 dark:border-red-950/45 px-6 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-7 h-7 text-red-650" />
            <h2 className="text-base lg:text-lg font-extrabold text-red-950 dark:text-white uppercase tracking-tight">Painel</h2>
          </div>
          
          <div className="flex bg-red-100/50 dark:bg-red-950/50 p-1 rounded-lg text-xs font-bold shadow-inner">
            <button
              onClick={() => setActiveTab('estoque')}
              className={`px-3 py-1.5 rounded-md transition ${
                activeTab === 'estoque'
                  ? 'bg-white dark:bg-red-900 text-red-700 dark:text-red-200 shadow-sm'
                  : 'text-red-900/65 dark:text-red-300 hover:text-red-700'
              }`}
            >
              Estoque
            </button>
            <button
              onClick={() => {
                if (activeChat) {
                  setActiveTab('cliente');
                  loadCustomerData(activeChat.phone);
                } else {
                  addToast('Selecione uma conversa para ver a ficha do cliente.', 'warning');
                }
              }}
              disabled={!activeChat}
              className={`px-3 py-1.5 rounded-md transition disabled:opacity-40 disabled:cursor-not-allowed ${
                activeTab === 'cliente'
                  ? 'bg-white dark:bg-red-900 text-red-700 dark:text-red-200 shadow-sm'
                  : 'text-red-900/65 dark:text-red-300 hover:text-red-700'
              }`}
            >
              Ficha do Cliente
            </button>
          </div>
        </div>

        {activeTab === 'estoque' ? (
          <>
            {/* Busca de Produtos */}
            <div className="p-5 bg-red-50/10 dark:bg-slate-900/30 border-b border-red-100/20 dark:border-red-950/30 flex-shrink-0">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-6 h-6 text-red-500/70" />
                <input
                  type="text"
                  placeholder="Pesquisar produto ou barras..."
                  value={productQuery}
                  onChange={e => setProductQuery(e.target.value)}
                  className="w-full pl-12 pr-6 py-3.5 text-base rounded-lg border border-red-100/30 dark:border-red-950/40 bg-red-50/50 dark:bg-slate-800 text-slate-805 dark:text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-red-600 focus:bg-white dark:focus:bg-slate-850 transition-all"
                />
              </div>
            </div>

            {/* Filtro de Categorias */}
            {products.length > 0 && (
              <div className="px-5 py-3 bg-red-50/5 dark:bg-slate-900/20 border-b border-red-100/15 dark:border-red-950/35 flex-shrink-0 flex items-center gap-2 overflow-x-auto no-scrollbar">
                {categoriesList.map(cat => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-3 py-1.5 rounded-full font-bold text-xs whitespace-nowrap transition-all duration-150 ${
                      selectedCategory === cat
                        ? 'bg-red-650 text-white shadow-sm shadow-red-500/20'
                        : 'bg-red-50/70 hover:bg-red-100/50 dark:bg-red-950/30 dark:hover:bg-red-950/55 text-red-900 dark:text-red-350 border border-red-100/10 dark:border-red-900/10'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            )}

            {/* Filtros de CRM e Ação rápida */}
            <div className="p-5 border-b border-red-100/20 dark:border-red-950/20 flex-shrink-0">
              <div className="flex items-center justify-between gap-4 bg-red-50/20 dark:bg-red-950/10 px-5 py-4 rounded-xl border border-red-100/20 dark:border-red-900/20 text-base shadow-sm">
                <span className="font-extrabold text-red-950/70 dark:text-red-200/70">Salvar no CRM como:</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setCrmStatus('pesquisado')}
                    className={`px-4 py-2 rounded-lg font-extrabold text-sm uppercase transition ${
                      crmStatus === 'pesquisado'
                        ? 'bg-blue-500 text-white shadow-sm'
                        : 'text-red-900/70 dark:text-red-300/70 hover:bg-red-50 dark:hover:bg-red-950/40'
                    }`}
                  >
                    Pesquisado
                  </button>
                  <button
                    type="button"
                    onClick={() => setCrmStatus('comprado')}
                    className={`px-4 py-2 rounded-lg font-extrabold text-sm uppercase transition ${
                      crmStatus === 'comprado'
                        ? 'bg-red-600 text-white shadow-sm'
                        : 'text-red-900/70 dark:text-red-300/70 hover:bg-red-50 dark:hover:bg-red-950/40'
                    }`}
                  >
                    Comprado
                  </button>
                </div>
              </div>
            </div>

            {/* Painel da Lista de Envio (Carrinho) */}
            {selectedProducts.length > 0 && (
              <div className="p-5 bg-red-50/60 dark:bg-red-950/15 border-b border-red-100/60 dark:border-red-900/35 flex-shrink-0 animate-in slide-in-from-top duration-300">
                <div className="flex items-center justify-between mb-3">
                  <span className="font-extrabold text-sm text-red-800 dark:text-red-450 flex items-center gap-2">
                    <ShoppingBag className="w-4 h-4" />
                    Lista de Envio ({selectedProducts.length} {selectedProducts.length === 1 ? 'item' : 'itens'})
                  </span>
                  <button 
                    onClick={() => setSelectedProducts([])}
                    className="text-xs text-red-650 hover:text-red-800 font-bold transition flex items-center gap-1"
                  >
                    <X className="w-3.5 h-3.5" /> Limpar tudo
                  </button>
                </div>
                
                <div className="max-h-28 overflow-y-auto space-y-1.5 mb-4 pr-1">
                  {selectedProducts.map(item => (
                    <div key={item.product.id} className="flex items-center justify-between bg-white dark:bg-red-950/30 px-3 py-1.5 rounded-lg border border-red-100/30 dark:border-red-900/20 text-sm">
                      <span className="truncate font-semibold text-red-950 dark:text-red-100 max-w-[170px] lg:max-w-[220px]" title={item.product.name}>
                        {item.product.name}
                      </span>
                      <div className="flex items-center gap-2.5 flex-shrink-0">
                        {/* Alternador de Status do produto no CRM */}
                        <button
                          type="button"
                          onClick={() => toggleCartItemStatus(item.product.id)}
                          className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase transition-all duration-150 border ${
                            item.status === 'comprado'
                              ? 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400 border-red-200/40 dark:border-red-900/30'
                              : 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-450 border-blue-200/40 dark:border-blue-900/30'
                          }`}
                          title="Clique para alternar (Comprado / Pesquisado)"
                        >
                          {item.status === 'comprado' ? '🛍️ Leva' : '🔍 Orçado'}
                        </button>
                        
                        <span className="font-bold text-red-600 dark:text-red-450">
                          R$ {item.product.price.toFixed(2).replace('.', ',')}
                        </span>
                        <button 
                          onClick={() => toggleProductSelection(item.product)}
                          className="text-red-500 hover:text-red-750 transition"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between border-t border-red-100/80 dark:border-red-900/40 pt-3">
                  <div>
                    <span className="text-xs text-slate-400 dark:text-slate-500 block">Total Estimado</span>
                    <span className="text-lg font-extrabold text-red-750 dark:text-red-400">
                      R$ {selectedProducts.reduce((sum, item) => sum + item.product.price, 0).toFixed(2).replace('.', ',')}
                    </span>
                  </div>
                  
                  <button
                    onClick={handleSendSelectedList}
                    disabled={sendingMsg || !activeChat || !canSend}
                    className="px-5 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg font-extrabold text-sm transition flex items-center gap-2 shadow-sm shadow-red-500/20"
                  >
                    {sendingMsg ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Enviando...
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        Enviar Orçamento (Texto)
                      </>
                    )}
                  </button>
                </div>
                {!canSend && activeChat && (
                  <p className="text-[11px] text-red-555 mt-2 font-medium">
                    * O envio está bloqueado porque a última mensagem do cliente foi há mais de 24h.
                  </p>
                )}
              </div>
            )}

            {/* Lista de Cards de Produtos */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {searchingProducts ? (
                <div className="flex flex-col items-center justify-center h-40 gap-2 text-slate-400">
                  <Loader2 className="w-6 h-6 animate-spin text-red-600" />
                  <span className="text-xs">Buscando estoque...</span>
                </div>
              ) : productQuery.length < 2 ? (
                <div className="text-center py-20 text-slate-400 text-xs flex flex-col items-center gap-3">
                  <Sparkles className="w-8 h-8 text-amber-450 animate-pulse" />
                  <span>Digite o nome do produto ou código de barras para pesquisar.</span>
                </div>
              ) : filteredProducts.length === 0 ? (
                <div className="text-center py-10 text-slate-400 text-xs italic">
                  Nenhum produto encontrado nesta categoria
                </div>
              ) : (
                filteredProducts.map(prod => {
                  const isStockOk = prod.stock > 5;
                  const hasStock = prod.stock > 0;
                  const isSending = sendingProduct === prod.id;

                  return (
                    <div
                      key={prod.id}
                      className="bg-white dark:bg-slate-900 rounded-xl border border-red-100/40 dark:border-red-950/45 shadow-sm overflow-hidden flex flex-col hover:shadow-md transition duration-200 relative"
                    >
                      {/* Botão de Seleção (Carrinho) */}
                      <button
                        onClick={() => toggleProductSelection(prod)}
                        className={`absolute top-3 right-3 p-1.5 rounded-full transition-all duration-200 ${
                          isProductSelected(prod.id)
                            ? 'bg-red-600 text-white shadow-sm'
                            : 'bg-red-50 hover:bg-red-100 dark:bg-red-950/40 dark:hover:bg-red-950/80 text-red-750 dark:text-red-300'
                        }`}
                        title={isProductSelected(prod.id) ? "Remover da lista de envio" : "Adicionar à lista de envio"}
                      >
                        <CheckCircle className={`w-5 h-5 ${isProductSelected(prod.id) ? 'fill-current text-white' : ''}`} />
                      </button>

                      <div className="p-5 flex gap-5">
                        {/* Imagem do Produto */}
                        <div className="w-28 h-28 bg-red-50/15 dark:bg-slate-950/40 rounded-lg overflow-hidden flex-shrink-0 flex items-center justify-center border border-red-100/10 dark:border-red-950/20">
                          {prod.imageUrl ? (
                            <img 
                              src={prod.imageUrl} 
                              alt={prod.name}
                              className="w-full h-full object-contain hover:scale-110 transition duration-300"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none';
                              }}
                            />
                          ) : (
                            <Pill className="w-12 h-12 text-red-600/40 dark:text-red-900/40" />
                          )}
                        </div>

                        {/* Detalhes Textuais */}
                        <div className="flex-1 min-w-0">
                          <h4 className="text-base font-extrabold text-red-950 dark:text-white truncate pr-8" title={prod.name}>
                            {prod.name}
                          </h4>
                          {prod.barcode && (
                            <p className="text-sm text-slate-400 font-mono mt-1">EAN: {prod.barcode}</p>
                          )}
                          
                          {/* Preço e Estoque */}
                          <div className="flex items-center justify-between mt-3">
                            <span className="text-base lg:text-lg font-extrabold text-red-600 dark:text-red-400 font-sans">
                              R$ {prod.price.toFixed(2).replace('.', ',')}
                            </span>
                            
                            <span className={`inline-flex items-center gap-2 px-3 py-1 rounded text-sm font-extrabold ${
                              isStockOk 
                                ? 'bg-red-50 text-red-750 dark:bg-red-950/40 dark:text-red-450'
                                : hasStock
                                  ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-405'
                                  : 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400'
                            }`}>
                              {hasStock ? `${prod.stock} un` : 'Falta'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Ações do Card */}
                      <div className="px-4 pb-4 pt-2 border-t border-red-50/60 dark:border-red-950/30 flex gap-2">
                        <button
                          onClick={() => handleSendProduct(prod, false)}
                          disabled={isSending || !activeChat || !canSend}
                          className="flex-1 py-2.5 bg-red-50/50 hover:bg-red-100/60 dark:bg-red-950/25 dark:hover:bg-red-950/50 text-red-900 dark:text-red-200 rounded-lg font-extrabold text-xs disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-1.5 border border-red-100/40 dark:border-red-900/30"
                        >
                          {isSending ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Send className="w-3.5 h-3.5 text-red-650" />
                          )}
                          Apenas Info
                        </button>
                        {prod.imageUrl && (
                          <button
                            onClick={() => handleSendProduct(prod, true)}
                            disabled={isSending || !activeChat || !canSend}
                            className="flex-1 py-2.5 bg-gradient-to-r from-red-600 to-rose-600 hover:opacity-95 text-white rounded-lg font-extrabold text-xs disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-1.5 shadow-sm shadow-red-500/10"
                          >
                            {isSending ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <ImageIcon className="w-3.5 h-3.5" />
                            )}
                            Foto + Info
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </>
        ) : (
          /* ABA FICHA DO CLIENTE */
          <div className="flex-1 flex flex-col h-full overflow-hidden bg-red-50/5 dark:bg-slate-900/40">
            {loadingClient ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-2 text-slate-400">
                <Loader2 className="w-10 h-10 animate-spin text-red-650" />
                <span className="text-sm">Carregando ficha do cliente...</span>
              </div>
            ) : clientInfo ? (
              <div className="flex-1 flex flex-col h-full overflow-hidden">
                {/* Formulário do Cliente com rolagem */}
                <form onSubmit={handleSaveCustomer} className="flex-1 overflow-y-auto p-6 space-y-5">
                  <h3 className="text-base font-extrabold text-red-950 dark:text-red-100 uppercase tracking-wider border-b pb-2 border-red-100/40 dark:border-red-950/40">
                    Dados Cadastrais
                  </h3>
                  
                  {/* Seção de busca rápida no CRM para vincular */}
                  <div className="p-4 bg-slate-50 dark:bg-slate-800/40 border border-slate-200/50 dark:border-slate-800/50 rounded-xl space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Mapeamento de Cadastro</span>
                      <button
                        type="button"
                        onClick={() => setShowCrmSearch(!showCrmSearch)}
                        className="text-xs font-extrabold text-red-650 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 flex items-center gap-1.5 transition duration-150 focus:outline-none"
                      >
                        {showCrmSearch ? 'Fechar Busca' : '🔎 Buscar no CRM'}
                      </button>
                    </div>

                    {showCrmSearch && (
                      <div className="space-y-2 relative">
                        <input
                          type="text"
                          placeholder="Pesquisar por nome, apelido, telefone ou CPF..."
                          value={crmSearchQuery}
                          onChange={e => handleSearchCrm(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white text-xs focus:outline-none focus:ring-1 focus:ring-red-650"
                        />
                        {isSearchingCrm && (
                          <div className="text-xxs text-slate-400 flex items-center gap-1">
                            <Loader2 className="w-3 h-3 animate-spin text-red-650" /> Buscando...
                          </div>
                        )}
                        {crmSearchResults.length > 0 && (
                          <div className="absolute z-10 w-full mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-lg max-h-48 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-850">
                            {crmSearchResults.map(cust => (
                              <button
                                key={cust.id}
                                type="button"
                                onClick={() => handleSelectCrmCustomer(cust)}
                                className="w-full px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60 flex flex-col gap-0.5 text-xs transition duration-150"
                              >
                                <span className="font-bold text-slate-800 dark:text-white">{cust.name}</span>
                                <span className="text-xxs text-slate-450 dark:text-slate-400">
                                  Telefone: {cust.phone || 'Sem número'} {cust.whatsapp_lid ? `(Vínculo LID: ${cust.whatsapp_lid})` : ''}
                                </span>
                              </button>
                            ))}
                          </div>
                        )}
                        {crmSearchQuery.trim().length >= 2 && !isSearchingCrm && crmSearchResults.length === 0 && (
                          <div className="text-xxs text-slate-400 p-1">
                            Nenhum cliente encontrado com esse termo.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  
                  {/* Nome */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-red-900/80 dark:text-red-300/80 flex items-center gap-1.5">
                      <User className="w-4 h-4 text-red-500" /> Nome Completo
                    </label>
                    <input
                      type="text"
                      required
                      value={clientInfo.name}
                      onChange={e => setClientInfo(prev => prev ? { ...prev, name: e.target.value } : null)}
                      className="w-full px-4 py-2.5 rounded-lg border border-red-100/20 dark:border-red-950/40 bg-white dark:bg-slate-800 text-slate-800 dark:text-white text-sm focus:outline-none focus:ring-1 focus:ring-red-650 shadow-sm"
                    />
                  </div>

                  {/* Apelido / CPF */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-red-900/80 dark:text-red-300/80">
                        Apelido / Como chamar
                      </label>
                      <input
                        type="text"
                        value={clientInfo.nickname || ''}
                        onChange={e => setClientInfo(prev => prev ? { ...prev, nickname: e.target.value } : null)}
                        className="w-full px-4 py-2.5 rounded-lg border border-red-100/20 dark:border-red-950/40 bg-white dark:bg-slate-800 text-slate-800 dark:text-white text-sm focus:outline-none focus:ring-1 focus:ring-red-650 shadow-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-red-900/80 dark:text-red-300/80 flex items-center gap-1.5">
                        <FileText className="w-4 h-4 text-red-500" /> CPF
                      </label>
                      <input
                        type="text"
                        placeholder="Ex: 000.000.000-00"
                        value={clientInfo.cpf || ''}
                        onChange={e => setClientInfo(prev => prev ? { ...prev, cpf: e.target.value } : null)}
                        className="w-full px-4 py-2.5 rounded-lg border border-red-100/20 dark:border-red-950/40 bg-white dark:bg-slate-800 text-slate-800 dark:text-white text-sm focus:outline-none focus:ring-1 focus:ring-red-650 shadow-sm"
                      />
                    </div>
                  </div>

                  {/* Telefone / E-mail */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-red-900/80 dark:text-red-300/80 flex items-center gap-1.5">
                        <Phone className="w-4 h-4 text-red-500" /> WhatsApp
                      </label>
                      <input
                        type="text"
                        value={clientInfo.phone}
                        onChange={e => setClientInfo(prev => prev ? { ...prev, phone: e.target.value.replace(/\D/g, '') } : null)}
                        className="w-full px-4 py-2.5 rounded-lg border border-red-100/20 dark:border-red-950/40 bg-white dark:bg-slate-800 text-slate-850 dark:text-white text-sm focus:outline-none focus:ring-1 focus:ring-red-650 shadow-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-red-900/80 dark:text-red-300/80 flex items-center gap-1.5">
                        <Mail className="w-4 h-4 text-red-500" /> E-mail
                      </label>
                      <input
                        type="email"
                        value={clientInfo.email || ''}
                        onChange={e => setClientInfo(prev => prev ? { ...prev, email: e.target.value } : null)}
                        className="w-full px-4 py-2.5 rounded-lg border border-red-100/20 dark:border-red-950/40 bg-white dark:bg-slate-800 text-slate-850 dark:text-white text-sm focus:outline-none focus:ring-1 focus:ring-red-650 shadow-sm"
                      />
                    </div>
                  </div>

                  {/* Botão de normalização de número real (se for diferente do chat atual) */}
                  {activeChat && clientInfo && (() => {
                    const cleanedClientPhone = clientInfo.phone.replace(/\D/g, '');
                    const cleanedChatPhone = activeChat.phone.replace(/\D/g, '');
                    const isDifferent = cleanedClientPhone !== cleanedChatPhone;
                    const isValidLen = cleanedClientPhone.length >= 10 && cleanedClientPhone.length <= 15;
                    
                    if (isDifferent && isValidLen) {
                      return (
                        <div className="p-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 rounded-xl space-y-2.5 animate-in slide-in-from-top duration-250">
                          <div className="flex items-start gap-2 text-xs text-amber-800 dark:text-amber-300">
                            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-500" />
                            <p>
                              O número editado <strong>(+{clientInfo.phone})</strong> é diferente do JID atual <strong>(+{activeChat.phone})</strong>.
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={async () => {
                              if (savingClient) return;
                              setSavingClient(true);
                              try {
                                // 1. Salvar primeiro o novo cadastro no banco SQLite
                                const res = await fetch(`/api/whatsapp-vendas/customers/${encodeURIComponent(activeChat.phone)}`, {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify(clientInfo)
                                });
                                const data = await res.json();
                                if (data.success) {
                                  addToast('✅ Cadastro atualizado com o número real!', 'success');
                                  
                                  // 2. Iniciar nova conversa apontando para o número correto
                                  handleStartTempChat(clientInfo.phone, clientInfo.name);
                                } else {
                                  addToast(data.error || 'Erro ao atualizar cadastro.', 'error');
                                }
                              } catch (err) {
                                addToast('Erro de rede ao atualizar cadastro.', 'error');
                              } finally {
                                setSavingClient(false);
                              }
                            }}
                            className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 dark:bg-amber-600 dark:hover:bg-amber-700 text-white rounded-lg font-bold text-xs uppercase shadow-sm flex items-center justify-center gap-2 transition duration-150"
                          >
                            <Phone className="w-4 h-4" />
                            Usar Número Real (Nova Conversa)
                          </button>
                        </div>
                      );
                    }
                    return null;
                  })()}

                  {/* Endereço de Entrega */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-red-900/80 dark:text-red-300/80 flex items-center gap-1.5">
                      <MapPin className="w-4 h-4 text-red-500" /> Endereço de Entrega
                    </label>
                    <textarea
                      rows={3}
                      placeholder="Rua, número, bairro, complemento..."
                      value={clientInfo.address || ''}
                      onChange={e => setClientInfo(prev => prev ? { ...prev, address: e.target.value } : null)}
                      className="w-full px-4 py-2.5 rounded-lg border border-red-100/20 dark:border-red-950/40 bg-white dark:bg-slate-800 text-slate-800 dark:text-white text-sm focus:outline-none focus:ring-1 focus:ring-red-650 shadow-sm resize-none"
                    />
                  </div>

                  {/* Observações / Notas */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-red-900/80 dark:text-red-300/80">
                      Observações / Alergias
                    </label>
                    <textarea
                      rows={2}
                      placeholder="Ex: Alérgico a dipirona, prefere entrega rápida..."
                      value={clientInfo.notes || ''}
                      onChange={e => setClientInfo(prev => prev ? { ...prev, notes: e.target.value } : null)}
                      className="w-full px-4 py-2.5 rounded-lg border border-red-100/20 dark:border-red-950/40 bg-white dark:bg-slate-800 text-slate-800 dark:text-white text-sm focus:outline-none focus:ring-1 focus:ring-red-650 shadow-sm resize-none"
                    />
                  </div>

                  {/* Botão de Salvar */}
                  <button
                    type="submit"
                    disabled={savingClient}
                    className="w-full py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-extrabold text-sm uppercase shadow-sm shadow-red-500/20 flex items-center justify-center gap-2 transition disabled:opacity-50"
                  >
                    {savingClient ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" /> Salvando...
                      </>
                    ) : (
                      'Salvar Cadastro'
                    )}
                  </button>
                  
                  {/* Histórico de Compras (Vendas) */}
                  <div className="pt-4 space-y-3">
                    <h3 className="text-base font-extrabold text-red-950 dark:text-red-100 uppercase tracking-wider border-b pb-2 border-red-100/40 dark:border-red-950/40">
                      Vendas e Consultas (CRM)
                    </h3>
                    
                    {clientHistory.length === 0 ? (
                      <p className="text-sm text-red-900/60 dark:text-red-300/50 italic text-center py-4">
                        Nenhum histórico de interação cadastrado.
                      </p>
                    ) : (
                      <div className="space-y-2.5">
                        {clientHistory.map((h, i) => {
                          const isPurchase = h.status === 'comprado';
                          return (
                            <div key={i} className="bg-white dark:bg-red-950/15 p-4 rounded-xl border border-red-100/20 dark:border-red-900/20 flex justify-between items-center text-sm shadow-sm">
                              <div className="min-w-0 pr-4">
                                <span className="font-extrabold text-red-950 dark:text-red-50 truncate block" title={h.productName}>
                                  {h.productName}
                                </span>
                                <span className="text-[11px] text-slate-400 dark:text-slate-500 block mt-1 font-mono">
                                  {new Date(h.date).toLocaleString('pt-BR')}
                                </span>
                              </div>
                              <span className={`px-2.5 py-1 rounded text-xs font-extrabold uppercase whitespace-nowrap flex-shrink-0 ${
                                isPurchase 
                                  ? 'bg-red-50 text-red-750 dark:bg-red-950/40 dark:text-red-400'
                                  : 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-450'
                              }`}>
                                {h.status}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </form>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-red-900/60 dark:text-red-200/60">
                <span>Nenhum cliente carregado.</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
export default WhatsAppVendas;
