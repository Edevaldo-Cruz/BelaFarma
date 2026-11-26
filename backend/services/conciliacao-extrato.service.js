/**
 * backend/services/conciliacao-extrato.service.js
 *
 * Motor de conciliação bancária entre o Extrato do Itaú (Open Finance)
 * e os recebíveis de Maquininha (Rede/POS) e iFood da BelaFarma.
 */

const db = require('../database');
const openFinance = require('./open-finance.service');

class ConciliacaoExtratoService {
  /**
   * Obtém a lista de conciliações já salvas
   */
  getConciliacoesSalvas() {
    return db.prepare('SELECT * FROM bank_conciliations').all();
  }

  /**
   * Analisa e cruza o extrato com as bases internas de Maquininha e iFood
   */
  async obterPainelConciliacao(options = {}) {
    const transacoes = await openFinance.getTransacoes(options);
    const concSalvas = this.getConciliacoesSalvas();
    const concMap = new Map();
    concSalvas.forEach(c => concMap.set(c.transaction_id, c));

    // Buscar recebíveis em aberto ou do período
    const cardReceivables = db.prepare(`
      SELECT * FROM card_machine_receivables
      ORDER BY expected_payment_date DESC
    `).all();

    // Buscar vendas do iFood
    const ifoodSales = db.prepare(`
      SELECT * FROM ifood_sales
      ORDER BY sale_date DESC
    `).all();

    const itensMaquininha = [];
    const itensIFood = [];
    const itensPix = [];
    const itensOutros = [];

    let totalMaquininhaConciliado = 0;
    let totalMaquininhaPendente = 0;
    let totalIFoodConciliado = 0;
    let totalIFoodPendente = 0;

    for (const t of transacoes) {
      const valor = Number(t.amount || 0);
      if (valor <= 0) continue; // Somente entradas financeiras

      const desc = (t.description || '').toUpperCase();
      const descRaw = (t.descriptionRaw || '').toUpperCase();
      const dateStr = t.date ? t.date.substring(0, 10) : '';
      const concExistente = concMap.get(t.id);

      // 1. Identificar se é Maquininha (REDE, CIELO, STONE, etc.)
      const isRede = desc.includes('REDE ') || descRaw.includes('REDE ') || desc.includes('CIELO') || desc.includes('STONE');
      // 2. Identificar se é iFood
      const isIFood = desc.includes('IFOOD') || descRaw.includes('IFOOD');
      // 3. Identificar se é Pix
      const isPix = desc.includes('PIX') || desc.includes('QRS');

      if (isRede) {
        // Tentar sugerir match por data de vencimento e valor líquido
        let sugestaoMatch = null;
        if (!concExistente) {
          sugestaoMatch = cardReceivables.find(r => {
            const rDate = r.expected_payment_date || r.sale_date;
            const rVal = Number(r.net_deposited_value || r.gross_value || 0);
            const dateMatch = rDate === dateStr;
            const valMatch = Math.abs(rVal - valor) <= 0.05;
            return dateMatch || (valMatch && r.status === 'Pendente');
          });
        }

        const conciliado = !!concExistente;
        if (conciliado) {
          totalMaquininhaConciliado += valor;
        } else {
          totalMaquininhaPendente += valor;
        }

        // Extrair bandeira e modalidade da descrição da Rede
        let bandeira = 'Rede';
        if (desc.includes('MAST')) bandeira = 'Mastercard';
        else if (desc.includes('VISA')) bandeira = 'Visa';
        else if (desc.includes('ELO')) bandeira = 'Elo';

        let modalidade = 'Crédito/Débito';
        if (desc.includes(' DB')) modalidade = 'Débito';
        else if (desc.includes(' AT') || desc.includes(' CR')) modalidade = 'Crédito';

        itensMaquininha.push({
          id: t.id,
          data: dateStr,
          valor,
          descricao: t.description,
          bandeira,
          modalidade,
          status: conciliado ? 'CONCILIADO' : (sugestaoMatch ? 'SUGESTAO' : 'NOVO_EXTRATO'),
          conciliacao: concExistente || null,
          sugestao: sugestaoMatch || null
        });
      } else if (isIFood) {
        // Sugestão de lote iFood
        let sugestaoMatch = null;
        if (!concExistente) {
          // Procurar se há vendas na semana com valor líquido compatível
          sugestaoMatch = ifoodSales.find(s => {
            const diff = Math.abs(Number(s.net_value) - valor);
            return diff <= 0.05 && s.status === 'Pendente';
          });
        }

        const conciliado = !!concExistente;
        if (conciliado) {
          totalIFoodConciliado += valor;
        } else {
          totalIFoodPendente += valor;
        }

        let tipoRepasse = desc.includes('PIX') ? 'Pix iFood' : 'Crédito iFood (Master)';

        itensIFood.push({
          id: t.id,
          data: dateStr,
          valor,
          descricao: t.description,
          tipoRepasse,
          status: conciliado ? 'CONCILIADO' : (sugestaoMatch ? 'SUGESTAO' : 'NOVO_EXTRATO'),
          conciliacao: concExistente || null,
          sugestao: sugestaoMatch || null
        });
      } else if (isPix) {
        itensPix.push({
          id: t.id,
          data: dateStr,
          valor,
          descricao: t.description,
          pagador: t.paymentData?.payer?.documentNumber?.value || 'Balcão/Cliente',
          status: concExistente ? 'CONCILIADO' : 'NOVO_EXTRATO'
        });
      } else {
        itensOutros.push({
          id: t.id,
          data: dateStr,
          valor,
          descricao: t.description,
          status: concExistente ? 'CONCILIADO' : 'NOVO_EXTRATO'
        });
      }
    }

    return {
      resumo: {
        totalMaquininhaConciliado,
        totalMaquininhaPendente,
        totalMaquininhaGeral: totalMaquininhaConciliado + totalMaquininhaPendente,
        qtdMaquininha: itensMaquininha.length,

        totalIFoodConciliado,
        totalIFoodPendente,
        totalIFoodGeral: totalIFoodConciliado + totalIFoodPendente,
        qtdIFood: itensIFood.length,

        qtdPix: itensPix.length,
        totalPix: itensPix.reduce((acc, p) => acc + p.valor, 0)
      },
      maquininha: itensMaquininha,
      ifood: itensIFood,
      pix: itensPix.slice(0, 50),
      outros: itensOutros
    };
  }

