/**
 * backend/services/crediario-cron.service.js
 *
 * Serviço de Automação e Régua de Cobrança do Crediário 2.0 BelaFarma
 * Executado diariamente às 09:00 para:
 * 1. Fechamento de Faturas (D-10) -> Emissão de Boleto/Pix e envio de extrato
 * 2. Lembrete no dia do Vencimento (Dia 10 e 20)
 * 3. Lembretes amigáveis de atraso em D+1 e D+3
 * 4. Bloqueio automático e notificação de suspensão em D+5
 */

const cron = require('node-cron');
const bancoInterService = require('./banco-inter.service');

function initCrediarioCron(db) {
  function sanitizePhone(phone) {
    if (!phone) return '';
    return String(phone).replace(/\D/g, '');
  }

  function formatCurrency(val) {
    return Number(val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  async function executarReguaDiaria() {
    console.log('⏰ [Crediário 2.0 Cron] Iniciando varredura diária da régua de crédito...');
    const today = new Date().toISOString().split('T')[0];

    let baileys;
    try {
      baileys = require('../baileys-service');
    } catch (e) {
      console.warn('⚠️ [Crediário 2.0 Cron] Baileys não disponível:', e.message);
    }

    const relatorio = {
      faturasFechadas: 0,
      lembretesVencimento: 0,
      lembretesAtraso: 0,
      bloqueiosD5: 0,
      boletosEmitidos: 0,
      erros: []
    };

    // ──────────────────────────────────────────────────────────
    // 1. FECHAMENTO DE FATURAS (D-10)
    // ──────────────────────────────────────────────────────────
    try {
      const faturasParaFechar = db.prepare(`
        SELECT i.*, c.customer_name, c.phone, c.cpf, c.id as card_id
        FROM card_invoices i
        JOIN belafarma_cards c ON i.card_id = c.id
        WHERE i.closing_date <= ? AND i.status = 'open' AND i.total_due > 0
      `).all(today);

      for (const inv of faturasParaFechar) {
        try {
          // Se o cliente tiver CPF e ainda não tiver boleto, tenta emitir no Banco Inter
          let nossoNumero = inv.boleto_id;
          let pixCopiaCola = inv.pix_copia_cola;

          if (inv.cpf && !inv.boleto_id) {
            try {
              const cust = inv.customer_id ? db.prepare('SELECT * FROM customers WHERE id = ?').get(inv.customer_id) : null;
              const saldoAPagar = Number((inv.total_due - inv.paid_amount).toFixed(2));
              const resInter = await bancoInterService.emitirBoletoHibrido({
                seuNumero: inv.id.replace(/\W/g, '').substring(0, 15),
                valor: saldoAPagar,
                dataVencimento: inv.due_date,
                cliente: {
                  nome: inv.customer_name,
                  cpf: inv.cpf,
                  telefone: inv.phone,
                  endereco: cust?.address || 'Área Urbana',
                  bairro: cust?.neighborhood || 'Centro',
                  cidade: 'Muriaé',
                  uf: 'MG',
                  cep: '36880000'
                }
              });

              nossoNumero = resInter.nossoNumero || resInter.codigoBarras;
              pixCopiaCola = resInter.pixCopiaECola;
              relatorio.boletosEmitidos++;
            } catch (errBoleto) {
              console.warn(`[Crediário 2.0 Cron] Não foi possível emitir boleto Inter para ${inv.customer_name}:`, errBoleto.message);
            }
          }

          db.prepare(`
            UPDATE card_invoices
            SET status = 'closed',
                boleto_id = COALESCE(?, boleto_id),
                pix_copia_cola = COALESCE(?, pix_copia_cola),
                updated_at = datetime('now', 'localtime')
            WHERE id = ?
          `).run(nossoNumero, pixCopiaCola, inv.id);

          relatorio.faturasFechadas++;

          // Disparo no WhatsApp do fechamento
          if (inv.phone && baileys && typeof baileys.sendText === 'function') {
            const cleanPhone = sanitizePhone(inv.phone);
            const [ano, mes, dia] = inv.due_date.split('-');
            const saldoRestante = Number((inv.total_due - inv.paid_amount).toFixed(2));
            let msg = `🧾 *Fatura BelaFarma Fechada!*\n\n` +
              `Olá, *${inv.customer_name.split(' ')[0]}*! Sua fatura do crediário fechou e vence em *${dia}/${mes}/${ano}*.\n\n` +
              `💰 *Valor Total:* R$ ${saldoRestante.toFixed(2)}\n`;

            if (pixCopiaCola) {
              msg += `⚡ *PIX Copia e Cola:*\n\`${pixCopiaCola}\`\n\n`;
            } else {
              msg += `💳 *Chave PIX (CNPJ):* \`31.144.152/0001-44\`\n\n`;
            }

            msg += `Você também pode efetuar o pagamento diretamente no caixa da farmácia. Muito obrigado! 💚`;
            await baileys.sendText(cleanPhone, msg);
          }
        } catch (eInv) {
          relatorio.erros.push(`Fechamento ${inv.id}: ${eInv.message}`);
        }
      }
    } catch (e1) {
      console.error('[Crediário 2.0 Cron] Erro no fechamento:', e1.message);
    }

    // ──────────────────────────────────────────────────────────
    // 2. LEMBRETE NO DIA DO VENCIMENTO
    // ──────────────────────────────────────────────────────────
    try {
      const vencendoHoje = db.prepare(`
        SELECT i.*, c.customer_name, c.phone
        FROM card_invoices i
        JOIN belafarma_cards c ON i.card_id = c.id
        WHERE i.due_date = ? AND i.status != 'paid' AND (i.total_due - i.paid_amount) > 0
      `).all(today);

      for (const inv of vencendoHoje) {
        try {
          if (inv.phone && baileys && typeof baileys.sendText === 'function') {
            const cleanPhone = sanitizePhone(inv.phone);
            const saldoRestante = Number((inv.total_due - inv.paid_amount).toFixed(2));
            const msg = `🔔 *Lembrete de Vencimento BelaFarma*\n\n` +
              `Olá, *${inv.customer_name.split(' ')[0]}*! Passando para lembrar que sua fatura de *R$ ${saldoRestante.toFixed(2)}* vence hoje.\n\n` +
              (inv.pix_copia_cola ? `⚡ *Pix Copia e Cola:*\n\`${inv.pix_copia_cola}\`\n\n` : `💳 *Chave Pix:* \`31.144.152/0001-44\`\n\n`) +
              `Se já efetuou o pagamento, favor desconsiderar. Tenha um ótimo dia! 💚`;
            await baileys.sendText(cleanPhone, msg);
            relatorio.lembretesVencimento++;
          }
        } catch (e) {
          relatorio.erros.push(`Vencimento ${inv.id}: ${e.message}`);
        }
      }
    } catch (e2) {
      console.error('[Crediário 2.0 Cron] Erro nos lembretes de vencimento:', e2.message);
    }

    // ──────────────────────────────────────────────────────────
    // 3. LEMBRETES DE ATRASO (D+1 E D+3)
    // ──────────────────────────────────────────────────────────
    try {
      const atrasados = db.prepare(`
        SELECT i.*, c.customer_name, c.phone,
               CAST((julianday(?) - julianday(i.due_date)) AS INTEGER) as days_late
        FROM card_invoices i
        JOIN belafarma_cards c ON i.card_id = c.id
        WHERE i.status != 'paid' AND i.due_date < ? AND (i.total_due - i.paid_amount) > 0
      `).all(today, today);

      for (const inv of atrasados) {
        try {
          const daysLate = inv.days_late;
          if (daysLate === 1 || daysLate === 3) {
            if (inv.phone && baileys && typeof baileys.sendText === 'function') {
              const cleanPhone = sanitizePhone(inv.phone);
              const saldoRestante = Number((inv.total_due - inv.paid_amount).toFixed(2));
              const msg = `⚠️ *Aviso de Fatura em Aberto - BelaFarma*\n\n` +
                `Olá, *${inv.customer_name.split(' ')[0]}*! Constatamos que sua fatura de *R$ ${saldoRestante.toFixed(2)}* venceu há ${daysLate} dia(s).\n\n` +
                `Para manter seu crediário ativo e evitar juros/multa, por favor regularize o pagamento via Pix ou no caixa da farmácia.\n\n` +
                (inv.pix_copia_cola ? `⚡ *Pix Copia e Cola:*\n\`${inv.pix_copia_cola}\`\n\n` : `💳 *Chave Pix:* \`31.144.152/0001-44\`\n\n`) +
                `Qualquer dúvida ou caso precise negociar, fale conosco! 💚`;
              await baileys.sendText(cleanPhone, msg);
              relatorio.lembretesAtraso++;
            }
          }

          // ──────────────────────────────────────────────────────────
          // 4. SUSPENSÃO POR INADIMPLÊNCIA (D+5)
          // ──────────────────────────────────────────────────────────
          if (daysLate >= 5) {
            // Atualiza status do cartão para blocked_late
            db.prepare(`
              UPDATE belafarma_cards
              SET status = 'blocked_late', updated_at = datetime('now', 'localtime')
              WHERE id = ? AND status = 'active'
            `).run(inv.card_id);

            // Se for exatamente o dia D+5, dispara o alerta de bloqueio
            if (daysLate === 5 && inv.phone && baileys && typeof baileys.sendText === 'function') {
              const cleanPhone = sanitizePhone(inv.phone);
              const saldoRestante = Number((inv.total_due - inv.paid_amount).toFixed(2));
              const msg = `🚨 *Crediário Temporariamente Suspenso - BelaFarma*\n\n` +
                `Olá, *${inv.customer_name.split(' ')[0]}*! Sua fatura está com 5 dias de atraso (Saldo: *R$ ${saldoRestante.toFixed(2)}*).\n\n` +
                `Informamos que, conforme a política de crédito, novas compras a prazo foram suspensas temporariamente até a regularização do débito.\n\n` +
                `Passe na farmácia ou efetue o pagamento para restabelecer seu limite imediatamente.\n\n` +
                (inv.pix_copia_cola ? `⚡ *Pix Copia e Cola:*\n\`${inv.pix_copia_cola}\`\n\n` : `💳 *Chave Pix:* \`31.144.152/0001-44\`\n\n`) +
                `Agradecemos a atenção! 💚`;
              await baileys.sendText(cleanPhone, msg);
              relatorio.bloqueiosD5++;
            }
          }
        } catch (eAtr) {
          relatorio.erros.push(`Atraso ${inv.id}: ${eAtr.message}`);
        }
      }
    } catch (e3) {
      console.error('[Crediário 2.0 Cron] Erro nos atrasados:', e3.message);
    }

    console.log('✅ [Crediário 2.0 Cron] Varredura diária concluída:', JSON.stringify(relatorio));
    return relatorio;
  }

  // Agendar para rodar todos os dias às 09:00
  try {
    cron.schedule('0 9 * * *', () => {
      executarReguaDiaria().catch(err => console.error('[Crediário 2.0 Cron] Falha:', err));
    });
    console.log('⏰ [Crediário 2.0] Cron diário agendado para 09:00 todos os dias.');
  } catch (errCron) {
    console.warn('Aviso ao registrar cron do Crediário 2.0:', errCron.message);
  }

  return { executarReguaDiaria };
}

module.exports = { initCrediarioCron };
