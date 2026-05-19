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
const messageSender = require('./message-sender.service');

async function uploadViaInput(page, imagePath) {
  try {
    logToFile(`📎 Localizando o input de fotos e vídeos diretamente no DOM (accept*="video")...`);
    const fileInput = await page.waitForSelector('input[accept*="video"]', { timeout: 12000 });
    await fileInput.uploadFile(imagePath);
    logToFile(`✅ Upload do arquivo de imagem executado com sucesso!`);
    return true;
  } catch (e) {
    logToFile(`🚨 Erro ao fazer upload via input: ${e.message}`);
    return false;
  }
}

/**
 * RPA WhatsApp Service
 * Responsável por automatizar o envio de mensagens para Grupos no WhatsApp Web usando Puppeteer.
 */

class RpaWhatsappService {
  async sendGroupMessage(groupName, message, imagePath = null) {
    logToFile(`🤖 [RPA-Upgrade] Iniciando envio via Evolution API - Alvo: "${groupName}", Imagem: ${imagePath ? 'Sim' : 'Não'}`);
    
    try {
      // 1. Identifica o JID do grupo
      let jid = groupName;
      
      // Se não for um JID válido (@g.us), busca na lista de grupos da Evolution API pelo nome
      if (typeof groupName === 'string' && !groupName.includes('@g.us')) {
        logToFile(`🔍 Buscando JID do grupo "${groupName}" na Evolution API...`);
        const groups = await messageSender.fetchGroups();
        const found = groups.find(g => g.subject === groupName || g.id === groupName);
        if (found) {
          jid = found.id;
          logToFile(`🎯 JID localizado com sucesso: ${jid}`);
        } else {
          // Se não achar por nome na Evolution API, vamos fazer o fallback de manter o nome (e tentar a API mesmo assim ou dar erro)
          logToFile(`⚠️ Grupo "${groupName}" não encontrado na lista da Evolution API. Tentando enviar com "${groupName}"...`);
        }
      }

      // 2. Transforma o caminho da imagem se necessário
      let finalMediaPath = null;
      if (imagePath) {
        const cleanImagePath = imagePath.replace(/^\//, ''); 
        const possiblePaths = [
          path.isAbsolute(imagePath) ? imagePath : null,
          path.join(__dirname, '..', 'public', cleanImagePath),
          path.join(__dirname, '..', '..', 'public', cleanImagePath),
          path.join(__dirname, '..', cleanImagePath),
          path.join(__dirname, '..', '..', cleanImagePath)
        ].filter(Boolean);

        for (const p of possiblePaths) {
          if (fs.existsSync(p)) {
            finalMediaPath = p;
            break;
          }
        }

        if (!finalMediaPath) {
          throw new Error(`Arquivo de imagem não encontrado no servidor! Caminho original: ${imagePath}`);
        }
        logToFile(`📁 Imagem válida localizada: ${finalMediaPath}`);
      }

      // 3. Executa o disparo usando a Evolution API
      let result;
      if (finalMediaPath) {
        logToFile(`📤 Enviando mídia via Evolution API para ${jid}...`);
        result = await messageSender.sendMediaMessage(jid, message, finalMediaPath);
      } else {
        logToFile(`📤 Enviando texto via Evolution API para ${jid}...`);
        result = await messageSender.sendMessage(jid, message);
      }

      if (result.success) {
        logToFile(`✅ Mensagem de grupo disparada com sucesso via Evolution API!`);
        return { success: true };
      } else {
        throw new Error(result.error || 'Erro desconhecido na Evolution API');
      }

    } catch (error) {
      logToFile(`🚨 ERRO NO ENVIO VIA EVOLUTION API: ${error.message}`);
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

      // Limpa TODA a pasta de sessão antiga para garantir que não haja arquivos corrompidos ou travas persistentes
      try {
        fs.rmSync(sessionPath, { recursive: true, force: true });
        logToFile(`🧹 Pasta de sessão corrompida/antiga removida com sucesso para nova conexão.`);
      } catch (err) {
        logToFile(`⚠️ Falha ao limpar pasta de sessão: ${err.message}`);
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
