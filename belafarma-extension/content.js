// content.js
console.log('[BelaFarma-Extension] Content script carregado no WhatsApp Web.');

let lastCheckedContactName = '';
let contactCache = {}; // Nome -> Telefone para evitar reabrir os detalhes toda hora

// Envia o telefone detectado para a extensão (background.js)
function sendActiveChat(phone) {
  console.log(`[BelaFarma-Extension] 📞 Chat ativo detectado: ${phone}`);
  chrome.runtime.sendMessage({
    source: 'whatsapp-web',
    type: 'active-chat-changed',
    phone: phone
  });
}

// Abre o painel lateral de detalhes do contato no WhatsApp Web e lê o número do telefone
async function getPhoneFromContactDetails(contactName) {
  console.log(`[BelaFarma-Extension] 🔍 Buscando número de telefone real para: ${contactName}`);
  
  const headerEl = document.querySelector('header');
  if (!headerEl) return;

  const titleContainer = headerEl.querySelector('div[role="button"]') || headerEl.querySelector('span[dir="auto"]');
  if (!titleContainer) {
    console.warn('[BelaFarma-Extension] Alvo de clique no cabeçalho não encontrado.');
    return;
  }

  titleContainer.click();

  let phoneFound = null;
  let attempts = 0;
  const maxAttempts = 15;

  while (attempts < maxAttempts && !phoneFound) {
    await new Promise(r => setTimeout(r, 100));
    attempts++;

    const drawers = Array.from(document.querySelectorAll('div[role="region"], div[data-testid="contact-info-drawer"]'));
    if (drawers.length === 0) continue;

    for (const drawer of drawers) {
      const textNodes = [];
      const walker = document.createTreeWalker(drawer, NodeFilter.SHOW_TEXT, null, false);
      let node;
      while (node = walker.nextNode()) {
        textNodes.push(node.textContent);
      }

      for (const text of textNodes) {
        const clean = text.trim();
        if (clean.startsWith('+') && clean.replace(/\D/g, '').length >= 10) {
          phoneFound = clean.replace(/\D/g, '');
          break;
        }
      }
      if (phoneFound) break;
    }
  }

  const closeBtn = document.querySelector('button[aria-label*="Fechar"], span[data-icon="x"]');
  if (closeBtn) {
    closeBtn.click();
  } else {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  }

  if (phoneFound) {
    console.log(`[BelaFarma-Extension] ✅ Telefone encontrado para ${contactName}: ${phoneFound}`);
    contactCache[contactName] = phoneFound;
    sendActiveChat(phoneFound);
  } else {
    console.warn(`[BelaFarma-Extension] ❌ Não foi possível extrair o telefone para ${contactName}.`);
    const digitsOnly = contactName.replace(/\D/g, '');
    if (digitsOnly.length >= 10 && digitsOnly.length <= 15) {
      contactCache[contactName] = digitsOnly;
      sendActiveChat(digitsOnly);
    }
  }
}

// Loop principal de verificação do chat ativo no WhatsApp Web
setInterval(async () => {
  try {
    const headerEl = document.querySelector('header');
    if (!headerEl) return;

    const titleEl = headerEl.querySelector('span[dir="auto"]');
    if (!titleEl) return;

    const contactName = (titleEl.innerText || titleEl.title || '').trim();
    if (!contactName || contactName === lastCheckedContactName) return;

    lastCheckedContactName = contactName;

    if (contactCache[contactName]) {
      sendActiveChat(contactCache[contactName]);
      return;
    }

    const digitsOnly = contactName.replace(/\D/g, '');
    if (digitsOnly.length >= 10 && digitsOnly.length <= 15 && (digitsOnly.startsWith('55') || digitsOnly.length >= 12)) {
      contactCache[contactName] = digitsOnly;
      sendActiveChat(digitsOnly);
      return;
    }

    await getPhoneFromContactDetails(contactName);
  } catch (err) {
    console.error('[BelaFarma-Extension] Erro no monitor de conversas:', err);
  }
}, 1500);

// Escuta mensagens vindas do CRM repassadas pelo background.js
chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
  if (!request || request.source !== 'belafarma-crm') return;

  const { type, text, imageUrl, imageBase64 } = request;
  console.log('[BelaFarma-Extension] Mensagem recebida do CRM via background:', type, text);

  if (type === 'send-product-media') {
    if (imageBase64) {
      await sendMediaBase64ToWhatsApp(text, imageBase64);
    } else if (imageUrl) {
      await sendMediaToWhatsApp(text, imageUrl);
    } else {
      sendTextToWhatsApp(text);
    }
  }
});

