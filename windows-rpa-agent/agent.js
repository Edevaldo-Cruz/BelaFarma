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
  chromeSessionDir: './whatsapp-session-rpa'
};

if (fs.existsSync(CONFIG_PATH)) {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    config = { ...config, ...JSON.parse(raw) };
  } catch (err) {
    console.error('❌ Erro ao ler arquivo config.json, usando valores padrão:', err.message);
  }
}

const { serverUrl, token, pollingIntervalSeconds, chromeSessionDir } = config;
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

async function startAgent() {
  console.log('🌐 Iniciando navegador Chromium (modo visível)...');
  
  const browser = await puppeteer.launch({
    headless: false,
    userDataDir: chromeSessionDir,
    defaultViewport: null,
    args: ['--start-maximized']
  });

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

  // Loop de Polling
  setInterval(async () => {
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
          // Encontra span com título idêntico ou texto do grupo
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
            // Espera e clica no botão físico de enviar (aviãozinho) para robustez total
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
  }, POLLING_INTERVAL_MS);

}

startAgent().catch(err => {
  console.error('💥 Falha crítica ao inicializar o Windows RPA Agent:', err.message);
});
