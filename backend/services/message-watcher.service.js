const fs = require('fs');
const path = require('path');
const messageSender = require('./message-sender.service');
const db = require('../database');

// Resolve o caminho da pasta mensagens, estando dentro ou fora do Docker
// No Docker, __dirname é /usr/src/app/services. ../ leva para /usr/src/app/
// Fora do Docker, __dirname é src/services ou backend/services, ../ leva para raiz do backend, ../../ leva para a raiz do projeto.
// Então vamos usar o caminho absoluto caso estejamos no Docker, ou relativo caso contrário.
const MENSAGENS_DIR = process.env.DB_PATH 
    ? path.join(__dirname, '../mensagens') // Dentro do Docker: /usr/src/app/mensagens
    : path.join(__dirname, '../../mensagens'); // Fora do Docker: raiz_do_projeto/mensagens
const PENDENTES_DIR = path.join(MENSAGENS_DIR, 'pendentes');
const ENVIADAS_DIR = path.join(MENSAGENS_DIR, 'enviadas');
const ERROS_DIR = path.join(MENSAGENS_DIR, 'erros');

// Garante que as pastas existem
[MENSAGENS_DIR, PENDENTES_DIR, ENVIADAS_DIR, ERROS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (e) {
      console.error(`Erro ao criar diretório ${dir}:`, e);
    }
  }
});

const MAX_PER_CYCLE  = 5;     // máximo de mensagens enviadas por scan
const MSG_DELAY_MS   = 4000;  // 4s entre cada mensagem
const MSG_MAX_AGE_MS = 24 * 60 * 60 * 1000; // descarta mensagens com mais de 24h

const scanPendingMessages = async () => {
    try {
        const files = fs.readdirSync(PENDENTES_DIR);
        
        let processedThisCycle = 0;

        for (const file of files) {
            if (!file.endsWith('.json')) continue;
            if (processedThisCycle >= MAX_PER_CYCLE) {
                console.log(`[Message Watcher] ⏸ Limite de ${MAX_PER_CYCLE} msgs/ciclo atingido. Restantes no próximo ciclo.`);
                break;
            }

            const filePath = path.join(PENDENTES_DIR, file);
            
            try {
                const fileContent = fs.readFileSync(filePath, 'utf-8');
                const messageData = JSON.parse(fileContent);
                
                const phone = messageData.phone || messageData.number;
                const textMessage = messageData.textMessage?.text || messageData.message;
                const sendAt = messageData.sendAt;
                const createdAt = messageData.createdAt;

                if (!phone || !textMessage) {
                    throw new Error("Arquivo JSON inválido. Faltando 'phone' ou propriedades de mensagem.");
                }

                // Descarta mensagens muito antigas (mais de 24h) para não fazer burst no restart
                if (createdAt) {
                    const age = Date.now() - new Date(createdAt).getTime();
                    if (age > MSG_MAX_AGE_MS) {
                        console.warn(`[Message Watcher] 🗑 Mensagem expirada (${Math.round(age/3600000)}h), descartando: ${file}`);
                        fs.renameSync(filePath, path.join(ERROS_DIR, file));
                        continue;
                    }
                }

                // Validação de Agendamento
                if (sendAt) {
                    const scheduledTime = new Date(sendAt).getTime();
                    if (scheduledTime > Date.now()) continue;
                }
                
                // Delay entre mensagens para evitar bloqueio de número
                if (processedThisCycle > 0) {
                    await new Promise(resolve => setTimeout(resolve, MSG_DELAY_MS));
                }

                const result = await messageSender.sendMessage(phone, textMessage, true);
                const isSent = result.success;
                const isNetworkError = result.isNetworkError;
                const isPersistentFailure = !isSent && !isNetworkError;

                processedThisCycle++;

                // Registro no Banco de Dados
                try {
                   const stmt = db.prepare(`
                      INSERT INTO message_log (id, phone, type, status, errorMessage, sentAt)
                      VALUES (?, ?, ?, ?, ?, ?)
                   `);
                   stmt.run(
                      `msg_${Date.now()}_${Math.random().toString(36).substring(2,7)}`, 
                      phone, 
                      'file_watcher', 
                      isSent ? 'enviado' : (isNetworkError ? 'pendente_offline' : 'falhou'),
                      isSent ? null : (isNetworkError ? 'Aguardando Evolution API ficar online.' : result.error || 'Erro desconhecido'),
                      new Date().toISOString()
                   );
                } catch(dbErr) {
                   console.error("[Message Watcher] Falha ao registrar log no banco:", dbErr);
                }
                
                if (isSent) {
                    fs.renameSync(filePath, path.join(ENVIADAS_DIR, file));
                    console.log(`[Message Watcher] ✅ Enviado e movido para enviadas: ${file}`);
                } else if (isPersistentFailure) {
                    fs.renameSync(filePath, path.join(ERROS_DIR, file));
                    console.log(`[Message Watcher] ❌ Falhou permanentemente. Movido para erros: ${file}`);
                } else {
                    console.log(`[Message Watcher] ⏳ API offline para ${phone}. Mantendo em pendentes.`);
                }
                
            } catch (err) {
                console.error(`[Message Watcher] Erro ao processar ${file}:`, err);
                try { fs.renameSync(filePath, path.join(ERROS_DIR, file)); } catch(e) {}
            }
        }
    } catch (err) {
        console.error('[Message Watcher] Erro ao acessar a pasta de pendentes:', err);
    }
};

// Inicia um "Cron/Loop"
const startWatching = () => {
    // Escaneia a cada 30 segundos
    const INTERVAL = 30000;
    
    console.log(`[Message Watcher] Iniciado. Observando arquivos na pasta: ${PENDENTES_DIR}`);
    
    setInterval(() => {
        scanPendingMessages();
    }, INTERVAL);
};

module.exports = {
    startWatching,
    scanPendingMessages
};
