/**
 * Belinha ERP - Express Endpoints for Network Thermal Printer
 * Rotas para envio de impressão por qualquer computador da rede e captura pelo terminal do Caixa.
 */

const express = require('express');
const router = express.Router();

const {
  obterConfiguracaoImpressora,
  salvarConfiguracaoImpressora,
  enfileirarJobImpressao,
  obterJobsPendentes,
  marcarJobConcluido,
  marcarJobErro
} = require('./services/printer.service');

// 1. Obtém as configurações da impressora
router.get('/settings', (req, res) => {
  try {
    const config = obterConfiguracaoImpressora();
    res.json({ success: true, data: config });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. Salva as configurações da impressora
router.post('/settings', (req, res) => {
  try {
    const updated = salvarConfiguracaoImpressora(req.body);
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// 3. Enfileira um novo cupom para impressão (chamado por qualquer PC na rede)
router.post('/print', async (req, res) => {
  try {
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    const userName = req.headers['x-user-name'] || req.body.origin_user || 'Terminal Balcão';

    const result = await enfileirarJobImpressao({
      title: req.body.title || 'Cupom BelaFarma',
      html_content: req.body.html_content || req.body.html,
      raw_text: req.body.raw_text,
      print_type: req.body.print_type || 'CUPOM_VENDA',
      sale_id: req.body.sale_id,
      origin_ip: clientIp,
      origin_user: userName
    });

    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// 4. O Computador do Caixa busca os cupons pendentes para imprimir
router.get('/queue/pending', (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 5;
    const jobs = obterJobsPendentes(limit);
    res.json({ success: true, count: jobs.length, data: jobs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5. O Computador do Caixa confirma que o cupom foi impresso
router.post('/queue/:id/done', (req, res) => {
  try {
    const result = marcarJobConcluido(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// 6. Notifica falha na impressão
router.post('/queue/:id/error', (req, res) => {
  try {
    const result = marcarJobErro(req.params.id, req.body.error || 'Erro desconhecido ao imprimir');
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// 7. Cupom de teste de rede
router.post('/test', async (req, res) => {
  try {
    const now = new Date();
    const dataHoraStr = `${now.toLocaleDateString('pt-BR')} ${now.toLocaleTimeString('pt-BR')}`;
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'Local';
    const clientUser = req.body.user_name || 'Terminal Balcão';

    const testHtml = `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="utf-8">
        <title>Teste de Impressão de Rede</title>
        <style>
          @page { size: 80mm auto; margin: 0; }
          * { box-sizing: border-box; margin: 0; padding: 0; color: #000000 !important; }
          body {
            width: 72mm;
            max-width: 72mm;
            margin: 0 auto;
            padding: 4mm 2mm 12mm 2mm;
            font-family: 'Segoe UI', Arial, sans-serif;
            font-size: 13px;
            font-weight: 700;
            line-height: 1.35;
          }
          .center { text-align: center; }
          .bold { font-weight: 900; }
          .sep { border-top: 1.5px dashed #000000; margin: 6px 0; }
          .double-sep { border-top: 2.5px solid #000000; margin: 6px 0; }
          .info-row { display: flex; justify-content: space-between; margin-bottom: 2px; }
        </style>
      </head>
      <body>
        <div class="center bold" style="font-size: 15px;">DROGARIA BELA FARMA</div>
        <div class="center" style="font-size: 11px;">REDE DE IMPRESSÃO TÉRMICA</div>
        <div class="double-sep"></div>
        <div class="center bold" style="font-size: 14px;">TESTE DE REDE OK!</div>
        <div class="sep"></div>
        <div class="info-row"><span>Data/Hora:</span><span>${dataHoraStr}</span></div>
        <div class="info-row"><span>Terminal Origem:</span><span>${clientUser}</span></div>
        <div class="info-row"><span>IP Origem:</span><span style="font-size: 10px;">${clientIp}</span></div>
        <div class="info-row"><span>Destino:</span><span>Bematech MP-4200 TH</span></div>
        <div class="sep"></div>
        <div class="center" style="font-size: 11px;">
          Qualquer computador da farmácia agora imprime nesta impressora térmica!
        </div>
        <div class="double-sep"></div>
        <div class="center" style="font-size: 10px; margin-top: 4px;">BELINHA ERP - AUTONOMOUS PRINT</div>
      </body>
      </html>
    `;

    const result = await enfileirarJobImpressao({
      title: 'Teste de Impressão de Rede',
      html_content: testHtml,
      raw_text: 'DROGARIA BELA FARMA - TESTE DE REDE OK',
      print_type: 'TESTE',
      origin_ip: clientIp,
      origin_user: clientUser
    });

    res.json({
      success: true,
      message: 'Comprovante de teste enviado para a Bematech no Caixa!',
      ...result
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
