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

/**
 * RPA WhatsApp Service
 * Responsável por automatizar o envio de mensagens para Grupos no WhatsApp Web usando Puppeteer.
 */

class RpaWhatsappService {
  async sendGroupMessage(groupName, message, imagePath = null) {
    logToFile(`🤖 Iniciando RPA - Alvo: "${groupName}", Imagem: ${imagePath ? 'Sim' : 'Não'}`);
    let browser = null;

    try {
      const os = require('os');
      const sessionPath = path.join(os.homedir(), '.belafarma', 'whatsapp-session-rpa');
      logToFile(`📂 Sessão do Chrome configurada em: ${sessionPath}`);

      browser = await puppeteer.launch({
        headless: false,
        userDataDir: sessionPath,
        defaultViewport: null,
        args: ['--start-maximized']
      });

      logToFile(`🌐 Browser lançado com sucesso. Abrindo nova página...`);
      const page = await browser.newPage();
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

        logToFile(`📋 Disparando PowerShell para copiar a imagem...`);
        try {
          const psCommand = `powershell -command "Add-Type -AssemblyName System.Windows.Forms; Add-Type -AssemblyName System.Drawing; [System.Windows.Forms.Clipboard]::SetImage([System.Drawing.Image]::FromFile('${absoluteImagePath.replace(/\\/g, '\\\\')}'))"`;
          execSync(psCommand);
          logToFile(`📋 PowerShell retornou com sucesso!`);
        } catch (err) {
          throw new Error('Falha do PowerShell: ' + err.message);
        }

        await new Promise(r => setTimeout(r, 1000));

        logToFile(`📋 Injetando Ctrl+V...`);
        await page.keyboard.down('Control');
        await page.keyboard.press('V');
        await page.keyboard.up('Control');

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
      logToFile(`⏳ Aguardando 15 segundos antes de abortar o navegador...`);
      await new Promise(r => setTimeout(r, 15000));
      if (browser) await browser.close();
      logToFile(`☠️ Navegador abortado.`);
      return { success: false, error: error.message };
    }
  }
}

module.exports = new RpaWhatsappService();
