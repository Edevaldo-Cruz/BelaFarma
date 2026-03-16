/**
 * Marketing Scheduler Service — BelaFarma
 * 
 * Responsável por agendar e executar os jobs do Agente de Marketing:
 * - A cada 15 dias (quinzenal), às 08:00 (Brasília): gera e envia relatório para Rosana
 */

const marketingAgent = require('./marketing-agent.service');
const sender = require('./message-sender.service');

// Números para receber os relatórios
// Usando lazy loading para process.env para refletir mudanças se necessário
function getRosanaPhone() { return process.env.MARKETING_ROSANA_PHONE || process.env.ADMIN_WHATSAPP; }
function getEdevaldoPhone() { return process.env.EDEVALDO_WHATSAPP || '+5532988634755'; }

// Intervalo quinzenal em dias para o relatório estratégico
const INTERVALO_ESTRATEGICO_DIAS = 15;

let schedulerInterval = null;
let isRunning = false;

/**
 * Verifica se já passou o tempo para o relatório estratégico (15 dias)
 */
function deveExecutarEstrategico(db) {
  try {
    const ultimoEnvio = db.prepare(`
      SELECT sentAt FROM marketing_reports 
      WHERE sentToRosana = 1 AND metadata LIKE '%relatorio_completo%'
      ORDER BY createdAt DESC LIMIT 1
    `).get();

    if (!ultimoEnvio || !ultimoEnvio.sentAt) return true;

    const agora = new Date();
    const dataUltimoEnvio = new Date(ultimoEnvio.sentAt);
    const diffMs = agora.getTime() - dataUltimoEnvio.getTime();
    const diffDias = diffMs / (1000 * 60 * 60 * 24);

    return diffDias >= INTERVALO_ESTRATEGICO_DIAS;
  } catch (e) {
    return false;
  }
}

/**
 * Verifica se já executou as tarefas diárias hoje
 */
function jaExecutouDiario(db) {
  const hoje = new Date().toISOString().split('T')[0];
  try {
    const registro = db.prepare(`
      SELECT key FROM system_settings 
      WHERE key = ? AND value = ?
    `).get(`mkt_diario_executado`, hoje);
    return !!registro;
  } catch (e) {
    return false;
  }
}

/**
 * Marca tarefas diárias como executadas
 */
function marcarDiarioExecutado(db) {
  const hoje = new Date().toISOString().split('T')[0];
  try {
    db.prepare("INSERT OR REPLACE INTO system_settings (key, value, updated_at) VALUES (?, ?, ?)")
      .run(`mkt_diario_executado`, hoje, new Date().toISOString());
  } catch (e) {}
}

/**
 * Executa as tarefas diárias
 */
async function executarTarefasDiarias(db) {
  console.log('[MarketingScheduler] ☀️ Iniciando tarefas diárias de marketing...');

  // 1. Clima para Rosana
  try {
    const phone = getRosanaPhone();
    const mensagemClima = await marketingAgent.gerarMensagemClimaDiaria();
    if (mensagemClima) {
      console.log(`[MarketingScheduler] 📱 Enviando clima diário para Rosana (${phone})...`);
      await sender.sendMessage(phone, mensagemClima);
    }
  } catch (e) {
    console.error('[MarketingScheduler] Erro ao enviar clima para Rosana:', e.message);
  }
  // 2. Venda Parada para Edevaldo
  try {
    const phone = getEdevaldoPhone();
    const analiseEdevaldo = await marketingAgent.analisarProdutosParados90Dias(db, phone);
    if (analiseEdevaldo) {
      console.log(`[MarketingScheduler] 📱 Enviando análise de venda parada para Edevaldo (${phone})...`);
      await sender.sendMessage(phone, analiseEdevaldo);
    }
  } catch (e) {
    console.error('[MarketingScheduler] Erro ao enviar análise para Edevaldo:', e.message);
  }


  // 3. Notificar Admin (Edevaldo)
  try {
    const ADMIN_PHONE = process.env.ADMIN_WHATSAPP;
    const rosanaPhone = getRosanaPhone();
    const edevaldoPhone = getEdevaldoPhone();
    if (ADMIN_PHONE) {
      const resumo = `🤖 *Belinha: Relatório de Execução Diária*\n\n✅ Previsão do tempo enviada para Rosana (${rosanaPhone})\n✅ Análise de 10 produtos enviada para Edevaldo (${edevaldoPhone})\n\n_Aguardando sua aprovação para criar tarefas._`;
      console.log(`[MarketingScheduler] 📱 Enviando resumo da manhã para o Admin...`);
      await sender.sendMessage(ADMIN_PHONE, resumo);
    }
  } catch (e) {
    console.error('[MarketingScheduler] Erro ao enviar resumo para Admin:', e.message);
  }
}

