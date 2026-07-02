/**
 * whatsapp-vendas-endpoints.js
 * Endpoints para o módulo WhatsApp Vendas
 * Integração em tempo real de chats (Evolution API), estoque (Digifarma Firebird) e fotos de produtos (SQLite)
 * Atualizado: 2026-06-11 — filtro @lid, payload textMessage, tratamento de erros amigável
 */

const fetch = require('node-fetch');
const baileys = require('./baileys-service');
const baileysSecondary = require('./baileys-secondary-service');
const { queryDigifarma } = require('./services/digifarma.service');

const EVOLUTION_MAIN_INSTANCE = process.env.EVOLUTION_MAIN_INSTANCE || 'belaFarma';
const EVOLUTION_SENDER_INSTANCE = process.env.EVOLUTION_SENDER_INSTANCE || EVOLUTION_MAIN_INSTANCE || 'belaFarma';
const API_URL = process.env.EVOLUTION_API_URL || 'http://localhost:8080';
const API_KEY = process.env.EVOLUTION_API_KEY || 'BelafarmaSul2026';
const SENDER_API_KEY = process.env.EVOLUTION_SENDER_API_KEY || API_KEY;

// Helper: limpar telefone
function cleanPhone(phone) {
  if (!phone) return '';
  return phone.replace(/\D/g, '');
}

// Helper: obter chave de normalização de telefone (sem DDI 55 se tiver 12/13 dígitos)
function getPhoneKey(phone) {
  let clean = cleanPhone(phone);
  if (clean.startsWith('55') && (clean.length === 12 || clean.length === 13)) {
    clean = clean.slice(2);
  }
  return clean;
}

// Helper: formatar para número do JID
function formatJID(phone) {
  const clean = cleanPhone(phone);
  if (!clean) return '';
  if (clean.includes('@s.whatsapp.net')) return clean;
  // Se já tiver DDI, só adiciona o sufixo, se não tiver assume 55
  const withDDI = clean.length >= 12 ? clean : '55' + clean;
  return `${withDDI}@s.whatsapp.net`;
}

// Helper: gerar ID
function genId(prefix = 'id') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
}

