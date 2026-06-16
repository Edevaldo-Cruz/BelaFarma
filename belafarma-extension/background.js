// background.js
console.log('[BelaFarma-Extension] Service worker ativo.');

// Abre o CRM em janela flutuante ao clicar no ícone da extensão
chrome.action.onClicked.addListener((tab) => {
  console.log('[BelaFarma-Extension] Ícone clicado. Abrindo painel lateral do CRM em janela popup...');
  chrome.windows.create({
    url: 'https://app.drogariabelafarma.com.br/?widget=whatsapp',
    type: 'popup',
    width: 450,
    height: 800,
    focused: true
  });
});

// Canal de comunicação bidirecional em segundo plano (Router)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (!request || !request.source) return;

  // 1. Roteamento do teste de conectividade (se necessário)
  if (request.type === 'check-connection') {
    fetch(request.url, { mode: 'no-cors', cache: 'no-store' })
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: String(err) }));
    return true; // Resposta assíncrona
  }

  // 2. Roteia mensagens vindas do WhatsApp Web para as abas do CRM
  if (request.source === 'whatsapp-web') {
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach((tab) => {
        if (tab.url && (
          tab.url.includes('app.drogariabelafarma.com.br') || 
          tab.url.includes('127.0.0.1') || 
          tab.url.includes('localhost')
        )) {
          chrome.tabs.sendMessage(tab.id, request);
        }
      });
    });
  }

  // 3. Roteia mensagens vindas do CRM para as abas do WhatsApp Web
  if (request.source === 'belafarma-crm') {
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach((tab) => {
        if (tab.url && tab.url.includes('web.whatsapp.com')) {
          chrome.tabs.sendMessage(tab.id, request);
        }
      });
    });
  }
});
