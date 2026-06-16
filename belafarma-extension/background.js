// background.js
console.log('[BelaFarma-Extension] Service worker ativo.');

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'check-connection') {
    console.log('[BelaFarma-Extension] Testando conexão com:', request.url);
    fetch(request.url, { mode: 'no-cors', cache: 'no-store' })
      .then(() => {
        sendResponse({ success: true });
      })
      .catch((err) => {
        console.error('[BelaFarma-Extension] Falha ao testar conexão:', err);
        sendResponse({ success: false, error: String(err) });
      });
    return true; // Mantém o canal de mensagens aberto para resposta assíncrona
  }
});
