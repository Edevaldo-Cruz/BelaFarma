/**
 * Belinha ERP - Network Thermal Printer Service
 * Gerencia a fila central de impressão térmica e envio de cupons para a Bematech MP-4200 TH
 * a partir de qualquer computador da rede local.
 */

const net = require('net');
const db = require('../database');

// Inicializa tabelas de configuração e fila de impressão no SQLite
function initPrinterTables() {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS printer_settings (
      id TEXT PRIMARY KEY,
      mode TEXT NOT NULL DEFAULT 'SPOOLER', -- 'SPOOLER', 'TCP_IP', 'WINDOWS_SHARED'
      printer_ip TEXT DEFAULT '127.0.0.1',
      printer_port INTEGER DEFAULT 9100,
      printer_name TEXT DEFAULT 'Bematech MP-4200 TH',
      auto_cut INTEGER DEFAULT 1,
      paper_width_mm INTEGER DEFAULT 80,
      updated_at TEXT DEFAULT (datetime('now', 'localtime'))
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS printer_jobs (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      html_content TEXT NOT NULL,
      raw_text TEXT,
      print_type TEXT DEFAULT 'CUPOM_VENDA', -- 'CUPOM_VENDA', 'DANFE_NFCE', 'TESTE'
      sale_id TEXT,
      status TEXT NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'PRINTING', 'DONE', 'ERROR'
      origin_ip TEXT,
      origin_user TEXT DEFAULT 'Balcão',
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      printed_at TEXT,
      error_message TEXT
    )
  `).run();

  db.prepare(`CREATE INDEX IF NOT EXISTS idx_printer_jobs_status ON printer_jobs(status)`).run();

  // Garante registro inicial padrão
  const existing = db.prepare('SELECT id FROM printer_settings WHERE id = ?').get('primary');
  if (!existing) {
    db.prepare(`
      INSERT INTO printer_settings (id, mode, printer_ip, printer_port, printer_name, auto_cut, paper_width_mm)
      VALUES ('primary', 'SPOOLER', '127.0.0.1', 9100, 'Bematech MP-4200 TH', 1, 80)
    `).run();
  }
}

initPrinterTables();

/**
 * Obtém as configurações atuais da impressora térmica
 */
function obterConfiguracaoImpressora() {
  initPrinterTables();
  const row = db.prepare('SELECT * FROM printer_settings WHERE id = ?').get('primary');
  return row || {
    id: 'primary',
    mode: 'SPOOLER',
    printer_ip: '127.0.0.1',
    printer_port: 9100,
    printer_name: 'Bematech MP-4200 TH',
    auto_cut: 1,
    paper_width_mm: 80
  };
}

/**
 * Salva ou atualiza as configurações da impressora
 */
function salvarConfiguracaoImpressora(dados) {
  initPrinterTables();
  const {
    mode = 'SPOOLER',
    printer_ip = '127.0.0.1',
    printer_port = 9100,
    printer_name = 'Bematech MP-4200 TH',
    auto_cut = 1,
    paper_width_mm = 80
  } = dados;

  db.prepare(`
    INSERT INTO printer_settings (id, mode, printer_ip, printer_port, printer_name, auto_cut, paper_width_mm, updated_at)
    VALUES ('primary', ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
    ON CONFLICT(id) DO UPDATE SET
      mode = excluded.mode,
      printer_ip = excluded.printer_ip,
      printer_port = excluded.printer_port,
      printer_name = excluded.printer_name,
      auto_cut = excluded.auto_cut,
      paper_width_mm = excluded.paper_width_mm,
      updated_at = datetime('now', 'localtime')
  `).run(mode, printer_ip, parseInt(printer_port, 10) || 9100, printer_name, auto_cut ? 1 : 0, parseInt(paper_width_mm, 10) || 80);

  return obterConfiguracaoImpressora();
}

/**
 * Enfileira um novo trabalho de impressão vindo de qualquer computador da rede
 */
async function enfileirarJobImpressao({
  title,
  html_content,
  raw_text = '',
  print_type = 'CUPOM_VENDA',
  sale_id = null,
  origin_ip = '',
  origin_user = 'Balcão'
}) {
  initPrinterTables();

  if (!html_content || !html_content.trim()) {
    throw new Error('Conteúdo HTML de impressão não pode ser vazio.');
  }

  const jobId = `PRINT-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

  db.prepare(`
    INSERT INTO printer_jobs (
      id, title, html_content, raw_text, print_type, sale_id,
      status, origin_ip, origin_user, created_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?,
      'PENDING', ?, ?, datetime('now', 'localtime')
    )
  `).run(
    jobId,
    title || 'Impressão BelaFarma',
    html_content,
    raw_text,
    print_type,
    sale_id,
    origin_ip,
    origin_user
  );

  console.log(`[Printer Service] 📥 Novo trabalho de impressão enfileirado: #${jobId} ("${title}") de ${origin_user} (${origin_ip})`);

  // Se o modo for envio direto via TCP RAW socket (para impressoras de rede)
  const config = obterConfiguracaoImpressora();
  if (config.mode === 'TCP_IP' && raw_text) {
    try {
      await enviarSocketTcpRaw(raw_text, config.printer_ip, config.printer_port);
      marcarJobConcluido(jobId);
      return { success: true, job_id: jobId, direct_print: true, mode: 'TCP_IP' };
    } catch (tcpErr) {
      console.warn(`[Printer Service] ⚠️ Falha ao imprimir via TCP direto: ${tcpErr.message}. O job permanecerá na fila.`);
    }
  }

  return {
    success: true,
    job_id: jobId,
    status: 'PENDING',
    mode: config.mode,
    message: 'Trabalho de impressão enviado para a fila do Caixa.'
  };
}

/**
 * Obtém os trabalhos de impressão pendentes para serem executados pelo Caixa
 */
function obterJobsPendentes(limit = 10) {
  initPrinterTables();
  return db.prepare(`
    SELECT id, title, html_content, raw_text, print_type, sale_id, origin_ip, origin_user, created_at
    FROM printer_jobs
    WHERE status = 'PENDING'
    ORDER BY created_at ASC
    LIMIT ?
  `).all(limit);
}

/**
 * Marca o trabalho como impresso com sucesso
 */
function marcarJobConcluido(jobId) {
  initPrinterTables();
  db.prepare(`
    UPDATE printer_jobs
    SET status = 'DONE',
        printed_at = datetime('now', 'localtime')
    WHERE id = ?
  `).run(jobId);
  console.log(`[Printer Service] ✅ Trabalho #${jobId} marcado como impresso!`);
  return { success: true, job_id: jobId, status: 'DONE' };
}

/**
 * Marca o trabalho como erro
 */
function marcarJobErro(jobId, errorMessage) {
  initPrinterTables();
  db.prepare(`
    UPDATE printer_jobs
    SET status = 'ERROR',
        error_message = ?
    WHERE id = ?
  `).run(String(errorMessage).substring(0, 500), jobId);
  return { success: false, job_id: jobId, status: 'ERROR' };
}

/**
 * Envia comandos ESC/POS brutos via Socket TCP para impressoras de rede (porta 9100)
 */
function enviarSocketTcpRaw(rawBufferOrText, host, port = 9100) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let isDone = false;

    socket.setTimeout(4000);

    socket.connect(port, host, () => {
      // Inicia com ESC @ (reset) e termina com corte de papel GS V 66 0
      const initCmd = Buffer.from([0x1B, 0x40]); // ESC @
      const cutCmd = Buffer.from([0x1D, 0x56, 0x42, 0x00]); // GS V 'B' 0 (corte total)
      const feedCmd = Buffer.from([0x0A, 0x0A, 0x0A, 0x0A]); // 4 feeds

      const contentBuffer = Buffer.isBuffer(rawBufferOrText)
        ? rawBufferOrText
        : Buffer.from(rawBufferOrText, 'latin1');

      socket.write(Buffer.concat([initCmd, contentBuffer, feedCmd, cutCmd]), () => {
        isDone = true;
        socket.end();
        resolve(true);
      });
    });

    socket.on('timeout', () => {
      if (!isDone) {
        socket.destroy();
        reject(new Error(`Timeout ao conectar na impressora ${host}:${port}`));
      }
    });

    socket.on('error', (err) => {
      if (!isDone) {
        reject(err);
      }
    });
  });
}

/**
 * Limpa jobs antigos com mais de 7 dias
 */
function limparHistoricoAntigo() {
  try {
    db.prepare(`
      DELETE FROM printer_jobs 
      WHERE created_at < datetime('now', '-7 days')
    `).run();
  } catch (e) {}
}

module.exports = {
  obterConfiguracaoImpressora,
  salvarConfiguracaoImpressora,
  enfileirarJobImpressao,
  obterJobsPendentes,
  marcarJobConcluido,
  marcarJobErro,
  enviarSocketTcpRaw,
  limparHistoricoAntigo
};