/**
 * Executa o job estratégico quinzenal
 */
async function executarJobMarketing(db, opcoes = {}) {
  if (isRunning && !opcoes.forcar) {
    console.log('[MarketingScheduler] ⚠️ Job já está em execução. Ignorando.');
    return { success: false, error: 'Job já em execução' };
  }

  isRunning = true;
  console.log('[MarketingScheduler] 🚀 Iniciando job estratégico quinzenal...');

  const phone = opcoes.phone || getRosanaPhone();

  try {
    const { relatorio, metadata } = await marketingAgent.gerarRelatorioCompleto(db);
    const id = `mkt-est-${Date.now()}`;
    const agora = new Date().toISOString();

    db.prepare(`
      INSERT INTO marketing_reports (id, content, metadata, sentToRosana, createdAt)
      VALUES (@id, @content, @metadata, @sentToRosana, @createdAt)
    `).run({
      id,
      content: relatorio,
      metadata: JSON.stringify({...metadata, type: 'relatorio_completo'}),
      sentToRosana: 0,
      createdAt: agora,
    });

    const mensagemWhatsApp = marketingAgent.formatarResumoWhatsApp(relatorio, metadata);
    const envioResult = await sender.sendMessage(phone, mensagemWhatsApp);

    if (envioResult.success && !envioResult.fallback) {
      db.prepare(`
        UPDATE marketing_reports 
        SET sentToRosana = 1, sentAt = @sentAt
        WHERE id = @id
      `).run({ id, sentAt: new Date().toISOString() });
      console.log('[MarketingScheduler] ✅ Relatório estratégico enviado com sucesso!');
    }

    return { success: true, reportId: id };
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
  console.log(`[MarketingScheduler] 📅 Envio estratégico: a cada ${INTERVALO_ESTRATEGICO_DIAS} dias, às 08:00 (Brasília)`);
  console.log(`[MarketingScheduler] 📱 Destinatário: Rosana — ${getRosanaPhone()}`);

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
    const agora = new Date();
    // Obtém hora em Brasília (UTC-3)
    const formatter = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      hour: 'numeric',
      minute: 'numeric',
      hour12: false
    });
    
    const parts = formatter.formatToParts(agora);
    const hora = parseInt(parts.find(p => p.type === 'hour').value);
    const minuto = parseInt(parts.find(p => p.type === 'minute').value);

    // Janela de execução: a partir das 08h00. 
    // Se ainda não executou hoje e já passou das 08h00, executa na primeira oportunidade.
    if (hora >= 8) {
      // 1. Tarefas Diárias (Clima e Venda Parada)
      if (!jaExecutouDiario(db)) {
        await executarTarefasDiarias(db);
        marcarDiarioExecutado(db);
      }

      // 2. Relatório Estratégico (Quinzenal) - mantém a lógica de 08:00-08:15 para o quinzenal
      // ou podemos flexibilizar também se preferir.
      if (hora === 8 && minuto < 15 && deveExecutarEstrategico(db)) {
        await executarJobMarketing(db);
      }
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
      dataProximo.setDate(dataProximo.getDate() + INTERVALO_ESTRATEGICO_DIAS);
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
    destinatario: getRosanaPhone(),
    frequencia: `Relatório Estratégico: a cada ${INTERVALO_ESTRATEGICO_DIAS} dias | Tarefas diárias: após 08h00`,
  };
}

module.exports = {
  iniciarScheduler,
  pararScheduler,
  executarJobMarketing,
  getStatus,
  getRosanaPhone,
};