  /**
   * Concilia manualmente ou automaticamente um ou mais itens
   */
  async conciliarItens(itens, userName = 'Administrador') {
    const stmt = db.prepare(`
      INSERT INTO bank_conciliations (
        id, transaction_id, transaction_date, amount, description, channel, target_type, target_id, status, notes, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(transaction_id) DO UPDATE SET
        status = excluded.status,
        notes = excluded.notes,
        target_id = excluded.target_id
    `);

    const updateReceivable = db.prepare(`
      UPDATE card_machine_receivables
      SET status = 'Conferido', net_deposited_value = ?, reconciled_at = ?, reconciled_by = ?
      WHERE id = ?
    `);

    const updateIFood = db.prepare(`
      UPDATE ifood_sales
      SET status = 'Recebido', received_at = ?
      WHERE id = ?
    `);

    const results = [];
    const now = new Date().toISOString();

    const tx = db.transaction((lista) => {
      for (const item of lista) {
        const concId = 'conc_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
        stmt.run(
          concId,
          item.transactionId,
          item.transactionDate,
          item.amount,
          item.description || '',
          item.channel, // 'MAQUININHA' ou 'IFOOD'
          item.targetType || 'card_machine_receivable',
          item.targetId || null,
          'CONCILIATED',
          item.notes || `Conciliado via Open Finance por ${userName}`,
          now
        );

        // Se houver vínculo com card_machine_receivable, atualiza
        if (item.channel === 'MAQUININHA' && item.targetId) {
          updateReceivable.run(item.amount, now, userName, item.targetId);
        }

        // Se houver vínculo com ifood_sales, atualiza
        if (item.channel === 'IFOOD' && item.targetId) {
          updateIFood.run(now, item.targetId);
        }

        results.push({ transactionId: item.transactionId, status: 'CONCILIATED' });
      }
    });

    tx(itens);
    return { success: true, count: results.length, items: results };
  }

  /**
   * Concilia automaticamente todas as entradas de Maquininha e iFood do extrato
   */
  async autoConciliarTudo(userName = 'Robô Open Finance') {
    const painel = await this.obterPainelConciliacao();
    const paraConciliar = [];

    // 1. Maquininha com sugestão direta ou marcar como conferido no banco
    for (const m of painel.maquininha) {
      if (m.status !== 'CONCILIADO') {
        paraConciliar.push({
          transactionId: m.id,
          transactionDate: m.data,
          amount: m.valor,
          description: m.descricao,
          channel: 'MAQUININHA',
          targetType: 'card_machine_receivable',
          targetId: m.sugestao ? m.sugestao.id : null,
          notes: m.sugestao 
            ? `Conciliado com ${m.sugestao.modality} (${m.sugestao.brand})` 
            : `Depósito confirmado via Extrato Itaú (${m.bandeira} ${m.modalidade})`
        });
      }
    }

    // 2. iFood com sugestão ou marcação de repasse
    for (const ifd of painel.ifood) {
      if (ifd.status !== 'CONCILIADO') {
        paraConciliar.push({
          transactionId: ifd.id,
          transactionDate: ifd.data,
          amount: ifd.valor,
          description: ifd.descricao,
          channel: 'IFOOD',
          targetType: 'ifood_sale',
          targetId: ifd.sugestao ? ifd.sugestao.id : null,
          notes: ifd.sugestao 
            ? `Repasse iFood conciliado com pedido ${ifd.sugestao.id}`
            : `Repasse iFood confirmado via Extrato Itaú (${ifd.tipoRepasse})`
        });
      }
    }

    if (paraConciliar.length === 0) {
      return { success: true, count: 0, message: 'Todas as entradas de Maquininha e iFood já estão conciliadas!' };
    }

    return await this.conciliarItens(paraConciliar, userName);
  }
}

module.exports = new ConciliacaoExtratoService();
