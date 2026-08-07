const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// 1. Carrega as configurações
const CONFIG_PATH = path.join(__dirname, 'config.json');
let config = {
  serverUrl: 'http://localhost:3001',
  token: 'BelafarmaSul2026',
  pollingIntervalSeconds: 15,
  chromeSessionDir: './whatsapp-session-rpa',
  executablePath: '',
  headless: true
};

if (fs.existsSync(CONFIG_PATH)) {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    config = { ...config, ...JSON.parse(raw) };
  } catch (err) {
    console.error('❌ Erro ao ler arquivo config.json, usando valores padrão:', err.message);
  }
}

const { serverUrl, token, pollingIntervalSeconds, chromeSessionDir, headless } = config;
const POLLING_INTERVAL_MS = pollingIntervalSeconds * 1000;

console.log('========================================================');
console.log('       🤖 BELAFARMA - WINDOWS WHATSAPP RPA AGENT 🤖       ');
console.log('========================================================');
console.log(`🌐 Servidor de dados: ${serverUrl}`);
console.log(`🔑 Token de Autenticação: ${token ? '••••' + token.slice(-4) : 'Não configurado'}`);
console.log(`⏱️ Intervalo de consulta: ${pollingIntervalSeconds} segundos`);
console.log(`📂 Pasta de Sessão Chrome: ${chromeSessionDir}`);
console.log('========================================================\n');

async function downloadFile(url, destPath) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Falha ao baixar imagem do servidor: Status ${res.status} (${res.statusText})`);
  }
  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  fs.writeFileSync(destPath, buffer);
}

function copyImageToClipboard(imagePath) {
  try {
    const absolutePath = path.resolve(imagePath).replace(/\//g, '\\');
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`Arquivo não encontrado para copiar: ${absolutePath}`);
    }
    // Comando PowerShell ultra-estável para copiar imagem para clipboard no Windows
    const psCommand = `powershell -command "Add-Type -AssemblyName System.Windows.Forms; Add-Type -AssemblyName System.Drawing; [System.Windows.Forms.Clipboard]::SetImage([System.Drawing.Image]::FromFile('${absolutePath}'))"`;
    execSync(psCommand, { stdio: 'inherit' });
    return true;
  } catch (err) {
    throw new Error(`Erro ao copiar imagem para a área de transferência do Windows: ${err.message}`);
  }
}

async function reportStatus(postId, status, errorMessage = null) {
  const url = `${serverUrl}/api/whatsapp/agent/report?token=${token}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        id: postId,
        status,
        errorMessage
      })
    });
    if (!res.ok) {
      console.error(`🚨 [Servidor] Falha ao atualizar status do post ${postId}: HTTP ${res.status}`);
    } else {
      console.log(`✅ [Servidor] Status do post ${postId} reportado como "${status}" com sucesso!`);
    }
  } catch (err) {
    console.error(`🚨 [Servidor] Erro de rede ao reportar status do post ${postId}:`, err.message);
  }
}
function isSessionPresent() {
  try {
    const sessionPath = path.resolve(__dirname, chromeSessionDir);
    if (!fs.existsSync(sessionPath)) return false;
    
    const defaultFolder = path.join(sessionPath, 'Default');
    if (!fs.existsSync(defaultFolder)) return false;
    
    return true;
  } catch (e) {
    return false;
  }
}

// Helper seguro para capturar screenshots de debug sem derrubar a execução
async function safeScreenshot(page, filename) {
  try {
    if (page && !page.isClosed()) {
      await page.screenshot({ path: path.join(__dirname, filename) });
      console.log(`📸 Screenshot: ${filename}`);
    }
  } catch (err) {
    // Ignora silenciosamente se o screenshot falhar
  }
}

