/**
 * robo-analisar-ofertas-whatsapp-hoje.js
 * Robô RPA Visual (Puppeteer + Gemini Vision OCR) para varrer mensagens e imagens/encartes
 * do dia de hoje no WhatsApp Web, extrair ofertas comerciais e cruzar com necessidades de 21 dias.
 */

const puppeteer = require('puppeteer');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const db = require('./database');
const belinhaComprasService = require('./services/belinha-compras.service');
const comprasMineracaoService = require('./services/compras-mineracao.service');

async function executarVarreduraVisualHoje() {
  console.log('======================================================================');
  console.log('🤖 ROBÔ RPA WHATSAPP COMERCIAL: LEITURA DE TEXTOS E IMAGENS DO DIA 🤖');
  console.log('======================================================================');

  const sessionDir = path.join(__dirname, 'whatsapp-session-rpa');
  const browser = await puppeteer.launch({
    headless: false,
    userDataDir: sessionDir,
    defaultViewport: null,
    args: ['--start-maximized', '--no-sandbox']
  });

  try {
    const pages = await browser.pages();
    const page = pages[0] || (await browser.newPage());
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    );

    console.log('🌐 Abrindo https://web.whatsapp.com ...');
    await page.goto('https://web.whatsapp.com', { waitUntil: 'domcontentloaded', timeout: 60000 });

    console.log('⏳ Aguardando login no WhatsApp Web (se aparecer o QR Code na janela aberta, escaneie pelo celular)...');
    await page.waitForFunction(
      () => Boolean(document.querySelector('#pane-side') || document.querySelector('[aria-label="Lista de conversas"]')),
      { timeout: 180000 }
    );

    console.log('✅ WhatsApp Web conectado! Aguardando 5s para sincronizar conversas de hoje...');
    await new Promise(r => setTimeout(r, 5000));

    // Coleta os primeiros 25 chats visíveis na lateral (priorizando os de hoje / com horário HH:MM)
    const chatsHoje = await page.evaluate(() => {
      const pane = document.querySelector('#pane-side');
      if (!pane) return [];
      const rows = Array.from(pane.querySelectorAll('[role="listitem"], [role="row"]'));
      const list = [];
      for (const row of rows) {
        const text = (row.innerText || '').trim();
        if (!text) continue;
        const lines = text.split('\n').map(s => s.trim()).filter(Boolean);
        const titleEl = row.querySelector('span[title]');
        const nome = titleEl ? titleEl.getAttribute('title') : lines[0];
        // Verifica se tem horário de hoje (ex: 08:30, 11:45, Hoje)
        const temHorarioHoje = lines.some(l => /^\d{1,2}:\d{2}$/.test(l) || /^hoje$/i.test(l));
        const rect = row.getBoundingClientRect();
        if (nome && rect.height > 0 && temHorarioHoje) {
          list.push({ nome, lines });
        }
      }
      return list.slice(0, 20);
    });

    console.log(`📋 Conversas ativas hoje encontradas: ${chatsHoje.length}`);

    let totalTextosProcessados = 0;
    let totalImagensProcessadas = 0;

    for (const chat of chatsHoje) {
      console.log(`\n----------------------------------------------------------------------`);
      console.log(`📂 Abrindo conversa: ${chat.nome}`);

      const clicked = await page.evaluate((targetName) => {
        const spans = Array.from(document.querySelectorAll('#pane-side span[title]'));
        const el = spans.find(s => s.getAttribute('title') === targetName);
        if (el) {
          el.click();
          return true;
        }
        return false;
      }, chat.nome);

      if (!clicked) continue;
      await new Promise(r => setTimeout(r, 2500));

      // Extrair mensagens de texto e imagens (blob:) carregadas na conversa aberta
      const dadosConversa = await page.evaluate(async () => {
        const main = document.querySelector('#main');
        if (!main) return { textos: [], imagens: [] };

        const msgNodes = Array.from(main.querySelectorAll('.message-in, [data-id^="false_"]'));
        const ultimasNodes = msgNodes.slice(-20);

        const textos = [];
        const imagens = [];

        for (const node of ultimasNodes) {
          const dataId = node.getAttribute('data-id') || `rpa_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
          const txtEl = node.querySelector('.selectable-text.copyable-text');
          const txt = txtEl ? (txtEl.innerText || '').trim() : '';

          if (txt && txt.length >= 10) {
            textos.push({ id: dataId, texto: txt });
          }

          // Procura imagens de encartes/tabelas dentro da mensagem recebida
          const imgs = Array.from(node.querySelectorAll('img[src^="blob:"], img[src^="data:image"]'));
          for (const img of imgs) {
            if (img.width < 120 || img.height < 120) continue; // ignora avatares/emojis
            try {
              const resp = await fetch(img.src);
              const blob = await resp.blob();
              const base64 = await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.readAsDataURL(blob);
              });
              if (base64) {
                imagens.push({
                  id: `${dataId}_img_${imagens.length}`,
                  base64,
                  mimeType: blob.type || 'image/jpeg',
                  caption: txt || ''
                });
              }
            } catch (e) {}
          }
        }

        return { textos, imagens };
      });

      console.log(`   💬 Textos comerciais capturados: ${dadosConversa.textos.length} | 🖼️ Imagens/Encartes: ${dadosConversa.imagens.length}`);

      // Processar textos
      for (const itemTxt of dadosConversa.textos) {
        try {
          await belinhaComprasService.processarMensagemComercial({
            messageId: itemTxt.id,
            remoteJid: `${chat.nome}@s.whatsapp.net`,
            phone: chat.nome,
            pushName: chat.nome,
            text: itemTxt.texto,
            db
          });
          await comprasMineracaoService.processarMensagemRecebida({
            id: itemTxt.id,
            messageId: itemTxt.id,
            remoteJid: `${chat.nome}@s.whatsapp.net`,
            phone: chat.nome,
            contactName: chat.nome,
            text: itemTxt.texto,
            mediaType: 'texto',
            timestamp: Date.now()
          }, db);
          totalTextosProcessados++;
        } catch (err) {
          console.warn(`   ⚠️ Aviso ao minerar texto de ${chat.nome}:`, err.message);
        }
      }

      // Processar imagens via Gemini Vision (Belinha Compras Multimodal)
      for (const itemImg of dadosConversa.imagens) {
        try {
          const cleanB64 = itemImg.base64.replace(/^data:[^;]+;base64,/, '');
          const buffer = Buffer.from(cleanB64, 'base64');
          console.log(`   🧠 Analisando imagem/encarte de "${chat.nome}" via Gemini Vision OCR...`);
          const resImg = await belinhaComprasService.processarMensagemComercial({
            messageId: itemImg.id,
            remoteJid: `${chat.nome}@s.whatsapp.net`,
            phone: chat.nome,
            pushName: chat.nome,
            buffer,
            mimeType: itemImg.mimeType,
            caption: itemImg.caption,
            db
          });
          console.log(`   ✅ Imagem processada! Ofertas extraídas: ${resImg?.ofertasExtraidas || 0} | Salvas no Radar: ${resImg?.ofertasPersistidas || 0}`);
          totalImagensProcessadas++;
        } catch (err) {
          console.warn(`   ⚠️ Aviso ao analisar imagem de ${chat.nome}:`, err.message);
        }
      }
    }

    console.log('\n======================================================================');
    console.log(`🏁 VARREDURA CONCLUÍDA! Textos: ${totalTextosProcessados} | Imagens/Encartes: ${totalImagensProcessadas}`);
    console.log('======================================================================');
  } catch (err) {
    console.error('❌ Erro durante a varredura visual do WhatsApp:', err.message);
  } finally {
    await browser.close();
  }
}

if (require.main === module) {
  executarVarreduraVisualHoje();
}

module.exports = { executarVarreduraVisualHoje };
