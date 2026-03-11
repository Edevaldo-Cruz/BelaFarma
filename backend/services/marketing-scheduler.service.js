/**
 * Marketing Scheduler Service — BelaFarma
 * 
 * Responsável por agendar e executar os jobs do Agente de Marketing:
 * - A cada 15 dias (quinzenal), às 08:00 (Brasília): gera e envia relatório para Rosana
 */

const marketingAgent = require('./marketing-agent.service');
const sender = require('./message-sender.service');

// Número da Rosana para receber os relatórios
const ROSANA_PHONE = process.env.MARKETING_ROSANA_PHONE || process.env.ADMIN_WHATSAPP || '+5532888765295';

// Intervalo quinzenal em dias
const INTERVALO_DIAS = 15;

let schedulerInterval = null;
let isRunning = false;

/**
 * Verifica se já passaram 15 dias desde o último envio
 */
function deveExecutarHoje(db) {
  const agora = new Date();
  const agoraBrasilia = new Date(agora.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  
  const hora = agoraBrasilia.getHours();
  const minuto = agoraBrasilia.getMinutes();

  // Só executa no horário de 08:00-08:04
  if (hora !== 8 || minuto >= 5) return false;

  // Verifica último envio no banco
  try {
    const ultimoEnvio = db.prepare(`
      SELECT sentAt FROM marketing_reports 
      WHERE sentToRosana = 1
      ORDER BY createdAt DESC LIMIT 1
    `).get();

    if (!ultimoEnvio || !ultimoEnvio.sentAt) {
      // Nunca enviou, então deve executar
      return true;
    }

    const dataUltimoEnvio = new Date(ultimoEnvio.sentAt);
    const diffMs = agora.getTime() - dataUltimoEnvio.getTime();
    const diffDias = diffMs / (1000 * 60 * 60 * 24);

    return diffDias >= INTERVALO_DIAS;
  } catch (e) {
    console.error('[MarketingScheduler] Erro ao verificar último envio:', e.message);
    return false;
  }
}

/**
 * Executa o job completo de marketing:
 * 1. Gera o relatório com IA
 * 2. Salva no banco de dados
 * 3. Envia relatório completo para Rosana via WhatsApp
 */
async function executarJobMarketing(db, opcoes = {}) {
  if (isRunning && !opcoes.forcar) {
    console.log('[MarketingScheduler] ⚠️ Job já está em execução. Ignorando.');
    return { success: false, error: 'Job já em execução' };
  }

  isRunning = true;
  console.log('[MarketingScheduler] 🚀 Iniciando job de marketing...');

  const phone = opcoes.phone || ROSANA_PHONE;

  try {
    // 1. Gera o relatório
    const { relatorio, metadata } = await marketingAgent.gerarRelatorioCompleto(db);

    // 2. Salva no banco
    const id = `mkt-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    const agora = new Date().toISOString();

    try {
      db.prepare(`
        INSERT INTO marketing_reports (id, content, metadata, sentToRosana, createdAt)
        VALUES (@id, @content, @metadata, @sentToRosana, @createdAt)
      `).run({
        id,
        content: relatorio,
        metadata: JSON.stringify(metadata),
        sentToRosana: 0,
        createdAt: agora,
      });
      console.log(`[MarketingScheduler] 💾 Relatório salvo no banco — ID: ${id}`);
    } catch (dbErr) {
      console.error('[MarketingScheduler] ⚠️ Erro ao salvar no banco:', dbErr.message);
    }

    // 3. Monta mensagem completa e envia via WhatsApp
    const mensagemWhatsApp = marketingAgent.formatarResumoWhatsApp(relatorio, metadata);

    console.log(`[MarketingScheduler] 📱 Enviando relatório completo para Rosana (${phone})...`);
    const envioResult = await sender.sendMessage(phone, mensagemWhatsApp);

    // 4. Atualiza status de envio no banco
    if (envioResult.success && !envioResult.fallback) {
      try {
        db.prepare(`
          UPDATE marketing_reports 
          SET sentToRosana = 1, sentAt = @sentAt
          WHERE id = @id
        `).run({ id, sentAt: new Date().toISOString() });
      } catch (e) { /* ignora */ }
      
      console.log('[MarketingScheduler] ✅ Relatório enviado para Rosana com sucesso!');
    } else {
      console.error('[MarketingScheduler] ❌ Falha ao enviar para Rosana:', envioResult.error);
    }

    return {
      success: true,
      reportId: id,
      enviado: envioResult.success && !envioResult.fallback,
      phone,
      metadata,
    };

  } catch (error) {
    console.error('[MarketingScheduler] ❌ Erro no job de marketing:', error.message);
    return { success: false, error: error.message };
  } finally {
    isRunning = false;
  }
}

/**
 * Inicia o scheduler — verifica a cada 5 minutos se deve executar
 */
function iniciarScheduler(db) {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
  }

  console.log('[MarketingScheduler] ⏰ Scheduler de marketing iniciado');
  console.log(`[MarketingScheduler] 📅 Envio automático: a cada ${INTERVALO_DIAS} dias, às 08:00 (Brasília)`);
  console.log(`[MarketingScheduler] 📱 Destinatário: Rosana — ${ROSANA_PHONE}`);

  // Registra que o scheduler foi iniciado
  try {
    const existente = db.prepare("SELECT key FROM system_settings WHERE key = 'marketing_scheduler_started'").get();
    if (!existente) {
      db.prepare("INSERT INTO system_settings (key, value, updated_at) VALUES (?, ?, ?)").run(
        'marketing_scheduler_started',
        new Date().toISOString(),
        new Date().toISOString()
      );
    } else {
      db.prepare("UPDATE system_settings SET value = ?, updated_at = ? WHERE key = ?").run(
        new Date().toISOString(),
        new Date().toISOString(),
        'marketing_scheduler_started'
      );
    }
  } catch (e) { /* ignora */ }

  // Verifica a cada 5 minutos
  schedulerInterval = setInterval(async () => {
    if (deveExecutarHoje(db)) {
      console.log(`[MarketingScheduler] 📅 ${INTERVALO_DIAS} dias se passaram — executando job automático!`);
      await executarJobMarketing(db);
    }
  }, 5 * 60 * 1000); // 5 minutos

  return schedulerInterval;
}

/**
 * Para o scheduler
 */
function pararScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log('[MarketingScheduler] 🛑 Scheduler parado.');
  }
}

/**
 * Retorna o status atual do scheduler
 */
function getStatus(db) {
  let ultimoEnvio = null;
  let proximoEnvio = null;

  try {
    const ultimo = db.prepare(`
      SELECT sentAt FROM marketing_reports 
      WHERE sentToRosana = 1
      ORDER BY createdAt DESC LIMIT 1
    `).get();

    if (ultimo && ultimo.sentAt) {
      ultimoEnvio = ultimo.sentAt;
      const dataProximo = new Date(ultimo.sentAt);
      dataProximo.setDate(dataProximo.getDate() + INTERVALO_DIAS);
      dataProximo.setHours(8, 0, 0, 0);
      proximoEnvio = dataProximo.toISOString();
    } else {
      // Nunca enviou, próximo é amanhã às 08:00
      const amanha = new Date();
      amanha.setDate(amanha.getDate() + 1);
      amanha.setHours(8, 0, 0, 0);
      proximoEnvio = amanha.toISOString();
    }
  } catch (e) { /* ignora */ }

  return {
    ativo: !!schedulerInterval,
    emExecucao: isRunning,
    ultimoEnvio,
    proximoEnvio,
    destinatario: ROSANA_PHONE,
    frequencia: `A cada ${INTERVALO_DIAS} dias, às 08:00 (Brasília)`,
  };
}

module.exports = {
  iniciarScheduler,
  pararScheduler,
  executarJobMarketing,
  getStatus,
  ROSANA_PHONE,
};
