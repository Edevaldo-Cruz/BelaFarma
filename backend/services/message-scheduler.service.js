/**
 * Message Scheduler Service — BelaFarma
 * Configura e executa cron jobs para envio automático de mensagens.
 * 
 * Horários são configuráveis via banco de dados (message_schedule_config).
 * 
 * Jobs padrão:
 * - Aniversários: diariamente às 08:00
 * - Cobranças: diariamente às 09:00
 */

const cron = require('node-cron');
const sender = require('./message-sender.service');
const templates = require('./message-templates.service');

let scheduledJobs = {};
let dbInstance = null;

/**
 * Inicializa configurações padrão de agendamento (se não existirem)
 */
function initializeDefaultSchedules(db) {
  if (!db) return;
  dbInstance = db;

  try {
    const existingCount = db.prepare('SELECT COUNT(*) as count FROM message_schedule_config').get();

    if (existingCount.count === 0) {
      console.log('[MessageScheduler] Inserindo agendamentos padrão...');

      const stmt = db.prepare(`
        INSERT INTO message_schedule_config (id, type, description, hour, minute, isEnabled, lastRun, createdAt)
        VALUES (@id, @type, @description, @hour, @minute, @isEnabled, @lastRun, @createdAt)
      `);

      const now = new Date().toISOString();

      stmt.run({
        id: 'schedule-aniversario',
        type: 'aniversario',
        description: 'Enviar parabéns para aniversariantes do dia',
        hour: 8,
        minute: 0,
        isEnabled: 1,
        lastRun: null,
        createdAt: now,
      });

      stmt.run({
        id: 'schedule-cobranca',
        type: 'cobranca',
        description: 'Enviar lembrete de cobrança para clientes com débito',
        hour: 9,
        minute: 0,
        isEnabled: 1,
        lastRun: null,
        createdAt: now,
      });

      console.log('[MessageScheduler] ✅ Agendamentos padrão inseridos.');
    }
  } catch (error) {
    console.error('[MessageScheduler] Erro ao inicializar agendamentos:', error.message);
  }
}

/**
 * Busca clientes aniversariantes do dia
 */
function getBirthdayCustomers(db) {
  try {
    const today = new Date();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');

    // birthDate no formato YYYY-MM-DD
    // Buscamos por mês e dia (ignora o ano)
    const customers = db.prepare(`
      SELECT * FROM customers 
      WHERE birthDate IS NOT NULL 
        AND phone IS NOT NULL 
        AND phone != ''
        AND substr(birthDate, 6, 5) = ?
    `).all(`${month}-${day}`);

    return customers;
  } catch (error) {
    console.error('[MessageScheduler] Erro ao buscar aniversariantes:', error.message);
    return [];
  }
}

/**
 * Busca clientes com débito pendente (para cobrança)
 */
function getDebtors(db) {
  try {
    const customers = db.prepare(`
      SELECT 
        c.id, c.name, c.nickname, c.phone, c.dueDay,
        SUM(cd.totalValue) as totalOwed,
        COUNT(cd.id) as debtCount
      FROM customers c
      INNER JOIN customer_debts cd ON c.id = cd.customerId
      WHERE cd.status IN ('Pendente', 'Atrasado')
        AND c.phone IS NOT NULL 
        AND c.phone != ''
      GROUP BY c.id
      ORDER BY totalOwed DESC
    `).all();

    return customers;
  } catch (error) {
    console.error('[MessageScheduler] Erro ao buscar devedores:', error.message);
    return [];
  }
}

/**
 * Registra uma mensagem no log
 */