// Helper para retornar o WhatsApp Web para a página principal de Conversas (Chats)
async function returnToChatsTab(page) {
  try {
    if (!page || page.isClosed()) return;
    console.log('🏠 Resetando visão do WhatsApp: Retornando para a página de Conversas (Chats)...');

    // 1. Pressiona Escape para fechar modais/editores abertos
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press('Escape');
      await new Promise(r => setTimeout(r, 200));
    }

    // 2. Clica no ícone de "Conversas / Chats" no menu lateral
    const resetSuccess = await page.evaluate(() => {
      // Busca por ícone de chat (span data-icon="chat" ou "conversations")
      const chatIcon = document.querySelector('span[data-icon="chat"]') ||
                       document.querySelector('span[data-icon="conversations"]') ||
                       document.querySelector('span[data-icon="menu-chat"]');
      if (chatIcon) {
        const btn = chatIcon.closest('button') || chatIcon.closest('div[role="button"]') || chatIcon.parentElement;
        if (btn) {
          btn.click();
          return true;
        }
      }

      // Busca por aria-label / title "Conversas" ou "Chats"
      const allBtns = Array.from(document.querySelectorAll('button, div[role="button"], a'));
      const chatBtn = allBtns.find(b => {
        const label = (b.getAttribute('aria-label') || b.getAttribute('title') || '').toLowerCase();
        return label === 'conversas' || label === 'chats';
      });
      if (chatBtn) {
        chatBtn.click();
        return true;
      }

      return false;
    });

    if (resetSuccess) {
      console.log('✅ WhatsApp resetado com sucesso para a aba de Conversas!');
    } else {
      console.log('ℹ️ Usando atalho de teclado global para focar nas conversas...');
      await page.keyboard.down('Control');
      await page.keyboard.down('Alt');
      await page.keyboard.press('/');
      await page.keyboard.up('Alt');
      await page.keyboard.up('Control');
    }
  } catch (err) {
    console.warn('⚠️ Aviso ao resetar para a tela de conversas:', err.message);
  }
}

