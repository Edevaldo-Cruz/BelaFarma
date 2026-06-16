// crm-bridge.js
console.log('[BelaFarma-Extension] Ponte de comunicação (crm-bridge) injetada no CRM.');

// 1. Escuta mensagens vindas do CRM (página web) e as repassa para a extensão
window.addEventListener('message', (event) => {
  // Garante que a mensagem vem do CRM BelaFarma e não é duplicada da extensão
  if (!event.data || event.data.source !== 'belafarma-crm') return;

  console.log('[BelaFarma-Extension] Mensagem recebida do CRM na ponte:', event.data.type);

  // Repassa para a extensão (background.js)
  chrome.runtime.sendMessage({
    source: 'belafarma-crm',
    type: event.data.type,
    text: event.data.text,
    imageUrl: event.data.imageUrl,
    imageBase64: event.data.imageBase64
  });
});

// 2. Escuta mensagens vindas da extensão (background.js) e as repassa para o CRM (página web)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (!request || request.source !== 'whatsapp-web') return;

  console.log('[BelaFarma-Extension] Mensagem recebida do WhatsApp na ponte:', request.type);

  // Repassa para a página web do CRM
  window.postMessage({
    source: 'belafarma-extension',
    type: request.type,
    phone: request.phone
  }, '*');
});