function logMessage(db, { phone, type, status, customerName, customerId, campaignId, errorMsg }) {
  try {
    db.prepare(`
      INSERT INTO message_log (id, phone, type, status, customerName, customerId, campaignId, errorMessage, sentAt)
      VALUES (@id, @phone, @type, @status, @customerName, @customerId, @campaignId, @errorMessage, @sentAt)
    `).run({
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      phone: phone || '',
      type: type || 'outro',
      status: status || 'erro',
      customerName: customerName || '',
      customerId: customerId || null,
      campaignId: campaignId || null,
      errorMessage: errorMsg || null,
      sentAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[MessageScheduler] Erro ao registrar log:', error.message);
  }
}

/**
 * Executa o job de aniversários
 */
async function runBirthdayJob(db) {
  console.log('[MessageScheduler] 🎂 Executando job de aniversários...');

  const customers = getBirthdayCustomers(db);
  
  if (customers.length === 0) {
    console.log('[MessageScheduler] Nenhum aniversariante hoje.');
    return { sent: 0, failed: 0 };
  }

  console.log(`[MessageScheduler] ${customers.length} aniversariante(s) encontrado(s).`);

  const messages = [];
  for (const customer of customers) {
    const msg = templates.generateBirthdayMessage(db, customer);
    if (msg && customer.phone) {
      messages.push({
        phone: customer.phone,
        message: msg,
        metadata: { customerId: customer.id, customerName: customer.name, type: 'aniversario' }
      });
    }
  }

  const result = await sender.sendBulk(messages, (index, total, res) => {
    const meta = messages[index - 1]?.metadata;
    logMessage(db, {
      phone: messages[index - 1]?.phone,
      type: 'aniversario',
      status: res.success ? 'enviado' : 'erro',
      customerName: meta?.customerName,
      customerId: meta?.customerId,
      errorMsg: res.error,
    });
  });

  // Atualiza lastRun
  try {
    db.prepare('UPDATE message_schedule_config SET lastRun = ? WHERE type = ?')
      .run(new Date().toISOString(), 'aniversario');
  } catch (e) { /* silent */ }

  // Notifica admin sobre o resultado
  await sender.notifyAdmin(
    `🎂 *Aniversários do Dia — Bela Farma Sul*\n` +
    `📊 Total: ${result.total} | ✅ Enviados: ${result.sent} | ❌ Falhas: ${result.failed}`
  );

  return result;
}

/**
 * Executa o job de cobranças
 */
async function runDebtCollectionJob(db) {
  console.log('[MessageScheduler] 💰 Executando job de cobranças...');

  const debtors = getDebtors(db);

  if (debtors.length === 0) {
    console.log('[MessageScheduler] Nenhum devedor para cobrar hoje.');
    return { sent: 0, failed: 0 };
  }

  // Filtra: só cobra se hoje é o dia de vencimento do cliente OU se está atrasado
  const today = new Date().getDate();
  const debtorsToNotify = debtors.filter(d => {
    // Se tem dueDay definido e hoje é igual ou posterior
    if (d.dueDay && today >= d.dueDay) return true;
    // Se não tem dueDay, cobra todo mundo (configurable later)
    if (!d.dueDay) return false;
    return false;
  });

  if (debtorsToNotify.length === 0) {
    console.log('[MessageScheduler] Nenhum devedor vencido hoje.');
    return { sent: 0, failed: 0 };
  }

  console.log(`[MessageScheduler] ${debtorsToNotify.length} devedor(es) para cobrar.`);

  const messages = [];
  for (const debtor of debtorsToNotify) {
    const dueDate = debtor.dueDay 
      ? `dia ${debtor.dueDay} de cada mês` 
      : 'não definido';

    const msg = templates.generateDebtMessage(db, debtor, {
      totalValue: debtor.totalOwed,
      dueDate,
    });

    if (msg && debtor.phone) {
      messages.push({
        phone: debtor.phone,
        message: msg,
        metadata: { customerId: debtor.id, customerName: debtor.name, type: 'cobranca' }
      });
    }
  }

  const result = await sender.sendBulk(messages, (index, total, res) => {
    const meta = messages[index - 1]?.metadata;
    logMessage(db, {
      phone: messages[index - 1]?.phone,
      type: 'cobranca',
      status: res.success ? 'enviado' : 'erro',
      customerName: meta?.customerName,
      customerId: meta?.customerId,
      errorMsg: res.error,
    });
  });

  // Atualiza lastRun
  try {
    db.prepare('UPDATE message_schedule_config SET lastRun = ? WHERE type = ?')
      .run(new Date().toISOString(), 'cobranca');
  } catch (e) { /* silent */ }

  // Notifica admin
  await sender.notifyAdmin(
    `💰 *Cobranças do Dia — Bela Farma Sul*\n` +
    `📊 Total: ${result.total} | ✅ Enviados: ${result.sent} | ❌ Falhas: ${result.failed}`
  );

  return result;
}

/**
 * Inicia todos os cron jobs baseados nas configurações do banco
 */
function startScheduler(db) {
  if (!db) {
    console.error('[MessageScheduler] DB não disponível. Agendamentos não iniciados.');
    return;
  }

  dbInstance = db;

  // Para jobs existentes
  stopAllJobs();

  try {
    const schedules = db.prepare('SELECT * FROM message_schedule_config WHERE isEnabled = 1').all();

    for (const schedule of schedules) {
      const { type, hour, minute } = schedule;
      const cronExpr = `${minute} ${hour} * * *`; // Minuto Hora Dia Mês DiaSemana

      console.log(`[MessageScheduler] ⏰ Agendando ${type}: ${cronExpr} (${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')})`);

      const job = cron.schedule(cronExpr, async () => {
        console.log(`[MessageScheduler] ⏰ Job ${type} disparado!`);
        try {
          if (type === 'aniversario') {
            await runBirthdayJob(db);
          } else if (type === 'cobranca') {
            await runDebtCollectionJob(db);
          }
        } catch (error) {
          console.error(`[MessageScheduler] Erro no job ${type}:`, error.message);
        }
      }, {
        timezone: 'America/Sao_Paulo'
      });

      scheduledJobs[type] = job;
    }

    console.log(`[MessageScheduler] ✅ ${Object.keys(scheduledJobs).length} job(s) agendado(s).`);

  } catch (error) {
    console.error('[MessageScheduler] Erro ao iniciar agendamentos:', error.message);
  }
}

/**
 * Para todos os cron jobs
 */
function stopAllJobs() {
  for (const [type, job] of Object.entries(scheduledJobs)) {
    job.stop();
    console.log(`[MessageScheduler] ⏹ Job ${type} parado.`);
  }
  scheduledJobs = {};
}

/**
 * Reinicia os jobs (chamado quando o admin muda horários)
 */
function restartScheduler(db) {
  console.log('[MessageScheduler] 🔄 Reiniciando agendamentos...');
  startScheduler(db || dbInstance);
}

module.exports = {
  initializeDefaultSchedules,
  startScheduler,
  stopAllJobs,
  restartScheduler,
  runBirthdayJob,
  runDebtCollectionJob,
  logMessage,
  getBirthdayCustomers,
  getDebtors,
};
