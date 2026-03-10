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

const scanPendingMessages = async () => {
    try {
        const files = fs.readdirSync(PENDENTES_DIR);
        
        for (const file of files) {
            if (!file.endsWith('.json')) continue;
            
            const filePath = path.join(PENDENTES_DIR, file);
            
            try {
                const fileContent = fs.readFileSync(filePath, 'utf-8');
                const messageData = JSON.parse(fileContent);
                
                // Extrai as configurações (suportando diferentes formatos)
                const phone = messageData.phone || messageData.number;
                const textMessage = messageData.textMessage?.text || messageData.message;
                const sendAt = messageData.sendAt; // Esperado em formato ISO (ex: "2026-03-09T14:30:00Z" ou timestamp de Data)
                
                if (!phone || !textMessage) {
                    throw new Error("Arquivo JSON inválido. Faltando 'phone' ou propriedades de mensagem ('textMessage.text')");
                }
                
                // Validação de Agendamento
                if (sendAt) {
                    const scheduledTime = new Date(sendAt).getTime();
                    const now = Date.now();
                    
                    if (scheduledTime > now) {
                        // Ainda não chegou a hora de enviar.
                        // Ignora este arquivo por enquanto e deixa na pasta de pendentes.
                        continue;
                    }
                }
                
                // Envio (Imediato ou porque a hora já chegou/passou)
                console.log(`[Message Watcher] Processando arquivo: ${file} para ${phone}...`);
                
                // Chamada do Sender de fato (que já integra na Evolution API)
                const isSent = await messageSender.sendMessage(phone, textMessage);
                
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
                      isSent ? 'enviado' : 'falhou',
                      isSent ? null : 'A API da Evolution falhou ao entregar a mensagem.',
                      new Date().toISOString()
                   );
                } catch(dbErr) {
                   console.error("[Message Watcher] Falha ao registrar log no banco:", dbErr);
                }
                
                // Mover arquivo
                if (isSent) {
                    const destPath = path.join(ENVIADAS_DIR, file);
                    fs.renameSync(filePath, destPath);
                    console.log(`[Message Watcher] Sucesso! Arquivo movido para enviadas: ${file}`);
                } else {
                    const destPath = path.join(ERROS_DIR, file);
                    fs.renameSync(filePath, destPath);
                    console.log(`[Message Watcher] Falhou. Arquivo movido para erros: ${file}`);
                }
                
            } catch (err) {
                console.error(`[Message Watcher] Erro ao ler/processar o arquivo ${file}:`, err);
                // Move o arquivo com formato inválido para a pasta de erros para não travar o loop para sempre
                try {
                   fs.renameSync(filePath, path.join(ERROS_DIR, file));
                } catch(e) {}
            }
        }
    } catch (err) {
        console.error('[Message Watcher] Erro ao acessar a pasta de pendentes:', err);
    }
};

// Inicia um "Cron/Loop"
const startWatching = () => {
    // Escaneia a cada 10 segundos
    const INTERVAL = 10000;
    
    console.log(`[Message Watcher] Iniciado. Observando arquivos na pasta: ${PENDENTES_DIR}`);
    
    setInterval(() => {
        scanPendingMessages();
    }, INTERVAL);
};

module.exports = {
    startWatching,
    scanPendingMessages
};