// Envia imagem em Base64 + legenda simulando colar e enter no chat do WhatsApp Web
async function sendMediaBase64ToWhatsApp(text, imageBase64) {
  try {
    const parts = imageBase64.split(',');
    const header = parts[0];
    const base64Data = parts[1] || parts[0];
    const mimeMatch = header.match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
    
    const bstr = atob(base64Data);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    
    const blob = new Blob([u8arr], { type: mime });
    const file = new File([blob], 'produto.jpg', { type: mime });

    const inputEl = document.querySelector('div[contenteditable="true"][data-tab="10"]') || 
                    document.querySelector('footer div[contenteditable="true"]');
    
    if (!inputEl) {
      console.error('[BelaFarma-Extension] Campo de chat não encontrado.');
      return;
    }
    
    inputEl.focus();
    
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    
    const pasteEvent = new ClipboardEvent('paste', {
      clipboardData: dataTransfer,
      bubbles: true,
      cancelable: true
    });
    
    inputEl.dispatchEvent(pasteEvent);
    console.log('[BelaFarma-Extension] Imagem Base64 colada no WhatsApp.');
    
    await new Promise(r => setTimeout(r, 1200));
    
    const captionInput = document.querySelector('div[contenteditable="true"][aria-placeholder*="legenda"]') ||
                         document.querySelector('div[contenteditable="true"][data-tab="10"]') ||
                         document.activeElement;
                         
    if (captionInput) {
      captionInput.focus();
      document.execCommand('insertText', false, text);
      
      await new Promise(r => setTimeout(r, 300));
      
      const sendBtn = document.querySelector('span[data-icon="send"]') || 
                       document.querySelector('div[role="button"][aria-label*="Enviar"]');
      if (sendBtn) {
        sendBtn.click();
      } else {
        captionInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
      }
    }
  } catch (err) {
    console.error('[BelaFarma-Extension] Erro ao enviar imagem base64:', err);
  }
}

// Envia imagem + legenda via URL
async function sendMediaToWhatsApp(text, imageUrl) {
  try {
    let targetUrl = imageUrl;
    if (!imageUrl.startsWith('http')) {
      targetUrl = `${window.location.protocol}//${window.location.host}/${imageUrl}`;
    }
    
    const response = await fetch(targetUrl);
    if (!response.ok) throw new Error(`Falha HTTP ${response.status}`);
    const blob = await response.blob();
    
    const file = new File([blob], 'produto.jpg', { type: 'image/jpeg' });
    
    const inputEl = document.querySelector('div[contenteditable="true"][data-tab="10"]') || 
                    document.querySelector('footer div[contenteditable="true"]');
    
    if (!inputEl) return;
    
    inputEl.focus();
    
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    
    const pasteEvent = new ClipboardEvent('paste', {
      clipboardData: dataTransfer,
      bubbles: true,
      cancelable: true
    });
    
    inputEl.dispatchEvent(pasteEvent);
    
    await new Promise(r => setTimeout(r, 1200));
    
    const captionInput = document.querySelector('div[contenteditable="true"][aria-placeholder*="legenda"]') ||
                         document.querySelector('div[contenteditable="true"][data-tab="10"]') ||
                         document.activeElement;
                         
    if (captionInput) {
      captionInput.focus();
      document.execCommand('insertText', false, text);
      
      await new Promise(r => setTimeout(r, 300));
      const sendBtn = document.querySelector('span[data-icon="send"]') || 
                       document.querySelector('div[role="button"][aria-label*="Enviar"]');
      if (sendBtn) {
        sendBtn.click();
      } else {
        captionInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
      }
    }
  } catch (err) {
    console.error('[BelaFarma-Extension] Erro ao enviar imagem:', err);
  }
}

// Envia mensagem de texto simples
function sendTextToWhatsApp(text) {
  const inputEl = document.querySelector('div[contenteditable="true"][data-tab="10"]') || 
                  document.querySelector('footer div[contenteditable="true"]');
                  
  if (inputEl) {
    inputEl.focus();
    document.execCommand('insertText', false, text);
    
    setTimeout(() => {
      const sendBtn = document.querySelector('span[data-icon="send"]') || 
                       document.querySelector('button[aria-label*="Enviar"]');
      if (sendBtn) {
        sendBtn.click();
      } else {
        inputEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
      }
    }, 150);
  }
}
