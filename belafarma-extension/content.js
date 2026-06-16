// content.js

console.log('[BelaFarma-Extension] Content script carregado no WhatsApp Web.');

let lastCheckedContactName = '';
let contactCache = {}; // Nome -> Telefone para evitar reabrir os detalhes toda hora

// Injeta o painel lateral do CRM na página do WhatsApp Web
function injectBelaFarmaSidebar() {
  if (document.getElementById('belafarma-sidebar')) return;

  console.log('[BelaFarma-Extension] Injetando painel lateral do CRM...');

  // Injeta estilos CSS para reduzir o tamanho do app principal do WhatsApp Web
  const style = document.createElement('style');
  style.textContent = `
    #app {
      width: calc(100% - 450px) !important;
      min-width: unset !important;
    }
  `;
  document.head.appendChild(style);

  // Cria o container da barra lateral
  const sidebar = document.createElement('div');
  sidebar.id = 'belafarma-sidebar';
  sidebar.style.cssText = `
    position: fixed !important;
    right: 0 !important;
    top: 0 !important;
    width: 450px !important;
    height: 100vh !important;
    z-index: 9999 !important;
    border-left: 1px solid rgba(0,0,0,0.08) !important;
    background: #f8fafc !important;
    box-shadow: -2px 0 8px rgba(0,0,0,0.05) !important;
  `;

  // Cria a área de diagnóstico para instruções SSL / Servidor offline
  const diagnostics = document.createElement('div');
  diagnostics.id = 'belafarma-diagnostics';
  diagnostics.style.cssText = 'width: 100%; height: 100%; border: none; display: none;';
  diagnostics.innerHTML = `
    <div style="padding: 24px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #334155; height: 100%; display: flex; flex-direction: column; justify-content: center; box-sizing: border-box;">
      <div style="text-align: center; margin-bottom: 24px;">
        <div style="font-size: 52px; margin-bottom: 12px; filter: drop-shadow(0 4px 6px rgba(0,0,0,0.08));">🛡️</div>
        <h2 style="font-size: 20px; font-weight: 700; color: #1e293b; margin: 0 0 8px 0;">BelaFarma CRM - Painel</h2>
        <p style="font-size: 14px; color: #64748b; margin: 0; line-height: 1.5;">O painel lateral precisa de conexão com o sistema de produção da farmácia.</p>
      </div>
      
      <div style="background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.02); margin-bottom: 20px;">
        <h3 style="font-size: 14px; font-weight: 600; color: #f43f5e; margin: 0 0 10px 0; display: flex; align-items: center; gap: 6px;">
          <span style="font-size: 16px;">⚠️</span> Sistema Temporariamente Indisponível
        </h3>
        <p style="font-size: 13px; color: #475569; margin: 0 0 16px 0; line-height: 1.6;">
          Não foi possível conectar ao sistema de produção da farmácia. Verifique sua conexão com a internet ou faça login na aba principal.
        </p>
        
        <button id="btn-liberar-ssl" style="display: block; width: 100%; padding: 12px; background: #2563eb; color: #fff; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; transition: background 0.2s; text-align: center; box-shadow: 0 2px 4px rgba(37, 99, 235, 0.2);">
          1. Abrir Sistema em Nova Aba
        </button>
      </div>

      <div style="background: #f1f5f9; border-radius: 10px; padding: 16px; font-size: 12px; color: #475569; margin-bottom: 24px; line-height: 1.6; border: 1px solid #e2e8f0;">
        <p style="font-weight: 600; margin: 0 0 8px 0; color: #334155;">Instruções rápidas:</p>
        <ol style="margin: 0; padding-left: 16px;">
          <li style="margin-bottom: 6px;">Clique no botão azul acima para abrir o sistema em uma nova aba do navegador.</li>
          <li style="margin-bottom: 6px;">Faça login na farmácia normalmente se sua sessão estiver expirada.</li>
          <li style="margin-bottom: 6px;">Confirme se o sistema de estoque abre normalmente na nova aba.</li>
          <li style="margin-bottom: 0;">Feche a aba que se abriu e clique no botão verde abaixo.</li>
        </ol>
      </div>

      <button id="btn-retestar-conexao" style="width: 100%; padding: 12px; background: #10b981; color: #fff; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; transition: background 0.2s; box-shadow: 0 2px 4px rgba(16, 185, 129, 0.2);">
        2. Tentar Novamente / Recarregar
      </button>
    </div>
  `;

  // Cria o iframe apontando para o widget de estoque do CRM
  const iframe = document.createElement('iframe');
  iframe.src = 'https://app.drogariabelafarma.com.br/?widget=whatsapp';
  iframe.style.cssText = 'width: 100%; height: 100%; border: none; display: none;';
  
  sidebar.appendChild(diagnostics);
  sidebar.appendChild(iframe);
  document.body.appendChild(sidebar);

  // Seleciona botões e adiciona listeners dinâmicos
  const btnLiberar = diagnostics.querySelector('#btn-liberar-ssl');
  if (btnLiberar) {
    btnLiberar.addEventListener('mouseover', () => btnLiberar.style.backgroundColor = '#1d4ed8');
    btnLiberar.addEventListener('mouseout', () => btnLiberar.style.backgroundColor = '#2563eb');
    btnLiberar.addEventListener('click', () => {
      window.open('https://app.drogariabelafarma.com.br/', '_blank');
    });
  }

  const btnRetestar = diagnostics.querySelector('#btn-retestar-conexao');
  if (btnRetestar) {
    btnRetestar.addEventListener('mouseover', () => btnRetestar.style.backgroundColor = '#059669');
    btnRetestar.addEventListener('mouseout', () => btnRetestar.style.backgroundColor = '#10b981');
    btnRetestar.addEventListener('click', () => {
      checkConnection();
    });
  }

  // Função para testar a conexão antes de exibir o iframe
  function checkConnection() {
    console.log('[BelaFarma-Extension] Testando conexão com o servidor de produção CRM...');
    
    // Altera o botão de reteste temporariamente para indicar carregamento
    if (btnRetestar) {
      btnRetestar.disabled = true;
      btnRetestar.innerText = 'Testando conexão...';
      btnRetestar.style.backgroundColor = '#6b7280';
    }

    fetch('https://app.drogariabelafarma.com.br/favicon.ico', { mode: 'no-cors', cache: 'no-store' })
      .then(() => {
        console.log('[BelaFarma-Extension] ✅ Conexão bem-sucedida! Exibindo painel CRM.');
        diagnostics.style.display = 'none';
        iframe.style.display = 'block';
        // Recarrega o iframe para garantir que ele carregue o conteúdo fresco
        iframe.src = 'https://app.drogariabelafarma.com.br/?widget=whatsapp';
        
        if (btnRetestar) {
          btnRetestar.disabled = false;
          btnRetestar.innerText = '2. Tentar Novamente / Recarregar';
          btnRetestar.style.backgroundColor = '#10b981';
        }
      })
      .catch((err) => {
        console.warn('[BelaFarma-Extension] ❌ Conexão falhou. Exibindo instruções de diagnóstico.', err);
        iframe.style.display = 'none';
        diagnostics.style.display = 'block';
        
        if (btnRetestar) {
          btnRetestar.disabled = false;
          btnRetestar.innerText = '2. Tentar Novamente / Recarregar';
          btnRetestar.style.backgroundColor = '#10b981';
        }
      });
  }

  // Executa o teste de conexão inicial
  checkConnection();

  console.log('[BelaFarma-Extension] Painel lateral injetado e monitor de conexão iniciado.');
}

// Executa a injeção assim que a página estiver pronta
if (document.body) {
  injectBelaFarmaSidebar();
} else {
  window.addEventListener('DOMContentLoaded', injectBelaFarmaSidebar);
}

// Envia o telefone para o iframe do painel lateral via postMessage
function sendActiveChat(phone) {
  console.log(`[BelaFarma-Extension] 📞 Chat ativo detectado: ${phone}`);
  const iframe = document.querySelector('#belafarma-sidebar iframe');
  if (iframe && iframe.contentWindow) {
    iframe.contentWindow.postMessage({ type: 'active-chat-changed', phone: phone }, '*');
  }
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

// Loop principal de verificação do chat ativo
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

// Escuta mensagens vindas do painel admin da farmácia (iframe)
window.addEventListener('message', async (event) => {
  if (!event.data || event.data.source !== 'belafarma-crm') return;

  const { type, text, imageUrl, imageBase64 } = event.data;
  console.log('[BelaFarma-Extension] Mensagem recebida da farmácia:', type, text);

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

// Envia imagem em Base64 + legenda simulando colar e enter
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
    console.log('[BelaFarma-Extension] Imagem Base64 colada.');
    
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

// Envia imagem + legenda via URL (caso seja usada)
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
