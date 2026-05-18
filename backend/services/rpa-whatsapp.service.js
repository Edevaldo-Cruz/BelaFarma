const puppeteer = require('puppeteer');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

function logToFile(msg) {
  const timestamp = new Date().toISOString();
  const logMsg = `[${timestamp}] ${msg}`;
  console.log(logMsg);
  try {
    fs.appendFileSync(path.join(__dirname, '..', 'rpa-debug.log'), logMsg + '\n');
  } catch (e) {}
}

const os = require('os');
const config = require('../config');

async function uploadViaInput(page, imagePath) {
  try {
    const attachBtn = await page.waitForSelector('span[data-icon="plus"], span[data-icon="attach-menu-plus"]', { timeout: 5000 });
    await attachBtn.click();
    
    const fileInput = await page.waitForSelector('input[type="file"]', { timeout: 5000 });
    await fileInput.uploadFile(imagePath);
    return true;
  } catch (e) {
    console.error('Erro ao fazer upload via input:', e.message);
    return false;
  }
}

/**
 * RPA WhatsApp Service
 * Responsável por automatizar o envio de mensagens para Grupos no WhatsApp Web usando Puppeteer.
 */

class RpaWhatsappService {
  async sendGroupMessage(groupName, message, imagePath = null) {
    logToFile(`🤖 Iniciando RPA - Alvo: "${groupName}", Imagem: ${imagePath ? 'Sim' : 'Não'}`);
    let browser = null;

    try {
      const isWindows = process.platform === 'win32';
      // Usa a pasta data central configurada pelo sistema (independente de ambiente)
      const sessionPath = path.join(path.dirname(config.dbPath), 'whatsapp-session-rpa');
      
      logToFile(`📂 Sessão do Chrome configurada em: ${sessionPath}`);

      // Mata TODOS os processos Chromium órfãos antes de iniciar
      if (!isWindows) {
        try {
          execSync('pkill -f chromium || true', { timeout: 5000 });
          logToFile(`🔪 Processos Chromium órfãos encerrados.`);
          // Aguarda encerramento completo
          await new Promise(r => setTimeout(r, 2000));
        } catch (e) {
          logToFile(`⚠️ pkill chromium: ${e.message}`);
        }
      }

      // Limpa TODOS os arquivos de trava do Chromium (incluindo links simbólicos quebrados comuns no Docker)
      const lockFiles = ['SingletonLock', 'SingletonSocket', 'SingletonCookie'];
      for (const lockFile of lockFiles) {
        const lockFilePath = path.join(sessionPath, lockFile);
        try {
          fs.unlinkSync(lockFilePath);
          logToFile(`♻️ Trava ${lockFile} removida com sucesso.`);
        } catch (err) {
          if (err.code !== 'ENOENT') {
            logToFile(`⚠️ Falha ao remover ${lockFile}: ${err.message}`);
          }
        }
      }

      let executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || undefined;
      
      // Fallback para caminhos comuns no Linux
      if (!isWindows && !executablePath) {
        const commonPaths = ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome'];
        for (const p of commonPaths) {
            if (fs.existsSync(p)) {
                executablePath = p;
                break;
            }
        }
      }

      const launchOptions = {
        headless: isWindows ? false : true, // Headless no Linux/Docker (Puppeteer v22+ usa true para o novo headless)
        executablePath: executablePath,
        userDataDir: sessionPath,
        defaultViewport: null,
        dumpio: true, // Redireciona a saída do Chromium para os logs gerais do container
        args: [
          '--start-maximized',
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-software-rasterizer'
        ]
      };

      logToFile(`🌐 Lançando browser (${isWindows ? 'Windows' : 'Linux/Docker'})...`);
      browser = await puppeteer.launch(launchOptions);
      // Pequeno delay para inicializar o frame principal no Docker
      await new Promise(r => setTimeout(r, 2000));

      logToFile(`🌐 Browser lançado com sucesso. Abrindo nova página...`);
      const page = await browser.newPage();
      // Pequeno delay para garantir que o frame da página foi criado
      await new Promise(r => setTimeout(r, 1000));
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      
      logToFile(`🌐 Indo para web.whatsapp.com...`);
      await page.goto('https://web.whatsapp.com', { waitUntil: 'domcontentloaded', timeout: 60000 });

      logToFile(`⏳ Aguardando 15 segundos para o WhatsApp carregar (QR Code ou Tela Inicial)...`);
      await new Promise(r => setTimeout(r, 15000));

      logToFile(`🔍 Pesquisando pelo grupo: "${groupName}"...`);
      await page.keyboard.down('Control');
      await page.keyboard.down('Alt');
      await page.keyboard.press('/');
      await page.keyboard.up('Alt');
      await page.keyboard.up('Control');
      
      await new Promise(r => setTimeout(r, 1000));

      await page.keyboard.type(groupName, { delay: 150 });
      await new Promise(r => setTimeout(r, 3000));
      
      logToFile(`👆 Calculando posição do grupo no DOM...`);
      const chatRect = await page.evaluate((nome) => {
        const spans = Array.from(document.querySelectorAll('span'));
        const chat = spans.find(s => s.title === nome || s.innerText === nome);
        if (chat) {
          const rect = chat.getBoundingClientRect();
          return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
        }
        return null;
      }, groupName);

      if (chatRect) {
        logToFile(`👆 Grupo encontrado em X:${chatRect.x}, Y:${chatRect.y}. Clicando...`);
        await page.mouse.click(chatRect.x, chatRect.y);
      } else {
        logToFile(`⚠️ Grupo não visível no DOM. Tentando atalho de teclado...`);
        await page.keyboard.press('ArrowDown');
        await new Promise(r => setTimeout(r, 500));
        await page.keyboard.press('Enter');
      }

      await new Promise(r => setTimeout(r, 2000));

      if (imagePath) {
        logToFile(`📎 Processando resolução do caminho da imagem...`);
        const cleanImagePath = imagePath.replace(/^\//, ''); 
        
        const possiblePaths = [
          path.isAbsolute(imagePath) ? imagePath : null,
          path.join(__dirname, '..', 'public', cleanImagePath),
          path.join(__dirname, '..', '..', 'public', cleanImagePath),
          path.join(__dirname, '..', cleanImagePath),
          path.join(__dirname, '..', '..', cleanImagePath)
        ].filter(Boolean);

        let absoluteImagePath = null;
        for (const p of possiblePaths) {
          logToFile(`🔎 Checando arquivo: ${p}`);
          if (fs.existsSync(p)) {
            absoluteImagePath = p;
            break;
          }
        }

        if (!absoluteImagePath) {
          throw new Error(`Arquivo de imagem não encontrado em nenhuma das pastas do servidor! Caminho original: ${imagePath}`);
        }
        
        logToFile(`📁 Imagem válida encontrada em: ${absoluteImagePath}`);

        if (isWindows) {
          logToFile(`📋 Disparando PowerShell para copiar a imagem...`);
          try {
            const psCommand = `powershell -command "Add-Type -AssemblyName System.Windows.Forms; Add-Type -AssemblyName System.Drawing; [System.Windows.Forms.Clipboard]::SetImage([System.Drawing.Image]::FromFile('${absoluteImagePath.replace(/\\/g, '\\\\')}'))"`;
            execSync(psCommand);
            logToFile(`📋 PowerShell retornou com sucesso!`);
          } catch (err) {
            logToFile(`⚠️ Falha do PowerShell: ${err.message}. Tentando via input de arquivo...`);
            await uploadViaInput(page, absoluteImagePath);
          }

          await new Promise(r => setTimeout(r, 1000));

          logToFile(`📋 Injetando Ctrl+V...`);
          await page.keyboard.down('Control');
          await page.keyboard.press('V');
          await page.keyboard.up('Control');
        } else {
          logToFile(`📎 Sistema Linux/Docker detectado. Usando upload via input de arquivo...`);
          await uploadViaInput(page, absoluteImagePath);
        }

        logToFile(`⏳ Aguardando pré-visualização carregar...`);
        await new Promise(r => setTimeout(r, 4000)); 

        logToFile(`✍️ Escrevendo a legenda...`);
        if (message) {
          await page.keyboard.type(message, { delay: 50 });
        }
      } else {
        logToFile(`✍️ Sem imagem. Escrevendo mensagem apenas texto...`);
        if (message) {
           await page.keyboard.type(message, { delay: 50 });
        }
      }

      logToFile(`🚀 Apertando Enter...`);
      await new Promise(r => setTimeout(r, 1000));
      await page.keyboard.press('Enter');

      logToFile(`✅ Mensagem disparada. Aguardando processamento da rede...`);
      await new Promise(r => setTimeout(r, 5000));

      logToFile(`🛑 Fechando o navegador...`);
      await browser.close();
      logToFile(`✅ FIM DA TAREFA COM SUCESSO.`);
      return { success: true };

    } catch (error) {
      logToFile(`🚨 ERRO CRÍTICO CAPTURADO: ${error.message}`);
      
      if (browser) {
          try {
              const pages = await browser.pages();
              if (pages.length > 0) {
                  const screenshotPath = path.join(__dirname, '..', 'rpa-screenshot.png');
                  await pages[0].screenshot({ path: screenshotPath });
                  logToFile(`📸 Screenshot de erro salvo em: ${screenshotPath}`);
              }
          } catch (e) {
              logToFile(`⚠️ Falha ao tirar screenshot: ${e.message}`);
          }
      }

      logToFile(`⏳ Aguardando 5 segundos antes de abortar o navegador...`);
      await new Promise(r => setTimeout(r, 5000));
      if (browser) await browser.close();
      logToFile(`☠️ Navegador abortado.`);
      return { success: false, error: error.message };
    }
  }

  async connectSession() {
    logToFile(`🤖 Iniciando sessão interativa para conexão do RPA...`);
    let browser = null;
    try {
      const isWindows = process.platform === 'win32';
      // Usa a pasta data central configurada pelo sistema (independente de ambiente)
      const sessionPath = path.join(path.dirname(config.dbPath), 'whatsapp-session-rpa');
      
      logToFile(`📂 Sessão do Chrome configurada em: ${sessionPath}`);

      // Mata TODOS os processos Chromium órfãos antes de iniciar
      if (!isWindows) {
        try {
          execSync('pkill -f chromium || true', { timeout: 5000 });
          logToFile(`🔪 Processos Chromium órfãos encerrados.`);
          // Aguarda encerramento completo
          await new Promise(r => setTimeout(r, 2000));
        } catch (e) {
          logToFile(`⚠️ pkill chromium: ${e.message}`);
        }
      }

      // Limpa TODOS os arquivos de trava do Chromium (incluindo links simbólicos quebrados comuns no Docker)
      const lockFiles = ['SingletonLock', 'SingletonSocket', 'SingletonCookie'];
      for (const lockFile of lockFiles) {
        const lockFilePath = path.join(sessionPath, lockFile);
        try {
          fs.unlinkSync(lockFilePath);
          logToFile(`♻️ Trava ${lockFile} removida com sucesso.`);
        } catch (err) {
          if (err.code !== 'ENOENT') {
            logToFile(`⚠️ Falha ao remover ${lockFile}: ${err.message}`);
          }
        }
      }

      let executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || undefined;
      if (!isWindows && !executablePath) {
        const commonPaths = ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome'];
        for (const p of commonPaths) {
            if (fs.existsSync(p)) {
                executablePath = p;
                break;
            }
        }
      }

      const launchOptions = {
        headless: isWindows ? false : true,
        executablePath: executablePath,
        userDataDir: sessionPath,
        defaultViewport: null,
        dumpio: true, // Redireciona a saída do Chromium para os logs gerais do container
        args: [
          '--start-maximized',
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-software-rasterizer'
        ]
      };

      browser = await puppeteer.launch(launchOptions);
      // Pequeno delay para inicializar o frame principal no Docker
      await new Promise(r => setTimeout(r, 2000));

      const page = await browser.newPage();
      // Pequeno delay para garantir que o frame da página foi criado
      await new Promise(r => setTimeout(r, 1000));
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      
      await page.goto('https://web.whatsapp.com', { waitUntil: 'domcontentloaded', timeout: 60000 });
      
      const screenshotPath = path.join(__dirname, '..', 'rpa-screenshot.png');
      
      // Loop de 3 minutos para permitir o escaneamento do QR Code
      const maxSeconds = 180;
      let connected = false;
      
      for (let i = 0; i < maxSeconds; i += 5) {
        if (!browser || !page) break;
        
        // Tira o screenshot atual
        await page.screenshot({ path: screenshotPath });
        logToFile(`📸 Screenshot atualizado (${i}s). Verifique em /api/whatsapp/rpa-screenshot`);
        
        // Verifica se a tela inicial ou barra de pesquisa está disponível (logado)
        const loggedIn = await page.evaluate(() => {
          return !!document.querySelector('span[data-icon="chat"]') || 
                 !!document.querySelector('span[data-icon="search"]') ||
                 !!document.querySelector('div[contenteditable="true"]');
        });
        
        if (loggedIn) {
          logToFile(`✅ RPA Conectado com sucesso! Sessão salva em ${sessionPath}`);
          connected = true;
          await page.screenshot({ path: screenshotPath });
          break;
        }
        
        await new Promise(r => setTimeout(r, 5000));
      }
      
      await browser.close();
      return { success: connected, error: connected ? null : 'Tempo limite de 3 minutos esgotado' };
    } catch (error) {
      logToFile(`🚨 Erro na conexão do RPA: ${error.message}`);
      if (browser) await browser.close();
      return { success: false, error: error.message };
    }
  }
}

module.exports = new RpaWhatsappService();
