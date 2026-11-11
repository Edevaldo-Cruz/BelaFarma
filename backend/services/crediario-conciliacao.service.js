/**
 * backend/services/crediario-conciliacao.service.js
 *
 * Módulo de Conciliação e Baixa Automática do Crediário 2.0 (Banco Inter)
 * Suporta:
 * 1. Processamento de Webhook em tempo real (notificação imediata do Banco Inter)
 * 2. Varredura e Conciliação Ativa periódica (polling a cada 30 minutos ou sob demanda)
 * 3. Restituição instantânea do limite de crédito e desbloqueio do cliente
 * 4. Notificação automática de confirmação de pagamento via WhatsApp (Baileys)
 */

const cron = require('node-cron');
const bancoInterService = require('./banco-inter.service');

function sanitizePhone(phone) {
  if (!phone) return '';
  return String(phone).replace(/\D/g, '');
}

function formatCurrency(val) {
  return Number(val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * Liquida a fatura, restaura o limite e envia WhatsApp de confirmação
 */
async function liquidarFatura(db, invoice, valorPago, dataHoraPagamento = null, canal = 'BANCO_INTER') {
  const paidAt = dataHoraPagamento || new Date().toISOString().replace('T', ' ').substring(0, 19);
  const valorFinal = Number(valorPago || invoice.total_due || 0);

  const card = db.prepare('SELECT * FROM belafarma_cards WHERE id = ?').get(invoice.card_id);
  if (!card) {
    throw new Error(`Cartão com ID ${invoice.card_id} não encontrado para a fatura ${invoice.id}.`);
  }

  // 1. Transação atômica no banco SQLite
  const execTx = db.transaction(() => {
    // Atualiza fatura
    db.prepare(`
      UPDATE card_invoices
      SET paid_amount = ?,
          paid_at = ?,
          status = 'paid',
          updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `).run(valorFinal, paidAt, invoice.id);

    // Restitui limite utilizado e desbloqueia cliente
    const novoLimiteUsado = Math.max(0, Number((card.used_limit - valorFinal).toFixed(2)));
    db.prepare(`
      UPDATE belafarma_cards
      SET used_limit = ?,
          status = 'active',
          updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `).run(novoLimiteUsado, card.id);

    return { novoLimiteUsado };
  });

  const resTx = execTx();
  const novoLimiteDisponivel = Math.max(0, Number((card.credit_limit - resTx.novoLimiteUsado).toFixed(2)));

  console.log(`🎉 [Conciliação Inter] Fatura ${invoice.id} liquidada com sucesso! Valor: ${formatCurrency(valorFinal)} | Limite liberado: ${formatCurrency(novoLimiteDisponivel)}`);

  // 2. Disparo de WhatsApp de agradecimento e confirmação
  try {
    const baileys = require('../baileys-service');
    if (card.phone && baileys && typeof baileys.sendText === 'function') {
      const cleanPhone = sanitizePhone(card.phone);
      const msg = `🎉 *Pagamento Confirmado com Sucesso! - BelaFarma*\n\n` +
        `Olá, *${card.customer_name.split(' ')[0]}*! Recebemos a confirmação do pagamento de *${formatCurrency(valorFinal)}* referente à sua fatura de *${invoice.reference_month}*.\n\n` +
        `🔒 *Seu Crediário está 100% liberado!*\n` +
        `💳 *Limite Disponível Agora:* ${formatCurrency(novoLimiteDisponivel)}\n\n` +
        `Muito obrigado pela preferência e parceria de sempre! Conte sempre com a BelaFarma! 💚`;

      await baileys.sendText(cleanPhone, msg);
      console.log(`📲 [Conciliação Inter] WhatsApp de confirmação enviado para ${card.customer_name} (${cleanPhone}).`);
    }
  } catch (errWpp) {
    console.warn('[Conciliação Inter] Aviso: Não foi possível enviar WhatsApp de confirmação:', errWpp.message);
  }

  return {
    success: true,
    liquidada: true,
    invoiceId: invoice.id,
    cardId: card.id,
    valorPago: valorFinal,
    novoLimiteUsado: resTx.novoLimiteUsado,
    novoLimiteDisponivel
  };
}

/**
 * Processa notificação recebida pelo Webhook do Banco Inter
 */
async function processarWebhookPayload(db, payload) {
  console.log('📥 [Webhook Banco Inter] Notificação recebida:', JSON.stringify(payload));

  // Banco Inter pode enviar objeto único ou array de notificações
  const eventos = Array.isArray(payload) ? payload : [payload];
  const resultados = [];

  for (const evento of eventos) {
    const nossoNumero = evento.nossoNumero || evento.codigoBarras;
    const seuNumero = evento.seuNumero;
    const situacao = (evento.situacao || evento.status || '').toUpperCase();
    const valorRecebido = Number(evento.valorTotalRecebido || evento.valorRecebido || evento.valorNominal || 0);
    const dataHora = evento.dataHoraSituacao || evento.dataSituacao;

    if (!nossoNumero && !seuNumero) {
      console.warn('⚠️ [Webhook Banco Inter] Evento ignorado (sem nossoNumero/seuNumero).');
      continue;
    }

    // Buscar fatura correspondente
    let invoice = null;
    if (nossoNumero) {
      invoice = db.prepare('SELECT * FROM card_invoices WHERE boleto_id = ?').get(nossoNumero);
    }
    if (!invoice && seuNumero) {
      invoice = db.prepare('SELECT * FROM card_invoices WHERE id = ?').get(seuNumero);
    }

    if (!invoice) {
      console.warn(`⚠️ [Webhook Banco Inter] Fatura não localizada para NossoNúmero: ${nossoNumero} / SeuNúmero: ${seuNumero}`);
      continue;
    }

    if (invoice.status === 'paid') {
      console.log(`ℹ️ [Webhook Banco Inter] Fatura ${invoice.id} já se encontra quitada.`);
      resultados.push({ invoiceId: invoice.id, status: 'already_paid' });
      continue;
    }

    // Verificar se o status indica liquidação
    const isLiquidado = ['PAGO', 'RECEBIDO', 'LIQUIDADO', 'COMPENSADO'].some(s => situacao.includes(s));
    if (isLiquidado) {
      const resLiq = await liquidarFatura(db, invoice, valorRecebido || invoice.total_due, dataHora, 'WEBHOOK_INTER');
      resultados.push(resLiq);
    } else {
      console.log(`ℹ️ [Webhook Banco Inter] Situação "${situacao}" da fatura ${invoice.id} não requer baixa.`);
      resultados.push({ invoiceId: invoice.id, status: situacao });
    }
  }

  return resultados;
}

/**
 * Varredura ativa periódica: consulta todas as faturas em aberto com boleto emitido no Banco Inter
 */
async function executarConciliacaoAtiva(db) {
  console.log('🔄 [Conciliação Inter] Iniciando varredura ativa de boletos pendentes...');

  // Busca faturas fechadas que possuem boleto gerado e ainda não foram quitadas
  const faturasPendentes = db.prepare(`
    SELECT i.*, c.customer_name, c.phone
    FROM card_invoices i
    JOIN belafarma_cards c ON i.card_id = c.id
    WHERE i.boleto_id IS NOT NULL AND i.status != 'paid'
    ORDER BY i.due_date ASC
  `).all();

  console.log(`🔎 [Conciliação Inter] ${faturasPendentes.length} faturas com boleto pendentes para verificação.`);

  const relatorio = {
    totalVerificadas: faturasPendentes.length,
    totalLiquidadas: 0,
    totalValorRecebido: 0,
    permanecemAbertas: 0,
    erros: []
  };

  for (const inv of faturasPendentes) {
    try {
      const dadosInter = await bancoInterService.consultarCobranca(inv.boleto_id);
      const situacao = (dadosInter.situacao || dadosInter.status || '').toUpperCase();
      const valorRecebido = Number(dadosInter.valorTotalRecebido || dadosInter.valorRecebido || inv.total_due || 0);

      const isPago = ['PAGO', 'RECEBIDO', 'LIQUIDADO', 'COMPENSADO'].some(s => situacao.includes(s));

      if (isPago) {
        await liquidarFatura(db, inv, valorRecebido, dadosInter.dataHoraSituacao, 'CONCILIACAO_ATIVA');
        relatorio.totalLiquidadas++;
        relatorio.totalValorRecebido = Number((relatorio.totalValorRecebido + valorRecebido).toFixed(2));
      } else {
        relatorio.permanecemAbertas++;
      }
    } catch (errConsulta) {
      console.warn(`[Conciliação Inter] Falha ao consultar cobrança ${inv.boleto_id}:`, errConsulta.message);
      relatorio.erros.push(`${inv.id}: ${errConsulta.message}`);
    }
  }

  console.log('✅ [Conciliação Inter] Varredura concluída:', JSON.stringify(relatorio));
  return relatorio;
}

/**
 * Inicializa o cron de conciliação automática a cada 30 minutos
 */
function initCrediarioConciliacao(db) {
  try {
    cron.schedule('*/30 * * * *', () => {
      executarConciliacaoAtiva(db).catch(err => {
        console.error('[Conciliação Inter Cron] Erro:', err.message);
      });
    });
    console.log('⏰ [Conciliação Inter] Polling automático agendado a cada 30 minutos.');
  } catch (e) {
    console.warn('Aviso ao registrar cron de conciliação:', e.message);
  }

  return {
    executarConciliacaoAtiva: () => executarConciliacaoAtiva(db),
    processarWebhookPayload: (payload) => processarWebhookPayload(db, payload),
    liquidarFatura: (invoice, valorPago, dataHora) => liquidarFatura(db, invoice, valorPago, dataHora)
  };
}

module.exports = {
  initCrediarioConciliacao,
  executarConciliacaoAtiva,
  processarWebhookPayload,
  liquidarFatura
};
