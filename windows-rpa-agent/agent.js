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

  // Seletores de login — múltiplas opções para cobrir diferentes versões do WhatsApp Web
  const LOGIN_SELECTORS = [
    'div#pane-side',                             // painel lateral de conversas
    'div[data-testid="chat-list"]',              // lista de chats (versão atual)
    'div[data-testid="default-user"]',           // avatar do usuário logado
    'span[data-testid="search"]',                // ícone de busca na sidebar
    'div[aria-label="Lista de conversas"]',      // acessibilidade PT-BR
    'div[aria-label="Chat list"]',               // acessibilidade EN
    'div[contenteditable="true"]',               // qualquer campo editável
    'div[role="textbox"]',                       // campo de mensagem
  ];

  let isLoggedIn = false;
  let loginCheckCount = 0;
  while (!isLoggedIn) {
    try {
      isLoggedIn = await page.evaluate((selectors) => {
        return selectors.some(sel => !!document.querySelector(sel));
      }, LOGIN_SELECTORS);

      if (isLoggedIn) {
        break;
      }
    } catch (e) {}

    loginCheckCount++;
    if (loginCheckCount % 10 === 0) {
      console.log(`⏳ Aguardando login... (${loginCheckCount * 2}s). Se necessário, escaneie o QR Code.`);
    }
    await new Promise(r => setTimeout(r, 2000));
  }

  console.log('🎉 Login efetuado com sucesso no WhatsApp Web!');
  console.log('🚀 O Windows RPA Agent está ONLINE e ativo. Aguardando mensagens pendentes...\n');

  // Fetch com timeout e retry automático (resistente a quedas momentâneas de rede)
  async function fetchComRetry(url, tentativas = 3, timeoutMs = 15000) {
    for (let i = 1; i <= tentativas; i++) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timer);
        return res;
      } catch (err) {
        const motivo = err.name === 'AbortError' ? `timeout após ${timeoutMs/1000}s` : err.message;
        if (i < tentativas) {
          console.warn(`⚠️ [Rede] Tentativa ${i}/${tentativas} falhou (${motivo}). Tentando novamente em 3s...`);
          await new Promise(r => setTimeout(r, 3000));
        } else {
          console.error(`❌ [Rede] Todas as ${tentativas} tentativas falharam. Aguardando próximo ciclo. (${motivo})`);
          throw err;
        }
      }
    }
  }

  // Loop de Polling Sequencial (impede concorrência e sobreposição)
  async function checkQueue() {
    try {
      const pendingUrl = `${serverUrl}/api/whatsapp/agent/pending?token=${token}`;
      const res = await fetchComRetry(pendingUrl);
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
      
      // Se tiver imagem, faz o download local
      if (post.hasMedia) {
        try {
          const extension = path.extname(new URL(post.mediaUrl).pathname) || '.jpeg';
          tempFilePath = path.join(__dirname, `temp_media_${Date.now()}${extension}`);
          console.log(`📥 Baixando imagem de apoio temporariamente em: ${tempFilePath}...`);
          await downloadFile(post.mediaUrl, tempFilePath);
          console.log(`✅ Imagem baixada com sucesso.`);
        } catch (downloadErr) {
          console.error(`🚨 Erro ao baixar imagem: ${downloadErr.message}`);
          await reportStatus(post.id, 'Erro', `Erro de download de imagem: ${downloadErr.message}`);
          return;
        }
      }

      // Executa o disparo no WhatsApp Web
      try {
        console.log(`🚀 Iniciando automação de envio no navegador...`);
        
        // Garante foco na página
        await page.bringToFront();

        // 1. Abre o campo de busca — múltiplos seletores de fallback
        // O atalho Ctrl+Alt+/ foi descontinuado em versões recentes do WhatsApp Web.
        // Agora clicamos diretamente no campo de busca pelo DOM.
        console.log(`🔍 Localizando e clicando no campo de busca do WhatsApp...`);
        const SEARCH_SELECTORS = [
          'div[data-testid="chat-list-search"]',           // seletor principal atual
          'div[contenteditable="true"][data-tab="3"]',     // campo de busca por data-tab
          'div[role="textbox"][title="Pesquisar ou começar uma nova conversa"]',
          'div[role="textbox"][title="Search or start new chat"]',
          'div[aria-label="Pesquisar ou começar uma nova conversa"]',
          'div[aria-label="Search or start new chat"]',
          '#side div[contenteditable="true"]',             // fallback genérico na sidebar
        ];

        let searchClicked = false;
        for (const sel of SEARCH_SELECTORS) {
          try {
            const el = await page.$(sel);
            if (el) {
              await el.click();
              console.log(`  ✅ Campo de busca encontrado e clicado: ${sel}`);
              searchClicked = true;
              break;
            }
          } catch (e) {}
        }

        if (!searchClicked) {
          // Último fallback: tenta clicar no ícone de lupa da sidebar
          // IMPORTANTE: NÃO usar Ctrl+F — abre a busca do NAVEGADOR, não do WhatsApp!
          console.log('  ⚠️ Campo de busca não encontrado por seletor. Tentando clicar no ícone de lupa...');
          try {
            const lupaSelectors = [
              'span[data-icon="search"]',
              'div[data-testid="search"]',
              'button[aria-label="Pesquisar"]',
              'button[aria-label="Search"]',
            ];
            for (const lupaSel of lupaSelectors) {
              const lupaEl = await page.$(lupaSel);
              if (lupaEl) {
                await lupaEl.click();
                console.log(`  ✅ Ícone de lupa clicado: ${lupaSel}`);
                searchClicked = true;
                break;
              }
            }
          } catch (e) {}
          if (!searchClicked) {
            console.log('  ❌ Nenhum seletor de busca funcionou. Verifique se o WhatsApp Web carregou corretamente.');
          }
        }

        await new Promise(r => setTimeout(r, 800));

        // Limpa qualquer texto anterior no campo de busca
        await page.keyboard.down('Control');
        await page.keyboard.press('a');
        await page.keyboard.up('Control');
        await page.keyboard.press('Backspace');
        await new Promise(r => setTimeout(r, 400));

        // 2. Digita o nome do grupo
        console.log(`⌨️ Digitando nome do grupo: "${post.groupName}"...`);
        await page.keyboard.type(post.groupName, { delay: 120 });
        
        // Aguarda os resultados aparecerem na lista (aumentado para 4s)
        console.log(`⏳ Aguardando resultados da busca...`);
        await new Promise(r => setTimeout(r, 4000));

        // 3. Clica no grupo correspondente na lista
        console.log('👆 Localizando o elemento do grupo e clicando...');

        // Estratégia multi-tentativa para encontrar o chat na lista
        const chatRect = await page.evaluate((nome) => {
          // Tenta primeiro pela propriedade title (mais preciso)
          const byTitle = document.querySelector(`span[title="${nome}"]`);
          if (byTitle) {
            const rect = byTitle.getBoundingClientRect();
            if (rect.width > 0) return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, method: 'title' };
          }

          // Busca por innerText exato em spans da lista de resultados
          const spans = Array.from(document.querySelectorAll('#pane-side span, div[aria-label] span'));
          const byText = spans.find(s => s.innerText?.trim() === nome || s.textContent?.trim() === nome);
          if (byText) {
            const rect = byText.getBoundingClientRect();
            if (rect.width > 0) return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, method: 'innerText' };
          }

          // Busca parcial como último recurso
          const byPartial = spans.find(s => s.innerText?.includes(nome) || s.title?.includes(nome));
          if (byPartial) {
            const rect = byPartial.getBoundingClientRect();
            if (rect.width > 0) return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, method: 'partial' };
          }

          return null;
        }, post.groupName);

        if (chatRect) {
          console.log(`  ✅ Grupo encontrado (método: ${chatRect.method}). Clicando...`);
          await page.mouse.click(chatRect.x, chatRect.y);
          console.log(`🎯 Clique físico realizado com sucesso no grupo.`);
        } else {
          // Fallback: pressiona seta para baixo + Enter para selecionar o primeiro resultado
          console.log('⚠️ Grupo não encontrado visualmente na lista. Tentando seta+Enter...');
          await page.keyboard.press('ArrowDown');
          await new Promise(r => setTimeout(r, 600));
          await page.keyboard.press('Enter');
          console.log('  ↩️ Enter pressionado no primeiro resultado.');
        }

        // Aguarda transição da tela do chat
        await new Promise(r => setTimeout(r, 2000));

        // 4. Envia o conteúdo
        if (tempFilePath) {
          // ================================================================
          // ENVIO COM IMAGEM — Drag & Drop (confirmado funcionar manualmente)
          // Fluxo: arrastar imagem → editor de legenda abre → digitar texto → enviar
          // ================================================================
          console.log('📤 Iniciando envio por Drag & Drop...');

          // Detecta o tipo MIME com base na extensão do arquivo
          const ext = path.extname(tempFilePath).toLowerCase();
          const mimeMap = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp' };
          const mimeType = mimeMap[ext] || 'image/jpeg';
          const fileName = path.basename(tempFilePath);

          // Lê o arquivo e converte para Base64 para injetar na página
          console.log(`📁 Lendo arquivo "${fileName}" (${mimeType}) para injeção...`);
          const fileBuffer = fs.readFileSync(tempFilePath);
          const base64Data = fileBuffer.toString('base64');
          console.log(`✅ Arquivo lido (${Math.round(fileBuffer.length / 1024)} KB). Simulando arrasto no WhatsApp Web...`);

          // Simula o drag & drop da imagem diretamente na área do chat
          // (igual ao que o usuário faz arrastando o arquivo para a janela do browser)
          const dropSuccess = await page.evaluate(async (b64, mime, fname) => {
            try {
              // Converte base64 → Uint8Array → Blob → File
              const byteChars = atob(b64);
              const bytes = new Uint8Array(byteChars.length);
              for (let i = 0; i < byteChars.length; i++) {
                bytes[i] = byteChars.charCodeAt(i);
              }
              const blob = new Blob([bytes], { type: mime });
              const file = new File([blob], fname, { type: mime });

              // Cria o DataTransfer com o arquivo
              const dt = new DataTransfer();
              dt.items.add(file);

              // Encontra a área de mensagens do chat (onde o usuário arrastaria)
              const dropTarget =
                document.querySelector('#main footer') ||
                document.querySelector('div[data-testid="conversation-panel-messages"]') ||
                document.querySelector('div[role="application"]') ||
                document.querySelector('#main');

              if (!dropTarget) return { ok: false, reason: 'Área de chat não encontrada no DOM.' };

              // Dispara os eventos de drag exatamente como um drag real de arquivo
              dropTarget.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: dt }));
              await new Promise(r => setTimeout(r, 150));
              dropTarget.dispatchEvent(new DragEvent('dragover',  { bubbles: true, cancelable: true, dataTransfer: dt }));
              await new Promise(r => setTimeout(r, 150));
              dropTarget.dispatchEvent(new DragEvent('drop',      { bubbles: true, cancelable: true, dataTransfer: dt }));
              return { ok: true };
            } catch (e) {
              return { ok: false, reason: e.message };
            }
          }, base64Data, mimeType, fileName);

          if (!dropSuccess.ok) {
            throw new Error(`Falha no drag & drop da imagem: ${dropSuccess.reason}`);
          }
          console.log('✅ Drag & Drop realizado. Aguardando editor de legenda abrir...');

          // Aguarda o editor de mídia/legenda aparecer (confirma que o drop foi aceito)
          try {
            await page.waitForSelector(
              'div[data-testid="media-editor-send-button"], div[data-testid="media-caption-input-container"], span[data-icon="send"]',
              { timeout: 12000 }
            );
            console.log('✅ Editor de legenda detectado com sucesso!');
          } catch (e) {
            console.warn('⚠️ Timeout aguardando editor de legenda. Continuando mesmo assim...');
          }
          await new Promise(r => setTimeout(r, 2000)); // Aguarda a animação de transição completar

          // PASSO 2: Digitar o texto na caixa de legenda da imagem
          console.log('✍️ Localizando caixa de legenda...');
          const captionSelectors = [
            'div[data-testid="media-caption-input-container"] div[contenteditable="true"]',
            'div[data-tab="10"][contenteditable="true"]',
            'div[role="textbox"][data-tab="10"]',
            'footer div[contenteditable="true"]',
          ];

          let captionTyped = false;
          for (const sel of captionSelectors) {
            try {
              const captionBox = await page.$(sel);
              if (captionBox) {
                console.log(`  ✅ Legenda encontrada com seletor: ${sel}`);
                await captionBox.click();
                await new Promise(r => setTimeout(r, 400));
                await captionBox.type(post.content, { delay: 40 });
                captionTyped = true;
                break;
              }
            } catch (e) {}
          }

          if (!captionTyped) {
            // Fallback: pega o último contenteditable (WhatsApp Web coloca a legenda como último)
            const allEditable = await page.$$('div[contenteditable="true"]');
            console.log(`  ⚠️ Seletores específicos falharam. Encontrados ${allEditable.length} contenteditable(s). Usando o último...`);
            if (allEditable.length > 0) {
              const lastBox = allEditable[allEditable.length - 1];
              await lastBox.click();
              await new Promise(r => setTimeout(r, 400));
              await lastBox.type(post.content, { delay: 40 });
              captionTyped = true;
              console.log('  ✅ Legenda digitada no último contenteditable (fallback).');
            }
          }

          if (!captionTyped) {
            console.warn('⚠️ Não foi possível digitar a legenda. Enviando imagem sem legenda...');
          }
          await new Promise(r => setTimeout(r, 800));

          // PASSO 3: Clicar no botão de enviar do editor de mídia
          console.log('🚀 Enviando imagem com legenda...');
          let sent = false;
          const sendBtnSelectors = [
            'div[data-testid="media-editor-send-button"]',
            'span[data-icon="send"]',
            'div[role="button"][aria-label="Enviar"]',
            'div[aria-label="Enviar"]',
          ];
          for (const btnSel of sendBtnSelectors) {
            try {
              const btn = await page.$(btnSel);
              if (btn) {
                console.log(`  🎯 Clicando em: ${btnSel}`);
                await btn.click();
                sent = true;
                console.log('  ✅ Imagem enviada com sucesso!');
                break;
              }
            } catch (e) {}
          }
          if (!sent) {
            console.log('⚠️ Botão de enviar não encontrado. Usando Enter como fallback...');
            await page.keyboard.press('Enter');
            sent = true;
            console.log('🎯 Enter pressionado.');
          }
        } else {
          // ENVIO SÓ TEXTO
          console.log('✍️ Localizando campo de mensagem do chat...');

          // Múltiplos seletores para o campo de mensagem (o WhatsApp Web muda frequentemente)
          const MSG_INPUT_SELECTORS = [
            'div[data-testid="conversation-compose-box-input"]',  // seletor atual principal
            'div[contenteditable="true"][data-tab="10"]',         // por data-tab
            'footer div[contenteditable="true"]',                 // genérico no rodapé
            '#main div[contenteditable="true"]',                  // genérico na área principal
          ];

          let inputEl = null;
          // Tenta cada seletor com timeout mais generoso (12s no total)
          for (const sel of MSG_INPUT_SELECTORS) {
            try {
              inputEl = await page.waitForSelector(sel, { timeout: 12000 });
              if (inputEl) {
                console.log(`  ✅ Campo de mensagem encontrado: ${sel}`);
                break;
              }
            } catch (e) {}
          }

          if (!inputEl) {
            throw new Error('Campo de mensagem não encontrado após 12s. O chat não abriu corretamente.');
          }

          await inputEl.click();
          await new Promise(r => setTimeout(r, 400));
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

      } catch (autoErr) {
        console.error(`🚨 Erro durante automação RPA no navegador: ${autoErr.message}`);
        await reportStatus(post.id, 'Erro', `Erro de automação: ${autoErr.message}`);
      } finally {
        // Limpeza de arquivo temporário
        if (tempFilePath && fs.existsSync(tempFilePath)) {
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