async function startAgent() {
  const sessionPresent = isSessionPresent();
  const shouldRunHeadless = headless && sessionPresent;
  
  if (shouldRunHeadless) {
    console.log('🌐 Iniciando navegador Chromium em modo invisível (segundo plano)...');
  } else {
    if (!sessionPresent) {
      console.log('⚠️ Primeira execução detectada! Iniciando navegador visível para leitura do QR Code...');
    } else {
      console.log('🌐 Iniciando navegador Chromium em modo visível (conforme config)...');
    }
  }
  
  let launchOptions = {
    headless: shouldRunHeadless ? 'shell' : false,
    userDataDir: chromeSessionDir,
    defaultViewport: shouldRunHeadless ? { width: 1280, height: 800 } : null,
    args: shouldRunHeadless ? ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'] : ['--start-maximized']
  };

  // Se houver executablePath customizado no config.json, usa ele
  if (config.executablePath) {
    if (fs.existsSync(config.executablePath)) {
      console.log(`🚀 Usando navegador configurado em: ${config.executablePath}`);
      launchOptions.executablePath = config.executablePath;
    } else {
      console.warn(`⚠️ Executável configurado em "${config.executablePath}" não foi encontrado. Tentando detecção automática...`);
    }
  }

  // Tenta autodetectar o Google Chrome oficial no Windows se nenhum caminho válido for definido
  if (!launchOptions.executablePath) {
    const paths = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe')
    ];

    for (const p of paths) {
      if (p && fs.existsSync(p)) {
        console.log(`🚀 Google Chrome detectado automaticamente em: ${p}`);
        launchOptions.executablePath = p;
        break;
      }
    }
  }

  let browser;
  try {
    browser = await puppeteer.launch(launchOptions);
  } catch (launchErr) {
    console.error('\n💥 [Falha Crítica] Não foi possível inicializar o navegador!');
    console.error('Este erro ocorre quando o Puppeteer não encontra um navegador instalado no cache ou no sistema.');
    console.error('\n💡 Como resolver facilmente:');
    console.error('1. Certifique-se de que o Google Chrome oficial está instalado na sua máquina.');
    console.error('2. Ou abra o terminal do Windows na pasta "windows-rpa-agent" e execute o seguinte comando para baixar o Chromium dedicado:');
    console.error('   npx puppeteer browsers install chrome');
    console.error('\nDetalhes técnicos do erro original:', launchErr.message);
    throw launchErr;
  }

  const page = await browser.newPage();
  
  // Evitar detecção de robô pelo WhatsApp
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  
  console.log('🌐 Abrindo WhatsApp Web...');
  await page.goto('https://web.whatsapp.com');

  console.log('\n--------------------------------------------------------');
  console.log('📲 AGUARDANDO LOGIN...');
  console.log('Se necessário, escaneie o código QR exibido na tela.');
  console.log('--------------------------------------------------------\n');

  let isLoggedIn = false;
  while (!isLoggedIn) {
    try {
      isLoggedIn = await page.evaluate(() => {
        return !!document.querySelector('span[data-icon="chat"]') || 
               !!document.querySelector('span[data-icon="search"]') ||
               !!document.querySelector('div[contenteditable="true"]') ||
               !!document.querySelector('div#pane-side') ||
               !!document.querySelector('div[role="textbox"]');
      });
      if (isLoggedIn) {
        break;
      }
    } catch (e) {}
    await new Promise(r => setTimeout(r, 2000));
  }

  console.log('🎉 Login efetuado com sucesso no WhatsApp Web!');
  console.log('🚀 O Windows RPA Agent está ONLINE e ativo. Aguardando mensagens pendentes...\n');

  // Loop de Polling Sequencial (impede concorrência e sobreposição)
  async function checkQueue() {
    try {
      const pendingUrl = `${serverUrl}/api/whatsapp/agent/pending?token=${token}`;
      const res = await fetch(pendingUrl);
      if (!res.ok) {
        console.error(`❌ [Conexão] Falha ao consultar o servidor: HTTP ${res.status}`);
        return;
      }
      
      const data = await res.json();
      if (!data.hasPending) {
        return; // Nenhuma mensagem na fila
      }

      const { post } = data;
      console.log(`\n📥 [Nova Mensagem] Post ID: ${post.id}`);
      console.log(`👥 Grupo Alvo: "${post.groupName}"`);
      console.log(`💬 Conteúdo: "${post.content.slice(0, 50)}${post.content.length > 50 ? '...' : ''}"`);
      console.log(`🖼️ Possui Imagem: ${post.hasMedia ? 'Sim (' + post.mediaUrl + ')' : 'Não'}`);

      let tempFilePath = null;
      
      // Se tiver imagem, faz o download local com fallback para imagem local do usuário
      if (post.hasMedia) {
        try {
          let targetUrl = post.mediaUrl;
          if (targetUrl.includes('192.168.1.70/') && !targetUrl.includes('192.168.1.70:8085')) {
            targetUrl = targetUrl.replace('192.168.1.70/', '192.168.1.70:8085/');
          }

          const extension = path.extname(new URL(targetUrl).pathname) || '.jpeg';
          tempFilePath = path.join(__dirname, `temp_media_${Date.now()}${extension}`);
          console.log(`📥 Baixando imagem de apoio temporariamente de: ${targetUrl}...`);
          await downloadFile(targetUrl, tempFilePath);
          console.log(`✅ Imagem baixada com sucesso.`);
        } catch (downloadErr) {
          console.warn(`⚠️ Falha ao baixar imagem do servidor (${downloadErr.message}).`);
          const fallbackPath = `C:\\Users\\Edevaldo\\Downloads\\WhatsApp Image 2026-02-05 at 11.29.40.jpeg`;
          if (fs.existsSync(fallbackPath)) {
            tempFilePath = fallbackPath;
            console.log(`📸 Utilizando imagem local de fallback: "${fallbackPath}"`);
          } else {
            console.error(`🚨 Erro ao baixar imagem e imagem local não foi encontrada.`);
            await reportStatus(post.id, 'Erro', `Erro de download de imagem: ${downloadErr.message}`);
            return;
          }
        }
      }

      // Executa o disparo no WhatsApp Web (Status ou Grupo)
      try {
        try {
          await page.bringToFront();
        } catch (e) {
          // Ignora se o Chromium não suportar bringToFront no modo atual
        }

        if (post.type === 'status') {
          console.log(`🚀 Iniciando automação de envio de STATUS no navegador...`);

          // Screenshot: estado inicial
          await safeScreenshot(page, 'debug_status_1_inicio.png');

          // 1. Abre a guia de Status via clique físico do mouse nas coordenadas do ícone
          console.log(`📱 Obter coordenadas do ícone de Status (${post.groupName})...`);
          const statusRect = await page.evaluate(() => {
            // Busca 0: title "wds-ic-status"
            const svgTitles = Array.from(document.querySelectorAll('svg title'));
            const statusTitle = svgTitles.find(t => t.textContent && t.textContent.trim() === 'wds-ic-status');
            let el = null;
            if (statusTitle) {
              el = statusTitle.closest('button') || statusTitle.closest('div[role="button"]') || statusTitle.closest('span') || statusTitle;
            }

            // Busca 1: por data-icon
            if (!el) {
              el = document.querySelector('span[data-icon="status-v3"]') ||
                   document.querySelector('span[data-icon="status-v4"]') ||
                   document.querySelector('span[data-icon="status-outline"]') ||
                   document.querySelector('span[data-icon="status-unread"]') ||
                   document.querySelector('span[data-icon*="status"]');
            }

            // Busca 2: por aria-label
            if (!el) {
              const allElements = Array.from(document.querySelectorAll('button, div[role="button"], span[data-icon], a'));
              el = allElements.find(item => {
                const label = (item.getAttribute('aria-label') || item.getAttribute('title') || item.getAttribute('data-icon') || '').toLowerCase();
                return label.includes('status') || label.includes('atualizações') || label.includes('updates');
              });
            }

            if (el) {
              const rect = el.getBoundingClientRect();
              return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
            }
            return null;
          });

          if (statusRect) {
            console.log(`🎯 Executando clique FÍSICO do mouse no ícone de Status em (${Math.round(statusRect.x)}, ${Math.round(statusRect.y)})...`);
            await page.mouse.click(statusRect.x, statusRect.y);
          } else {
            console.warn('⚠️ Não foi possível encontrar as coordenadas físicas da guia de Status.');
          }
          await new Promise(r => setTimeout(r, 2500));

          // Screenshot: após clicar na guia Status
          await safeScreenshot(page, 'debug_status_2_apos_aba.png');

          // 1.5 Clica na opção de adicionar Status ("Meu status" ou o ícone circular verde com +)
          console.log('➕ Obter coordenadas físicas da opção "Meu status" / botão "+"...');
          const plusRect = await page.evaluate(() => {
            // Busca 1: Ícone de soma "+" verde em "Meu status" (span com data-icon="add-status", "plus", ou svg de mais)
            const addBadge = document.querySelector('span[data-icon="add-status"]') ||
                             document.querySelector('span[data-icon="plus-large"]') ||
                             document.querySelector('span[data-icon="plus-alt"]');
            if (addBadge) {
              const rect = addBadge.getBoundingClientRect();
              if (rect.width > 0 && rect.height > 0) {
                return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, label: 'addBadge' };
              }
            }

            // Busca 2: O item de lista "Meu status" no painel da esquerda
            const allSpans = Array.from(document.querySelectorAll('span, div'));
            const subtext = allSpans.find(el => el.innerText && el.innerText.trim().toLowerCase().includes('clique para atualizar seu status'));
            if (subtext) {
              const target = subtext.closest('div[role="button"]') || subtext.closest('div[tabindex]') || subtext.parentElement;
              if (target) {
                const rect = target.getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0) {
                  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, label: 'subtextRow' };
                }
              }
            }

            // Busca 3: O texto "Meu status"
            const myStatusText = allSpans.find(el => el.innerText && el.innerText.trim().toLowerCase() === 'meu status');
            if (myStatusText) {
              const target = myStatusText.closest('div[role="button"]') || myStatusText.closest('div[tabindex]') || myStatusText.parentElement;
              if (target) {
                const rect = target.getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0) {
                  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, label: 'myStatusTextRow' };
                }
              }
            }

            return null;
          });

          if (plusRect) {
            console.log(`🎯 Executando clique FÍSICO do mouse em "${plusRect.label}" em (${Math.round(plusRect.x)}, ${Math.round(plusRect.y)})...`);
            
            // Tenta capturar o seletor de arquivos nativo ou popup de menu ao clicar
            try {
              const [fileChooser] = await Promise.all([
                page.waitForFileChooser({ timeout: 3000 }).catch(() => null),
                page.mouse.click(plusRect.x, plusRect.y)
              ]);

              if (fileChooser && tempFilePath) {
                console.log('🎉 FileChooser capturado! Injetando imagem...');
                await fileChooser.accept([tempFilePath]);
              }
            } catch (fcErr) {
              console.warn('⚠️ FileChooser não abriu imediatamente:', fcErr.message);
            }
          } else {
            console.warn('⚠️ Opção "Meu status" não localizada.');
          }
          await new Promise(r => setTimeout(r, 2000));

          // Screenshot: após clicar no Meu Status
          await safeScreenshot(page, 'debug_status_3_meu_status.png');

          // Se tiver um modal/popover aberto com "Fotos e vídeos" (ou ícone de foto), clica nele
          console.log('🖼️ Procurando botão ou menu de "Fotos e vídeos"...');
          const photoMenuTarget = await page.evaluate(() => {
            const items = Array.from(document.querySelectorAll('div[role="button"], li, span, button, aria-label'));
            // Procura item de menu com ícone ou texto de foto/vídeo/mídia
            const item = items.find(el => {
              const txt = (el.innerText || el.getAttribute('aria-label') || '').toLowerCase();
              return (txt.includes('foto') || txt.includes('vídeo') || txt.includes('mídia')) && !txt.includes('pesquise');
            });
            if (item) {
              const rect = item.getBoundingClientRect();
              if (rect.width > 0 && rect.height > 0) {
                return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
              }
            }
            return null;
          });

          if (photoMenuTarget) {
            console.log(`🎯 Clicando na opção "Fotos e vídeos" em (${Math.round(photoMenuTarget.x)}, ${Math.round(photoMenuTarget.y)})...`);
            try {
              const [fileChooser] = await Promise.all([
                page.waitForFileChooser({ timeout: 3000 }).catch(() => null),
                page.mouse.click(photoMenuTarget.x, photoMenuTarget.y)
              ]);
              if (fileChooser && tempFilePath) {
                console.log('🎉 FileChooser capturado no menu "Fotos e vídeos"! Injetando imagem...');
                await fileChooser.accept([tempFilePath]);
              }
            } catch (e) {}
            await new Promise(r => setTimeout(r, 1500));
          }

          // 2. Envia a imagem (uploadFile direto no input[type="file"] ou Clipboard + Colar)
          if (tempFilePath) {
            let fileInput = await page.$('input[type="file"]');
            if (!fileInput) {
              const inputs = await page.$$('input[type="file"]');
              if (inputs.length > 0) fileInput = inputs[inputs.length - 1];
            }

            if (fileInput) {
              console.log('📁 Input de arquivo nativo localizado! Injetando imagem via uploadFile...');
              try {
                await fileInput.uploadFile(tempFilePath);
              } catch (uErr) {
                console.warn('⚠️ uploadFile falhou:', uErr.message);
              }
            } else {
              console.log('📋 Input nativo não achado. Forçando copiar imagem para Área de Transferência e colar...');
              copyImageToClipboard(tempFilePath);
              await new Promise(r => setTimeout(r, 1000));

              console.log('📋 Colando imagem no WhatsApp (Ctrl + V)...');
              await page.keyboard.down('Control');
              await page.keyboard.press('V');
              await page.keyboard.up('Control');
            }

            console.log('⏳ Aguardando abertura do editor de Status...');
            await new Promise(r => setTimeout(r, 4000));

            // Screenshot: após colar/upload da imagem
            await safeScreenshot(page, 'debug_status_4_imagem.png');

            if (post.content) {
              console.log('✍️ Escrevendo legenda do Status...');
              await page.keyboard.type(post.content, { delay: 40 });
              await new Promise(r => setTimeout(r, 1000));
            }

            console.log('🚀 Enviando Status!');
            const sendClicked = await page.evaluate(() => {
              const sendBtn = document.querySelector('span[data-icon="send"]') ||
                              document.querySelector('button[aria-label*="Enviar"]') ||
                              document.querySelector('div[role="button"][aria-label*="Enviar"]');
              if (sendBtn) {
                const target = sendBtn.closest('button') || sendBtn.closest('div[role="button"]') || sendBtn;
                target.click();
                return true;
              }
              return false;
            });

            if (sendClicked) {
              console.log('🎯 Botão de enviar clicado com sucesso!');
            } else {
              console.log('⚠️ Botão enviar não localizado por seletor, pressionando Enter...');
              await page.keyboard.press('Enter');
            }
          } else {
            console.warn('⚠️ Post de status sem mídia física baixada.');
          }

          console.log('⏳ Aguardando confirmação do envio do Status...');
          await new Promise(r => setTimeout(r, 5000));

          await reportStatus(post.id, 'Enviado');
          console.log(`🎉 [SUCESSO] Status enviado com sucesso para o WhatsApp!`);

        } else {
          // ENVIO PARA GRUPO (Comportamento padrão)
          console.log(`🚀 Iniciando automação de envio em GRUPO no navegador...`);
          await returnToChatsTab(page);

          // 1. Abre a busca de chats
          console.log(`🔍 Focando na pesquisa do WhatsApp (Ctrl + Alt + /)...`);
          await page.keyboard.down('Control');
          await page.keyboard.down('Alt');
          await page.keyboard.press('/');
          await page.keyboard.up('Alt');
          await page.keyboard.up('Control');
          await new Promise(r => setTimeout(r, 1000));

          // Limpa busca anterior caso exista
          await page.keyboard.down('Control');
          await page.keyboard.press('A');
          await page.keyboard.up('Control');
          await page.keyboard.press('Backspace');
          await new Promise(r => setTimeout(r, 500));

          // 2. Digita o nome do grupo
          console.log(`⌨️ Digitando nome do grupo: "${post.groupName}"...`);
          await page.keyboard.type(post.groupName, { delay: 100 });
          await new Promise(r => setTimeout(r, 3000));

          // 3. Clica no grupo correspondente na lista
          console.log('👆 Localizando o elemento do grupo e clicando...');
          const chatRect = await page.evaluate((nome) => {
            const spans = Array.from(document.querySelectorAll('span'));
            const chat = spans.find(s => s.title === nome || s.innerText === nome);
            if (chat) {
              const rect = chat.getBoundingClientRect();
              return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
            }
            return null;
          }, post.groupName);

          if (chatRect) {
            await page.mouse.click(chatRect.x, chatRect.y);
            console.log(`🎯 Clique físico realizado com sucesso no grupo.`);
          } else {
            console.log('⚠️ Grupo não apareceu visualmente. Tentando atalho manual com Enter...');
            await page.keyboard.press('ArrowDown');
            await new Promise(r => setTimeout(r, 500));
            await page.keyboard.press('Enter');
          }

          // Aguarda transição da tela do chat
          await new Promise(r => setTimeout(r, 2000));

          // 4. Envia o conteúdo
          if (tempFilePath) {
            // ENVIO COM IMAGEM (Clipboard + Colar + Legenda)
            console.log('📋 Copiando imagem para a Área de Transferência do Windows...');
            copyImageToClipboard(tempFilePath);
            await new Promise(r => setTimeout(r, 1000));

            console.log('📋 Colando imagem no WhatsApp (Ctrl + V)...');
            await page.keyboard.down('Control');
            await page.keyboard.press('V');
            await page.keyboard.up('Control');

            console.log('⏳ Aguardando abertura do editor de legenda...');
            await new Promise(r => setTimeout(r, 4000));

            console.log('✍️ Escrevendo legenda...');
            await page.keyboard.type(post.content, { delay: 40 });
            await new Promise(r => setTimeout(r, 1000));

            console.log('🚀 Enviando!');
            try {
              await page.waitForSelector('span[data-icon="send"]', { timeout: 3000 });
              await page.click('span[data-icon="send"]');
              console.log('🎯 Clique físico no botão de enviar concluído com sucesso!');
            } catch (clickErr) {
              console.log('⚠️ Botão enviar não localizado por clique, tentando método clássico com Enter...');
              await page.keyboard.press('Enter');
            }
          } else {
            // ENVIO SÓ TEXTO
            console.log('✍️ Escrevendo mensagem de texto...');
            const inputSelector = 'div[contenteditable="true"]';
            await page.waitForSelector(inputSelector, { timeout: 5000 });
            await page.focus(inputSelector);
            await page.keyboard.type(post.content, { delay: 40 });
            await new Promise(r => setTimeout(r, 1000));

            console.log('🚀 Enviando!');
            await page.keyboard.press('Enter');
          }

          // Aguarda 5 segundos para a rede do WhatsApp disparar e persistir a mensagem
          console.log('⏳ Aguardando confirmação do envio...');
          await new Promise(r => setTimeout(r, 5000));

          // 5. Reporta o sucesso para o servidor
          await reportStatus(post.id, 'Enviado');
          console.log(`🎉 [SUCESSO] Mensagem enviada com sucesso para o grupo "${post.groupName}"!`);
        }

      } catch (autoErr) {
        console.error(`🚨 Erro durante automação RPA no navegador: ${autoErr.message}`);
        await reportStatus(post.id, 'Erro', `Erro de automação: ${autoErr.message}`);
      } finally {
        // Sempre reseta a visão do WhatsApp Web de volta para a aba principal de Conversas (Chats)
        await returnToChatsTab(page);

        // Limpeza de arquivo temporário
        if (tempFilePath && tempFilePath.includes('temp_media_') && fs.existsSync(tempFilePath)) {
          try {
            fs.unlinkSync(tempFilePath);
            console.log(`🧹 Arquivo temporário removido.`);
          } catch (e) {}
        }
      }

    } catch (err) {
      console.error('🚨 Erro crítico no loop de polling do agente:', err.message);
    }
  }

  // Loop recursivo seguro: espera o ciclo anterior terminar para agendar o próximo!
  async function runLoop() {
    await checkQueue();
    setTimeout(runLoop, POLLING_INTERVAL_MS);
  }
  
  runLoop();

}

startAgent().catch(err => {
  console.error('💥 Falha crítica ao inicializar o Windows RPA Agent:', err.message);
});