// Helper: chamar Evolution API com timeout de 3 segundos
async function evolutionFetch(path, options = {}) {
  const url = `${API_URL}${path}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3000);

  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'apikey': API_KEY,
        ...(options.headers || {}),
      },
    });
    clearTimeout(timeoutId);
    return res;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      console.warn(`[WhatsAppVendas] Timeout de 3s excedido ao chamar Evolution API: ${path}`);
    }
    throw error;
  }
}

/**
 * Inicializa os endpoints do módulo WhatsApp Vendas
 */
function initializeWhatsAppVendasEndpoints(app, db) {

  // 1. GET /api/whatsapp-vendas/chats — Lista os chats recentes da Evolution API
  app.get('/api/whatsapp-vendas/chats', async (req, res) => {
    let evolutionChats = [];
    let isOffline = false;

    // 1. Tentar buscar chats da Evolution API
    try {
      console.log('[WhatsAppVendas] Buscando chats na Evolution API...');
      const response = await evolutionFetch(`/chat/findChats/${EVOLUTION_MAIN_INSTANCE}`);
      
      if (response.ok) {
        const data = await response.json();
        const chatsList = Array.isArray(data) ? data : (data.chats || data.data || []);
        
        evolutionChats = chatsList
          .filter(c => {
            const jid = c.id || c.remoteJid || '';
            if (!jid) return false;
            if (jid.includes('@g.us') || jid.includes('@broadcast')) return false;
            if (jid.includes(':')) return false; // Aparelho pareado
            // Rejeitar Linked Device IDs muito longos: mais de 15 dígitos
            const phoneDigits = jid.split('@')[0].replace(/\D/g, '');
            if (phoneDigits.length > 15) return false;
            return true;
          })
          .map(c => {
            const jid = c.id || c.remoteJid || '';
            const phone = jid.split('@')[0];
            
            let lastMessageText = '';
            if (c.lastMessage?.message) {
              const msg = c.lastMessage.message;
              lastMessageText = msg.conversation || msg.extendedTextMessage?.text || msg.imageMessage?.caption || '[Mídia/Imagem]';
            }

            const ts = (() => {
              if (c.updatedAt) {
                const parsed = new Date(c.updatedAt).getTime();
                if (!isNaN(parsed)) return parsed;
              }
              if (c.lastMessage?.messageTimestamp) {
                return c.lastMessage.messageTimestamp * 1000;
              }
              return Date.now();
            })();

            return {
              id: jid,
              phone,
              name: c.name || c.pushName || `Cliente WA ${phone.slice(-4)}`,
              unreadCount: c.unreadCount || 0,
              lastMessage: lastMessageText,
              timestamp: ts
            };
          });
      } else {
        console.warn(`[WhatsAppVendas] Evolution API respondeu com status ${response.status}. Usando fallback local.`);
        isOffline = true;
      }
    } catch (err) {
      console.warn('[WhatsAppVendas] Erro ao conectar na Evolution API:', err.message);
      isOffline = true;
    }

    // 2. Buscar contatos e conversas do SQLite local (histórico anterior)
    try {
      // 1. Buscar todas as conversas baseadas em mensagens ativas locais (com mensagens salvas)
      const dbChats = db.prepare(`
        SELECT 
          wm.phone, 
          MAX(wm.timestamp) as last_local_ts,
          (SELECT messageText FROM whatsapp_messages WHERE phone = wm.phone ORDER BY timestamp DESC LIMIT 1) as last_local_msg
        FROM whatsapp_messages wm
        WHERE wm.phone IS NOT NULL AND length(wm.phone) >= 8
        GROUP BY wm.phone
      `).all();

      const activePhones = new Set(dbChats.map(c => getPhoneKey(c.phone)));

      // 2. Buscar contatos do CRM
      const customers = db.prepare(`
        SELECT id, name, phone, whatsapp_name 
        FROM customers 
        WHERE phone IS NOT NULL AND length(replace(phone,'\"','')) > 0
      `).all();

      // 3. Buscar usuários do sistema
      let systemUsers = [];
      try {
        systemUsers = db.prepare(`
          SELECT id, name, phone FROM users WHERE phone IS NOT NULL AND phone != ''
        `).all();
      } catch(e) {}

      // Mapeia todas as conversas ativas locais
      const activeChats = dbChats.map(c => {
        const phone = cleanPhone(c.phone);
        const jid = formatJID(phone);
        
        let name = null;
        try {
          const cust = db.prepare('SELECT name, whatsapp_name FROM customers WHERE phone = ? OR phone LIKE ? LIMIT 1').get(phone, `%${phone.slice(-8)}`);
          if (cust) name = cust.name || cust.whatsapp_name;
        } catch(e) {}

        if (!name) {
          try {
            const user = db.prepare('SELECT name FROM users WHERE phone = ? OR phone LIKE ? LIMIT 1').get(phone, `%${phone.slice(-8)}`);
            if (user) name = user.name;
          } catch(e) {}
        }

        return {
          id: jid,
          phone,
          name: name || `Cliente WA ${phone.slice(-4)}`,
          unreadCount: 0,
          lastMessage: c.last_local_msg || 'Contato local',
          timestamp: c.last_local_ts || 0
        };
      });

      // Mapeia contatos inativos locais (CRM/Users que não têm mensagens no SQLite)
      const inactiveChats = [];
      for (const c of customers) {
        const phone = cleanPhone(c.phone);
        if (phone.length < 8 || phone.length > 15) continue;
        const key = getPhoneKey(phone);
        if (!activePhones.has(key)) {
          inactiveChats.push({
            id: formatJID(phone),
            phone,
            name: c.name || c.whatsapp_name || `Cliente WA ${phone.slice(-4)}`,
            unreadCount: 0,
            lastMessage: 'Contato local',
            timestamp: 0
          });
        }
      }

      for (const u of systemUsers) {
        const phone = cleanPhone(u.phone);
        if (phone.length < 8 || phone.length > 15) continue;
        const key = getPhoneKey(phone);
        if (!activePhones.has(key)) {
          inactiveChats.push({
            id: formatJID(phone),
            phone,
            name: u.name,
            unreadCount: 0,
            lastMessage: 'Usuário do sistema',
            timestamp: 0
          });
        }
      }

      const allLocalChats = [...activeChats, ...inactiveChats];

      // Se a Evolution API está offline, retornamos apenas o banco local
      if (isOffline) {
        const sortedLocal = allLocalChats.sort((a, b) => b.timestamp - a.timestamp);
        return res.json({ success: true, chats: sortedLocal, offline: true });
      }

      // Se a Evolution API está online, fazemos a mesclagem!
      const mergedMap = new Map();

      // Buscar mapeamento de LIDs para telefones reais do SQLite
      let customersWithLid = [];
      const lidToRealMap = new Map();
      try {
        customersWithLid = db.prepare('SELECT phone, whatsapp_lid FROM customers WHERE whatsapp_lid IS NOT NULL AND phone IS NOT NULL').all();
        for (const row of customersWithLid) {
          const realKey = getPhoneKey(row.phone);
          const lidKey = getPhoneKey(row.whatsapp_lid);
          lidToRealMap.set(lidKey, realKey);
        }
      } catch (e) {
        console.warn('[WhatsAppVendas] Erro ao carregar mapeamento de LIDs:', e.message);
      }
      
      // Insere primeiro os contatos locais (ativos + inativos)
      for (const lc of allLocalChats) {
        if (lc.phone) {
          const rawKey = getPhoneKey(lc.phone);
          // Se for um LID mapeado, redireciona a chave para o telefone real
          const key = lidToRealMap.get(rawKey) || rawKey;
          
          let finalJid = lc.id;
          let finalPhone = lc.phone;
          
          if (lidToRealMap.has(rawKey)) {
            const row = customersWithLid.find(r => getPhoneKey(r.whatsapp_lid) === rawKey);
            if (row) {
              finalPhone = cleanPhone(row.phone);
              finalJid = formatJID(finalPhone);
            }
          }

          const adjustedLc = {
            ...lc,
            id: finalJid,
            phone: finalPhone
          };

          const existing = mergedMap.get(key);
          if (existing) {
            const finalTs = Math.max(adjustedLc.timestamp || 0, existing.timestamp || 0);
            mergedMap.set(key, {
              ...existing,
              ...adjustedLc,
              timestamp: finalTs
            });
          } else {
            mergedMap.set(key, adjustedLc);
          }
        }
      }

      // Insere os chats em tempo real da Evolution API
      for (const ec of evolutionChats) {
        if (ec.phone) {
          const rawKey = getPhoneKey(ec.phone);
          const key = lidToRealMap.get(rawKey) || rawKey;
          
          let finalJid = ec.id;
          let finalPhone = ec.phone;
          
          if (lidToRealMap.has(rawKey)) {
            const row = customersWithLid.find(r => getPhoneKey(r.whatsapp_lid) === rawKey);
            if (row) {
              finalPhone = cleanPhone(row.phone);
              finalJid = formatJID(finalPhone);
            }
          }

          const adjustedEc = {
            ...ec,
            id: finalJid,
            phone: finalPhone
          };

          const localMatch = mergedMap.get(key);
          if (localMatch) {
            const hasGenericName = ec.name.startsWith('Cliente WA') || ec.name.includes('@');
            const hasBetterLocalName = localMatch.name && !localMatch.name.startsWith('Cliente WA');
            
            // Garante que pega o maior timestamp entre a API e o histórico local
            const finalTs = Math.max(adjustedEc.timestamp || 0, localMatch.timestamp || 0);

            mergedMap.set(key, {
              ...localMatch,
              ...adjustedEc,
              name: (hasGenericName && hasBetterLocalName) ? localMatch.name : ec.name,
              timestamp: finalTs > 0 ? finalTs : adjustedEc.timestamp
            });
          } else {
            mergedMap.set(key, adjustedEc);
          }
        }
      }

      // Converte para Array, remove LIDs remanescentes e ordena por timestamp
      const mergedList = Array.from(mergedMap.values())
        .filter(c => c.phone && !c.phone.includes(':') && cleanPhone(c.phone).length <= 15)
        .sort((a, b) => b.timestamp - a.timestamp);

      res.json({ success: true, chats: mergedList });
    } catch (dbErr) {
      console.error('[WhatsAppVendas] Erro ao processar chats/mesclagem local:', dbErr);
      res.status(500).json({ error: 'Erro ao obter lista de conversas.' });
    }
  });

  // 2. GET /api/whatsapp-vendas/messages/:chatId — Obtém o histórico de mensagens de um chat
  app.get('/api/whatsapp-vendas/messages/:chatId', async (req, res) => {
    const { chatId } = req.params;
    
    const phoneClean = cleanPhone(chatId.split('@')[0]);
    const phoneCleanNo55 = getPhoneKey(phoneClean);
    
    // Buscar se há um LID ou telefone associado no banco para unificar a busca de histórico
    let customer = null;
    try {
      customer = db.prepare('SELECT phone, whatsapp_lid FROM customers WHERE phone = ? OR whatsapp_lid = ? OR phone LIKE ?').get(phoneClean, phoneClean, `%${phoneCleanNo55}`);
    } catch(e) {}

    // Obter todos os telefones associados a serem consultados no SQLite local
    const phonesToSearch = new Set([phoneClean, phoneCleanNo55]);
    if (customer) {
      if (customer.phone) {
        phonesToSearch.add(cleanPhone(customer.phone));
        phonesToSearch.add(getPhoneKey(customer.phone));
      }
      if (customer.whatsapp_lid) {
        phonesToSearch.add(cleanPhone(customer.whatsapp_lid));
        phonesToSearch.add(getPhoneKey(customer.whatsapp_lid));
      }
    }
    const phoneList = Array.from(phonesToSearch);
    const placeholders = phoneList.map(() => '?').join(',');

    let localMessages = [];
    try {
      localMessages = db.prepare(`
        SELECT id, fromMe, messageText as text, timestamp 
        FROM whatsapp_messages 
        WHERE phone IN (${placeholders}) OR phone LIKE ?
        ORDER BY timestamp ASC LIMIT 80
      `).all(...phoneList, `%${phoneCleanNo55}`);
    } catch (e) {
      console.warn('[WhatsAppVendas] Erro ao buscar mensagens locais no SQLite:', e.message);
    }

    const mappedLocal = localMessages.map(m => {
      let isImage = false;
      let imageUrl = null;
      let text = m.text || '';

      if (text.startsWith('[IMAGEM]:')) {
        isImage = true;
        const parts = text.substring(9).split('|||');
        imageUrl = parts[0];
        text = parts[1] || '';
      }

      return {
        id: m.id,
        fromMe: m.fromMe === 1,
        text,
        isImage,
        imageUrl,
        timestamp: m.timestamp,
        isLocal: true
      };
    });

    try {
      // Determinar quais JIDs buscar na Evolution API
      const jidsToSearch = [chatId];
      if (customer) {
        const realJid = formatJID(customer.phone);
        const lidJid = customer.whatsapp_lid ? `${customer.whatsapp_lid}@s.whatsapp.net` : null;
        
        if (realJid && realJid !== chatId) jidsToSearch.push(realJid);
        if (lidJid && lidJid !== chatId) jidsToSearch.push(lidJid);
      }

      console.log(`[WhatsAppVendas] Buscando mensagens dos chats: ${jidsToSearch.join(', ')}`);
      
      const apiPromises = jidsToSearch.map(async (jid) => {
        try {
          const response = await evolutionFetch(`/chat/findMessages/${EVOLUTION_MAIN_INSTANCE}`, {
            method: 'POST',
            body: JSON.stringify({
              where: { key: { remoteJid: jid } },
              limit: 40
            })
          });
          if (response.ok) {
            const msgsData = await response.json();
            return Array.isArray(msgsData) ? msgsData : (msgsData.records || msgsData.data || []);
          }
        } catch (err) {
          console.warn(`[WhatsAppVendas] Falha ao buscar mensagens da API para ${jid}:`, err.message);
        }
        return [];
      });

      const results = await Promise.all(apiPromises);
      const records = results.flat();
      
      // Ordena de forma cronológica crescente
      const sorted = [...records].sort((a, b) => {
        const tsA = a.messageTimestamp || 0;
        const tsB = b.messageTimestamp || 0;
        return tsA - tsB;
      });

      const targetPhoneKeys = phoneList.map(p => getPhoneKey(p));

      // Filtrar registros da API para garantir que pertencem apenas a este cliente unificado
      const filteredRecords = sorted.filter(m => {
        const remoteJid = m.key?.remoteJid || '';
        if (!remoteJid) return false;
        const msgPhoneKey = getPhoneKey(remoteJid.split('@')[0]);
        return targetPhoneKeys.includes(msgPhoneKey);
      });

      const mappedAPI = filteredRecords.map(m => {
        const key = m.key || {};
        const fromMe = !!key.fromMe;
        const msg = m.message || {};
        
        let text = msg.conversation || msg.extendedTextMessage?.text || msg.imageMessage?.caption || '';
        let imageUrl = null;
        let isImage = false;

        if (msg.imageMessage) {
          isImage = true;
          text = text || '[Imagem]';
          
          if (text && text !== '[Imagem]') {
            try {
              const cleanText = text.replace(/\*/g, '').trim();
              const words = cleanText.split(' ').slice(0, 2).join('%');
              if (words.length >= 4) {
                const nameMatch = db.prepare('SELECT image_url FROM scraped_images WHERE name LIKE ? LIMIT 1').get(`%${words}%`);
                if (nameMatch) {
                  imageUrl = nameMatch.image_url;
                }
              }
            } catch (e) {}
          }
        }

        return {
          id: m.key?.id || String(Math.random()),
          fromMe,
          text,
          isImage,
          imageUrl,
          timestamp: m.messageTimestamp ? m.messageTimestamp * 1000 : Date.now(),
          isLocal: false
        };
      }).filter(m => m.text || m.isImage);

      // Mesclar mensagens locais e da API, evitando duplicatas de IDs
      const uniqueMappedAPI = [];
      const seenApiIds = new Set();
      for (const m of mappedAPI) {
        if (!seenApiIds.has(m.id)) {
          seenApiIds.add(m.id);
          uniqueMappedAPI.push(m);
        }
      }

      const merged = [...uniqueMappedAPI];

      for (const loc of mappedLocal) {
        if (seenApiIds.has(loc.id)) {
          continue; // Pula se o ID da mensagem já veio da API
        }
        
        if (loc.isImage) {
          // Se for imagem local, verifica se existe imagem correspondente da API (timestamp próximo com tolerância de 90s)
          const apiMatch = uniqueMappedAPI.find(apiMsg => 
            apiMsg.isImage && Math.abs(apiMsg.timestamp - loc.timestamp) < 90000
          );
          if (apiMatch) {
            // Se encontrou na API mas veio sem legenda/texto ou com texto padrão, mesclamos a legenda e URL local
            if (!apiMatch.text || apiMatch.text === '[Imagem]') {
              apiMatch.text = loc.text;
            }
            if (!apiMatch.imageUrl && loc.imageUrl) {
              apiMatch.imageUrl = loc.imageUrl;
            }
          } else {
            // Se não está na API, mantemos a local
            merged.push(loc);
          }
        } else {
          // Se for texto local, adiciona se não houver texto semelhante na API (45s de tolerância)
          const alreadyInAPI = uniqueMappedAPI.some(apiMsg => 
            !apiMsg.isImage && apiMsg.text === loc.text && Math.abs(apiMsg.timestamp - loc.timestamp) < 45000
          );
          if (!alreadyInAPI) {
            merged.push(loc);
          }
        }
      }

      // Ordena de forma cronológica crescente
      const finalMessages = merged.sort((a, b) => a.timestamp - b.timestamp);

      res.json({ success: true, messages: finalMessages });
    } catch (err) {
      console.warn(`[WhatsAppVendas] Erro ao buscar mensagens da API. Usando apenas fallback local:`, err.message);
      // Se a API falhou, devolvemos a lista local
      const sortedLocal = mappedLocal.sort((a, b) => a.timestamp - b.timestamp);
      res.json({ success: true, messages: sortedLocal, offline: true });
    }
  });

  // Definição das palavras-chave para grupos automáticos
  const AUTOMATIC_GROUPS = {
    'Absorvente': ['ABSORV', 'ALWAYS', 'INTIMUS', 'SEMPRE LIVRE', 'SYMP', 'KOTEX'],
    'Tintura de Cabelo': ['TINTURA', 'COLORAC', 'IMEDIA', 'MAJIREL', 'KOLESTON', 'COR & TON', 'BIOCOLOR', 'TINT.'],
    'Suplemento / Vitamina': ['SUPLEMENTO', 'VITAMINA', 'CENTRUM', 'LAVITAN', 'NUTREN', 'VIT.', 'SUPLERA', 'POLIVIT', 'VITA '],
    'Produto de Beleza': ['SHAMPOO', 'CONDICIONADOR', 'CREME FACIAL', 'HIDRATANTE', 'MAQUIAGEM', 'CERAVE', 'NIVEA', 'PROTETOR SOLAR', 'BLOQUEADOR', 'LOREAL', 'SABONETE LIQ']
  };

  // 3. GET /api/whatsapp-vendas/search-products — Pesquisa no Digifarma (Firebird) e anexa fotos do SQLite
  app.get('/api/whatsapp-vendas/search-products', async (req, res) => {
    const { q, grupo, hideOutOfStock } = req.query;
    
    if ((!q || q.length < 2) && !grupo) {
      return res.json({ success: true, products: [] });
    }

    try {
      const filterOutOfStock = hideOutOfStock === 'true';
      let digiProducts = [];

      if (grupo) {
        console.log(`[WhatsAppVendas] Buscando produtos por grupo: ${grupo} (ocultar sem estoque: ${filterOutOfStock})`);
        
        // 1. Obter overrides manuais deste grupo do SQLite
        const sqliteOverrides = db.prepare('SELECT codigo_barras FROM custom_product_groups WHERE grupo_customizado = ?').all(grupo);
        const overrideBarcodes = sqliteOverrides.map(o => o.codigo_barras).filter(Boolean);

        // 2. Construir cláusulas LIKE para o grupo automático se ele existir
        const keywords = AUTOMATIC_GROUPS[grupo] || [];
        let queryKeywordsSql = '';
        const params = [];

        if (keywords.length > 0) {
          const conditions = keywords.map(kw => {
            params.push(`%${kw.toUpperCase()}%`);
            return 'PRODUTO LIKE ?';
          }).join(' OR ');
          queryKeywordsSql = `AND (${conditions})`;
        } else if (overrideBarcodes.length === 0) {
          // Se o grupo não tem regras automáticas e não tem overrides, retorna vazio
          return res.json({ success: true, products: [] });
        }

        // Se houver overrides manuais para este grupo, nós os consultamos explicitamente também no Firebird
        let queryOverrideSql = '';
        if (overrideBarcodes.length > 0) {
          const sliceBarcodes = overrideBarcodes.slice(0, 500);
          const inPlaceholders = sliceBarcodes.map(() => '?').join(',');
          queryOverrideSql = `OR COD_BARRAS IN (${inPlaceholders})`;
          params.push(...sliceBarcodes);
        }

        // Se não há keywords automáticas, a query só vai buscar pelos overrides
        const finalWhereClause = keywords.length > 0
          ? `(PROD_ATIVO = 'S' ${queryKeywordsSql}) ${queryOverrideSql ? `OR (PROD_ATIVO = 'S' AND (${queryOverrideSql.substring(3)}))` : ''}`
          : `PROD_ATIVO = 'S' AND (${queryOverrideSql.substring(3)})`;

        // Executar query no Firebird (retornando até 150 itens por grupo)
        const query = `
          SELECT FIRST 150 
            PRODUTO_ID as ID, 
            PRODUTO as NAME, 
            COD_BARRAS as BARCODE, 
            CASE 
              WHEN PROD_PRPROMOCAO > 0 
                   AND (INICIO_PROMOCAO IS NULL OR INICIO_PROMOCAO <= CURRENT_DATE) 
                   AND (TERMINO_PROMOCAO IS NULL OR TERMINO_PROMOCAO >= CURRENT_DATE)
              THEN PROD_PRPROMOCAO
              ELSE PROD_PRVENDA
            END as PRICE, 
            PROD_SALDO as STOCK 
          FROM PRODUTOS 
          WHERE (${finalWhereClause})
            ${filterOutOfStock ? 'AND PROD_SALDO > 0' : ''}
          ORDER BY CASE WHEN PROD_SALDO > 0 THEN 0 ELSE 1 END, PRODUTO
        `;

        digiProducts = await queryDigifarma(query, params);

      } else {
        console.log(`[WhatsAppVendas] Buscando produtos no Digifarma por termo: ${q} (ocultar sem estoque: ${filterOutOfStock})`);
        
        // Query tradicional por nome ou código de barras
        const query = `
          SELECT FIRST 45 
            PRODUTO_ID as ID, 
            PRODUTO as NAME, 
            COD_BARRAS as BARCODE, 
            CASE 
              WHEN PROD_PRPROMOCAO > 0 
                   AND (INICIO_PROMOCAO IS NULL OR INICIO_PROMOCAO <= CURRENT_DATE) 
                   AND (TERMINO_PROMOCAO IS NULL OR TERMINO_PROMOCAO >= CURRENT_DATE)
              THEN PROD_PRPROMOCAO
              ELSE PROD_PRVENDA
            END as PRICE, 
            PROD_SALDO as STOCK 
          FROM PRODUTOS 
          WHERE PROD_ATIVO = 'S' 
                AND (PRODUTO LIKE ? OR COD_BARRAS = ?)
                ${filterOutOfStock ? 'AND PROD_SALDO > 0' : ''}
          ORDER BY CASE WHEN PROD_SALDO > 0 THEN 0 ELSE 1 END, PRODUTO
        `;
        
        const term = `%${q.toUpperCase()}%`;
        digiProducts = await queryDigifarma(query, [term, q]);
      }

      if (!Array.isArray(digiProducts)) {
        return res.json({ success: true, products: [] });
      }

      // 3. Buscar TODAS as associações manuais de grupos do SQLite para cruzar e excluir
      const allOverrides = db.prepare('SELECT codigo_barras, grupo_customizado FROM custom_product_groups').all();
      const overridesMap = new Map(allOverrides.map(o => [o.codigo_barras, o.grupo_customizado]));

      // Preparar statements de fotos do SQLite
      const sqlitePhotoStmt = db.prepare(`
        SELECT image_url, category, brand 
        FROM scraped_images 
        WHERE ean = ?
      `);

      const sqliteNameStmt = db.prepare(`
        SELECT image_url, category, brand 
        FROM scraped_images 
        WHERE name LIKE ? 
        LIMIT 1
      `);

      // Enriquecer e filtrar produtos
      const enrichedProducts = [];

      for (const p of digiProducts) {
        const barcode = (p.BARCODE || '').trim();
        
        // Se a busca for por um grupo específico, precisamos garantir que o produto não tem override para OUTRO grupo
        if (grupo) {
          const manualGroup = overridesMap.get(barcode);
          if (manualGroup && manualGroup !== grupo) {
            // Tem override para outro grupo (ou para 'Nenhum'), descarta da listagem desse grupo
            continue;
          }
        }

        let imageUrl = null;
        let category = null;
        let brand = null;

        // Tentar EAN match
        if (barcode) {
          const photoMatch = sqlitePhotoStmt.get(barcode);
          if (photoMatch) {
            imageUrl = photoMatch.image_url;
            category = photoMatch.category;
            brand = photoMatch.brand;
          }
        }

        // Tentar Name match
        if (!imageUrl && p.NAME) {
          const words = p.NAME.split(' ').slice(0, 2).join('%');
          if (words.length >= 4) {
            const nameMatch = sqliteNameStmt.get(`%${words}%`);
            if (nameMatch) {
              imageUrl = nameMatch.image_url;
              category = nameMatch.category;
              brand = nameMatch.brand;
            }
          }
        }

        // Encontrar o grupo do produto (manual override ou dinâmico)
        let finalProductGroup = overridesMap.get(barcode) || 'Nenhum';
        if (finalProductGroup === 'Nenhum') {
          // Classificação automática baseada no nome
          const nameUpper = (p.NAME || '').toUpperCase();
          for (const [groupName, kws] of Object.entries(AUTOMATIC_GROUPS)) {
            if (kws.some(kw => nameUpper.includes(kw.toUpperCase()))) {
              finalProductGroup = groupName;
              break;
            }
          }
        }

        enrichedProducts.push({
          id: p.ID,
          name: p.NAME,
          barcode,
          price: p.PRICE || 0,
          stock: p.STOCK || 0,
          imageUrl,
          category,
          brand,
          customGroup: finalProductGroup // Passa o grupo atribuído para o frontend
        });
      }

      res.json({ success: true, products: enrichedProducts });
    } catch (err) {
      console.error('[WhatsAppVendas] Erro ao pesquisar produtos:', err.message);
      res.status(500).json({ error: 'Erro ao conectar ao banco de dados do Digifarma.' });
    }
  });

  // 3b. POST /api/whatsapp-vendas/products/group — Define associação manual do grupo
  app.post('/api/whatsapp-vendas/products/group', (req, res) => {
    const { codigo_barras, grupo_customizado } = req.body;
    if (!codigo_barras) {
      return res.status(400).json({ error: 'codigo_barras é obrigatório.' });
    }

    try {
      const grupoTrim = (grupo_customizado || '').trim();
      if (!grupoTrim || grupoTrim === 'Nenhum') {
        db.prepare('DELETE FROM custom_product_groups WHERE codigo_barras = ?').run(codigo_barras);
        return res.json({ success: true, deleted: true });
      } else {
        db.prepare(`
          INSERT INTO custom_product_groups (codigo_barras, grupo_customizado, manual_override)
          VALUES (?, ?, 1)
          ON CONFLICT(codigo_barras) DO UPDATE SET grupo_customizado = EXCLUDED.grupo_customizado, manual_override = 1
        `).run(codigo_barras, grupoTrim);
        return res.json({ success: true, saved: true });
      }
    } catch (err) {
      console.error('[WhatsAppVendas] Erro ao associar grupo customizado:', err.message);
      res.status(500).json({ error: 'Erro ao salvar no banco local SQLite.' });
    }
  });

  // 4. POST /api/whatsapp-vendas/send-message — Envia mensagem de texto simples
  app.post('/api/whatsapp-vendas/send-message', async (req, res) => {
    const { phone, text } = req.body;
    
    if (!phone || !text) {
      return res.status(400).json({ error: 'Telefone e mensagem são obrigatórios.' });
    }

    // Rejeitar Linked Device IDs reais (com ":") ou IDs muito longos (mais de 15 dígitos)
    const cleanedPhone = cleanPhone(phone);
    if (phone.includes(':') || cleanedPhone.length > 13) {
      return res.status(400).json({ 
        error: `O identificador "${phone}" parece ser um Linked Device ID temporário (LID) e não um número de WhatsApp válido. Corrija o número na ficha do cliente para o número real (ex: 5532988634755).` 
      });
    }

    try {
      const jid = formatJID(phone);
      console.log(`[WhatsAppVendas] Enviando texto para ${jid}: ${text.substring(0, 50)}...`);
      
      const payload = {
        number: jid.split('@')[0],
        options: { delay: 500, linkPreview: false },
        textMessage: {
          text: text
        }
      };

      let sentSuccess = false;
      let msgId = null;

      // 1. Tentar primeiro pelo Baileys local se estiver conectado (excelente para desenvolvimento local/testes)
      const bStatus = baileys ? baileys.getStatus() : null;
      const bSecondaryStatus = baileysSecondary ? baileysSecondary.getStatus() : null;

      if (bStatus && bStatus.connected) {
        try {
          console.log(`[WhatsAppVendas] Enviando via Baileys local principal para ${phone}...`);
          const result = await baileys.sendText(phone, text);
          if (result && result.success) {
            sentSuccess = true;
            msgId = genId('msg');
          }
        } catch (baileysErr) {
          console.warn('[WhatsAppVendas] Falha ao enviar via Baileys local principal, tentando alternativas:', baileysErr.message);
        }
      }

      // 1.5 Tentar pelo Baileys Secundário local se estiver conectado e o principal falhou/desconectado
      if (!sentSuccess && bSecondaryStatus && bSecondaryStatus.connected) {
        try {
          console.log(`[WhatsAppVendas] Enviando via Baileys local secundário para ${phone}...`);
          const result = await baileysSecondary.sendTextToGroup(phone, text);
          if (result && result.success) {
            sentSuccess = true;
            msgId = genId('msg');
          }
        } catch (secErr) {
          console.warn('[WhatsAppVendas] Falha ao enviar via Baileys local secundário, tentando alternativas:', secErr.message);
        }
      }

      // 2. Fallback / Envio padrão via Evolution API (se o Baileys local não estiver conectado ou falhar)
      if (!sentSuccess) {
        const response = await evolutionFetch(`/message/sendText/${EVOLUTION_MAIN_INSTANCE}`, {
          method: 'POST',
          body: JSON.stringify(payload)
        });

        if (!response.ok) {
          const errText = await response.text();
          let errorMsg = `Evolution API erro ${response.status}`;
          try {
            const parsed = JSON.parse(errText);
            const msgObj = parsed.response?.message?.[0] || parsed.response?.message || parsed.message;
            if (msgObj && msgObj.exists === false) {
              errorMsg = `O número ${msgObj.number || phone} não está cadastrado no WhatsApp.`;
            } else if (typeof msgObj === 'string') {
              errorMsg = msgObj;
            } else if (Array.isArray(msgObj)) {
              errorMsg = msgObj.join(', ');
            }
          } catch (e) {
            errorMsg = `${errorMsg}: ${errText}`;
          }
          return res.status(400).json({ error: errorMsg });
        }
        
        sentSuccess = true;
        msgId = genId('msg');
      }

      // Salva a mensagem enviada localmente no SQLite
      try {
        const phoneClean = cleanPhone(phone);
        db.prepare(`
          INSERT INTO whatsapp_messages (id, phone, fromMe, messageText, timestamp)
          VALUES (?, ?, 1, ?, ?)
        `).run(msgId, phoneClean, text, Date.now());
      } catch (dbErr) {
        console.warn('[WhatsAppVendas] Falha ao salvar mensagem enviada no SQLite:', dbErr.message);
      }

      res.json({ success: true });
    } catch (err) {
      console.error('[WhatsAppVendas] Erro ao enviar mensagem de texto:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // 5. POST /api/whatsapp-vendas/send-product — Envia foto do produto + detalhes descritivos e salva no CRM
  app.post('/api/whatsapp-vendas/send-product', async (req, res) => {
    const { phone, productId, productName, price, stock, imageUrl, status, skipWhatsApp } = req.body;
    
    if (!phone || !productName) {
      return res.status(400).json({ error: 'Parâmetros "phone" e "productName" são obrigatórios.' });
    }

    const cleanPhoneNum = cleanPhone(phone);

    // Rejeitar LIDs temporários
    if (phone.includes(':') || cleanPhoneNum.length > 13) {
      return res.status(400).json({ 
        error: `O identificador "${phone}" é um LID temporário. Corrija o número na ficha do cliente para o número real (ex: 5532988634755).` 
      });
    }

    const jid = formatJID(phone);
    const phoneNoSuffix = jid.split('@')[0];
    const itemStatus = status || 'pesquisado';

    try {
      const priceFormatted = parseFloat(price).toFixed(2).replace('.', ',');
      const textMsg = `*${productName}*\n💵 Preço: *R$ ${priceFormatted}*`;

      let sentMediaSuccess = false;

      // Se skipWhatsApp estiver ativado (caso de execução no wrapper do Electron)
      if (skipWhatsApp) {
        sentMediaSuccess = !!imageUrl;
        console.log(`[WhatsAppVendas] Gravando produto no CRM (envio real feito localmente via Electron): ${productName}`);
      }

      // 1. Enviar Foto do Produto com legenda completa (se houver correspondência no site e a URL for válida)
      if (imageUrl && !skipWhatsApp) {
        console.log(`[WhatsAppVendas] Enviando imagem do produto para ${jid}: ${imageUrl}`);
        
        // Converter URL relativa em absoluta
        let mediaUrl = imageUrl;
        if (imageUrl && !imageUrl.startsWith('http')) {
          let host = req.get('host') || '192.168.1.11:3001';
          if (host.includes('localhost') || host.includes('127.0.0.1')) {
            host = '192.168.1.11:3001'; // IP local da máquina Windows na rede
          }
          mediaUrl = `http://${host}/${imageUrl}`;
          console.log(`[WhatsAppVendas] Convertido imageUrl relativo para absoluto: ${mediaUrl}`);
        }

        const payloadImage = {
          number: phoneNoSuffix,
          mediaMessage: {
            mediatype: 'image',
            mimetype: 'image/jpeg',
            caption: textMsg, // Coloca a legenda completa na imagem
            media: mediaUrl,
            fileName: `${productName.replace(/[^a-zA-Z0-9]/g, '_')}.jpg`
          }
        };

        const responseImage = await evolutionFetch(`/message/sendMedia/${EVOLUTION_MAIN_INSTANCE}`, {
          method: 'POST',
          body: JSON.stringify(payloadImage)
        });

        if (responseImage.ok) {
          sentMediaSuccess = true;
          console.log('[WhatsAppVendas] Imagem do produto enviada com legenda completa pela instância principal.');
        } else {
          const errText = await responseImage.text();
          console.warn(`[WhatsAppVendas] Falha ao enviar imagem do produto (${responseImage.status}). Prosseguindo com fallback de texto:`, errText);
        }
      }

      // 2. Se não havia imagem ou se o envio da imagem falhou, enviamos o texto descritivo isolado (fallback resiliente)
      if (!sentMediaSuccess && !skipWhatsApp) {
        console.log(`[WhatsAppVendas] Enviando texto informativo isolado do produto para ${jid}`);
        const payloadText = {
          number: phoneNoSuffix,
          options: { delay: 500, linkPreview: false },
          textMessage: {
            text: textMsg
          }
        };

        const responseText = await evolutionFetch(`/message/sendText/${EVOLUTION_MAIN_INSTANCE}`, {
          method: 'POST',
          body: JSON.stringify(payloadText)
        });

        if (!responseText.ok) {
          const errText = await responseText.text();
          console.error(`[WhatsAppVendas] Falha na Evolution API ao enviar texto do produto (${responseText.status}):`, errText);
          let errorMsg = 'Falha ao enviar detalhes do produto';
          try {
            const parsed = JSON.parse(errText);
            const msgObj = parsed.response?.message?.[0] || parsed.response?.message || parsed.message;
            if (msgObj && msgObj.exists === false) {
              errorMsg = `O número ${msgObj.number || phone} não está cadastrado no WhatsApp.`;
            } else if (typeof msgObj === 'string') {
              errorMsg = msgObj;
            }
          } catch (e) {
            errorMsg = `${errorMsg}: ${errText}`;
          }
          return res.status(400).json({ error: errorMsg });
        }
      }

      // 3. Salvar no Banco de Dados Local (SQLite)
      // A. Garantir que o cliente existe na tabela customers
      let customer = db.prepare('SELECT id FROM customers WHERE phone = ? OR phone LIKE ?').get(cleanPhoneNum, `%${cleanPhoneNum.slice(-8)}%`);
      let customerId = customer?.id || null;
      const now = new Date().toISOString();

      if (!customer) {
        customerId = genId('cust');
        const defaultName = `Cliente WA ${cleanPhoneNum.slice(-4)}`;
        db.prepare(`
          INSERT INTO customers (id, name, phone, whatsapp_name, source, createdAt, updatedAt)
          VALUES (?, ?, ?, ?, 'WhatsApp', ?, ?)
        `).run(customerId, defaultName, cleanPhoneNum, defaultName, now, now);
        console.log(`[WhatsAppVendas] Novo cliente gerado automaticamente no envio de produto: ${cleanPhoneNum}`);
      } else {
        customerId = customer.id;
      }

      // B. Gravar a interação na tabela whatsapp_product_history
      db.prepare(`
        INSERT INTO whatsapp_product_history (id, phone, customer_id, product_name, status, interaction_date, source, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 'WhatsApp Vendas', ?)
      `).run(
        genId('wph'),
        cleanPhoneNum,
        customerId,
        productName,
        itemStatus,
        now,
        now
      );

      // C. Salvar imagem e texto da mensagem localmente
      try {
        const timeNow = Date.now();
        if (sentMediaSuccess && imageUrl) {
          // Se enviou com sucesso a foto com legenda, salvamos um único registro local unificando imagem e legenda
          db.prepare(`
            INSERT INTO whatsapp_messages (id, phone, fromMe, messageText, timestamp)
            VALUES (?, ?, 1, ?, ?)
          `).run(genId('msg'), cleanPhoneNum, `[IMAGEM]:${imageUrl}|||${textMsg}`, timeNow);
        } else {
          // Se falhou ou não tinha imagem, salvamos apenas a mensagem de texto
          db.prepare(`
            INSERT INTO whatsapp_messages (id, phone, fromMe, messageText, timestamp)
            VALUES (?, ?, 1, ?, ?)
          `).run(genId('msg'), cleanPhoneNum, textMsg, timeNow);
        }
      } catch (dbErr) {
        console.warn('[WhatsAppVendas] Falha ao salvar mensagens do produto localmente:', dbErr.message);
      }

      res.json({ success: true, customerId });
    } catch (err) {
      console.error('[WhatsAppVendas] Erro no envio de produto:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // 6. POST /api/whatsapp-vendas/send-cart — Envia orçamento consolidado e grava múltiplos produtos no CRM
  app.post('/api/whatsapp-vendas/send-cart', async (req, res) => {
    const { phone, text, items, skipWhatsApp } = req.body;
    
    if (!phone || !text || !Array.isArray(items)) {
      return res.status(400).json({ error: 'Parâmetros "phone", "text" e "items" são obrigatórios.' });
    }

    const cleanPhoneNum = cleanPhone(phone);

    // Rejeitar LIDs temporários
    if (phone.includes(':') || cleanPhoneNum.length > 13) {
      return res.status(400).json({ 
        error: `O identificador "${phone}" é um LID temporário. Corrija o número na ficha do cliente para o número real (ex: 5532988634755).` 
      });
    }

    const jid = formatJID(phone);
    const phoneNoSuffix = jid.split('@')[0];

    try {
      console.log(`[WhatsAppVendas] Enviando orçamento do carrinho para ${jid} (${items.length} itens)...`);
      
      if (!skipWhatsApp) {
        // 1. Enviar texto consolidado
        const payloadText = {
        number: phoneNoSuffix,
        options: { delay: 500, linkPreview: false },
        textMessage: {
          text: text
        }
      };

      const responseText = await evolutionFetch(`/message/sendText/${EVOLUTION_MAIN_INSTANCE}`, {
        method: 'POST',
        body: JSON.stringify(payloadText)
      });

      if (!responseText.ok) {
        const errText = await responseText.text();
        console.error(`[WhatsAppVendas] Falha na Evolution API ao enviar carrinho (${responseText.status}):`, errText);
        let errorMsg = 'Falha ao enviar orçamento';
        try {
          const parsed = JSON.parse(errText);
          const msgObj = parsed.response?.message?.[0] || parsed.response?.message || parsed.message;
          if (msgObj && msgObj.exists === false) {
            errorMsg = `O número ${msgObj.number || phone} não está cadastrado no WhatsApp.`;
          } else if (typeof msgObj === 'string') {
            errorMsg = msgObj;
          }
        } catch (e) {
          errorMsg = `${errorMsg}: ${errText}`;
        }
        return res.status(400).json({ error: errorMsg });
      }
      } // Fim do if (!skipWhatsApp)

      // 2. Garantir que o cliente existe na tabela customers
      let customer = db.prepare('SELECT id FROM customers WHERE phone = ? OR phone LIKE ?').get(cleanPhoneNum, `%${cleanPhoneNum.slice(-8)}%`);
      let customerId = customer?.id || null;
      const now = new Date().toISOString();

      if (!customer) {
        customerId = genId('cust');
        const defaultName = `Cliente WA ${cleanPhoneNum.slice(-4)}`;
        db.prepare(`
          INSERT INTO customers (id, name, phone, whatsapp_name, source, createdAt, updatedAt)
          VALUES (?, ?, ?, ?, 'WhatsApp', ?, ?)
        `).run(customerId, defaultName, cleanPhoneNum, defaultName, now, now);
        console.log(`[WhatsAppVendas] Novo cliente gerado automaticamente no envio de carrinho: ${cleanPhoneNum}`);
      } else {
        customerId = customer.id;
      }

      // 3. Gravar cada produto no histórico whatsapp_product_history
      const insertHistory = db.prepare(`
        INSERT INTO whatsapp_product_history (id, phone, customer_id, product_name, status, interaction_date, source, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 'WhatsApp Vendas', ?)
      `);

      for (const item of items) {
        const itemStatus = item.status || 'pesquisado';
        insertHistory.run(
          genId('wph'),
          cleanPhoneNum,
          customerId,
          item.productName,
          itemStatus,
          now,
          now
        );
      }

      // 4. Salvar mensagem consolidada localmente no SQLite
      try {
        db.prepare(`
          INSERT INTO whatsapp_messages (id, phone, fromMe, messageText, timestamp)
          VALUES (?, ?, 1, ?, ?)
        `).run(genId('msg'), cleanPhoneNum, text, Date.now());
      } catch (dbErr) {
        console.warn('[WhatsAppVendas] Falha ao salvar mensagem de carrinho localmente:', dbErr.message);
      }

      res.json({ success: true, customerId });
    } catch (err) {
      console.error('[WhatsAppVendas] Erro no processamento do carrinho:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // 7. GET /api/whatsapp-vendas/customers/:phone — Obtém dados cadastrais do cliente e seu histórico de compras
  app.get('/api/whatsapp-vendas/customers/:phone', (req, res) => {
    const { phone } = req.params;
    const cleanPhoneNum = cleanPhone(phone);

    try {
      // 1. Buscar dados do cliente no SQLite (usando phone ou whatsapp_lid)
      let customer = db.prepare('SELECT * FROM customers WHERE phone = ? OR whatsapp_lid = ? OR phone LIKE ?').get(cleanPhoneNum, cleanPhoneNum, `%${cleanPhoneNum.slice(-8)}%`);

      if (!customer) {
        return res.json({
          success: true,
          exists: false,
          customer: {
            phone: cleanPhoneNum,
            name: `Cliente WA ${cleanPhoneNum.slice(-4)}`,
            nickname: '',
            cpf: '',
            email: '',
            address: '',
            notes: ''
          },
          history: []
        });
      }

      // 2. Buscar histórico de interações (vendas/pesquisas)
      const history = db.prepare(`
        SELECT product_name as productName, status, interaction_date as date
        FROM whatsapp_product_history
        WHERE customer_id = ? OR phone = ? OR phone = ?
        ORDER BY date DESC
      `).all(customer.id, customer.phone, customer.whatsapp_lid);

      res.json({
        success: true,
        exists: true,
        customer,
        history
      });
    } catch (err) {
      console.error('[WhatsAppVendas] Erro ao obter dados do cliente:', err.message);
      res.status(500).json({ error: 'Erro interno ao obter dados do cliente.' });
    }
  });

  // 7. POST /api/whatsapp-vendas/customers/:phone — Salva ou atualiza os dados cadastrais do cliente (endereço, notas, etc.)
  app.post('/api/whatsapp-vendas/customers/:phone', (req, res) => {
    const { phone } = req.params;
    const { name, nickname, cpf, email, address, notes, phone: bodyPhone } = req.body;
    const cleanPhoneNum = cleanPhone(phone);
    const now = new Date().toISOString();

    try {
      let customer = db.prepare('SELECT id, phone, whatsapp_lid FROM customers WHERE phone = ? OR whatsapp_lid = ? OR phone LIKE ?').get(cleanPhoneNum, cleanPhoneNum, `%${cleanPhoneNum.slice(-8)}%`);

      // Se não encontrou pelo LID da rota, mas o bodyPhone foi passado, tentar procurar pelo bodyPhone
      if (!customer && bodyPhone) {
        const cleanBodyPhone = cleanPhone(bodyPhone);
        customer = db.prepare('SELECT id, phone, whatsapp_lid FROM customers WHERE phone = ? OR whatsapp_lid = ?').get(cleanBodyPhone, cleanBodyPhone);
      }

      // Se o active chat phone for um LID (mais de 13 dígitos), definimos como whatsapp_lid
      let finalLid = null;
      if (cleanPhoneNum.length > 13) {
        finalLid = cleanPhoneNum;
      }

      const finalPhone = bodyPhone ? cleanPhone(bodyPhone) : cleanPhoneNum;

      if (customer) {
        // Atualiza cliente existente
        db.prepare(`
          UPDATE customers
          SET name = ?, nickname = ?, cpf = ?, phone = ?, whatsapp_lid = ?, email = ?, address = ?, notes = ?, updatedAt = ?
          WHERE id = ?
        `).run(name, nickname, cpf, finalPhone, finalLid || customer.whatsapp_lid, email, address, notes, now, customer.id);
        
        res.json({ success: true, message: 'Cliente atualizado com sucesso.', customerId: customer.id });
      } else {
        // Cria novo cliente
        const customerId = genId('cust');
        db.prepare(`
          INSERT INTO customers (id, name, nickname, cpf, phone, whatsapp_lid, email, address, notes, source, createdAt, updatedAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'WhatsApp', ?, ?)
        `).run(customerId, name || `Cliente WA ${cleanPhoneNum.slice(-4)}`, nickname, cpf, finalPhone, finalLid, email, address, notes, now, now);

        res.json({ success: true, message: 'Cliente cadastrado com sucesso.', customerId });
      }
    } catch (err) {
      console.error('[WhatsAppVendas] Erro ao salvar dados do cliente:', err.message);
      res.status(500).json({ error: 'Erro interno ao salvar dados do cliente.' });
    }
  });

  // 8. GET /api/whatsapp-vendas/search-customers — Busca clientes no CRM
  app.get('/api/whatsapp-vendas/search-customers', (req, res) => {
    const { query } = req.query;
    if (!query || query.trim().length < 2) {
      return res.json({ success: true, customers: [] });
    }

    try {
      const sqlQuery = `%${query}%`;
      const matches = db.prepare(`
        SELECT id, name, nickname, phone, whatsapp_lid, cpf, email, address, notes
        FROM customers
        WHERE name LIKE ? OR nickname LIKE ? OR phone LIKE ? OR cpf LIKE ?
        LIMIT 20
      `).all(sqlQuery, sqlQuery, sqlQuery, sqlQuery);
      
      res.json({ success: true, customers: matches });
    } catch (err) {
      console.error('[WhatsAppVendas] Erro ao buscar clientes no CRM:', err.message);
      res.status(500).json({ error: 'Erro interno ao buscar clientes.' });
    }
  });

  // 9. GET /api/whatsapp-vendas/proxy-image — Proxy para evitar erros de CORS ao copiar imagens
  app.get('/api/whatsapp-vendas/proxy-image', async (req, res) => {
    const { url } = req.query;
    if (!url) {
      return res.status(400).send('URL da imagem é obrigatória.');
    }

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Erro ao buscar imagem externa: ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type');
      if (contentType) {
        res.setHeader('Content-Type', contentType);
      }
      
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'public, max-age=86400');

      const buffer = await response.buffer();
      res.send(buffer);
    } catch (err) {
      console.error('[WhatsAppVendas] Erro no proxy de imagem:', err.message);
      res.status(500).send('Erro ao obter imagem através do proxy.');
    }
  });
}

module.exports = {
  initializeWhatsAppVendasEndpoints
};
