const Database = require('better-sqlite3');
const path = require('path');

// Carrega variáveis de ambiente
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { callAI } = require('./services/ai.service');

const dbPath = path.join(__dirname, '..', 'data', 'belafarma.db');
const db = new Database(dbPath);

async function listarFaltasDoWhatsApp() {
  console.log('================================================================');
  console.log('🤖  VARREDURA DE WHATSAPP: DETECÇÃO DE FALTAS EM ANDAMENTO   🤖');
  console.log('================================================================');

  const agora = Date.now();
  // Analisar os últimos 15 dias
  const timeLimit = agora - (15 * 24 * 60 * 60 * 1000);
  console.log(`🕒 Limite de tempo definido: ${new Date(timeLimit).toLocaleString('pt-BR')} (Últimos 15 dias)`);

  try {
    // 1. Carregar conversas recentes do banco SQLite local
    const localActive = db.prepare(`
      SELECT phone, MAX(timestamp) as lastInteractionTime
      FROM whatsapp_messages
      WHERE timestamp > ?
      GROUP BY phone
      ORDER BY lastInteractionTime DESC
    `).all(timeLimit);

    console.log(`📱 Encontrados ${localActive.length} contatos com interações recentes.`);

    if (localActive.length === 0) {
      console.log('ℹ️ Nenhuma mensagem recente nas últimas 24 horas.');
      return;
    }

    for (const contact of localActive) {
      const rawPhone = contact.phone;
      const lastTime = new Date(contact.lastInteractionTime).toLocaleString('pt-BR');
      
      // Buscar nome na tabela customers
      let customerName = 'Contato Desconhecido';
      const cust = db.prepare('SELECT name FROM customers WHERE phone = ? OR phone LIKE ?').get(rawPhone, `%${rawPhone.slice(-8)}%`);
      if (cust && cust.name) {
        customerName = cust.name;
      }

      console.log(`\n----------------------------------------------------------------`);
      console.log(`👤 Contato: ${customerName} (${rawPhone})`);
      console.log(`📅 Última mensagem em: ${lastTime}`);
      console.log(`----------------------------------------------------------------`);

      // Buscar histórico das últimas 25 mensagens
      const localMsgs = db.prepare(`
        SELECT fromMe, messageText, timestamp
        FROM whatsapp_messages
        WHERE phone = ?
        ORDER BY timestamp DESC
        LIMIT 25
      `).all(rawPhone);

      if (!localMsgs || localMsgs.length === 0) {
        console.log('   ⚠️ Sem mensagens gravadas para este contato.');
        continue;
      }

      const sorted = [...localMsgs].reverse();
      const dialog = sorted.map(m => {
        const sender = m.fromMe === 1 ? 'Atendente/Bela' : 'Cliente';
        return m.messageText ? `${sender}: ${m.messageText}` : null;
      }).filter(Boolean).join('\n');

      console.log('💬 Diálogo analisado:\n');
      console.log(dialog);
      console.log('\n🧠 Chamando Inteligência Artificial (Gemini)...');

      // Prompt idêntico ao do service
      const systemPrompt = `Você é o auditor de IA do CRM da Drogaria Bela Farma Sul.
Sua missão é analisar o diálogo de WhatsApp e identificar produtos que estão em falta (shortages).
Responda estritamente com um array JSON válido (sem blocos de código markdown como \`\`\`json) no seguinte formato:
[
  {
    "nome": "Nome do Produto",
    "status": "nao_encontrado" | "outro",
    "tipo": "Genérico" | "Similar" | "Perfumaria" | "Marca (Referência)"
  }
]

Regras importantes para definir o status "nao_encontrado" (indica produto em falta):
1. FLUXO DE CLIENTE (Passivo): O 'Cliente' pergunta ou pede um produto e o 'Atendente/Bela' informa ou confirma que não tem em estoque hoje, que está em falta, que acabou ou que não trabalha mais com ele.
2. FLUXO DE COTAÇÃO / PROCURA ATIVA (Ativo): O 'Atendente/Bela' pergunta a um contato (que pode ser um fornecedor, parceiro ou outra farmácia, ex: "Nayane", "Distribuidora") se ele tem algum produto (ex: "você tem dipirona em pó a granel?", "você tem X?"), o que indica que a farmácia está ativamente procurando o produto porque ele está em falta no estoque físico da farmácia, E o contato responde negativamente (ex: "não tenho", "não", "está em falta", "está zerado").

Retorne apenas produtos com status "nao_encontrado". Se não houver produtos em falta ou se o produto foi encontrado/comprado com sucesso na conversa, retorne um array vazio: []`;

      try {
        const aiResponse = await callAI(
          `Analise a conversa:\n---\n${dialog}\n---`,
          systemPrompt,
          { temperature: 0.1 }
        );

        let cleaned = aiResponse.trim().replace(/^```json?\s*/i, '').replace(/```$/, '').trim();
        const parsed = JSON.parse(cleaned);

        if (Array.isArray(parsed) && parsed.length > 0) {
          console.log('\n🚨 PRODUTO(S) EM FALTA DETECTADO(S) PELA IA:');
          parsed.forEach((prod, index) => {
            console.log(`   ${index + 1}. 📦 ${prod.nome.toUpperCase()}`);
            console.log(`      └ Tipo: ${prod.tipo}`);
            console.log(`      └ Status: ${prod.status}`);
            
            // Verificar se já existe cadastrado
            const shortageExists = db.prepare(`
              SELECT id, createdAt FROM shortages 
              WHERE productName = ? AND source = 'WhatsApp' AND purchased = 0 AND ordered = 0
            `).get(prod.nome.toUpperCase().trim());

            if (shortageExists) {
              console.log(`      ⚠️ Status no Banco: JÁ CADASTRADO em ${new Date(shortageExists.createdAt).toLocaleString('pt-BR')}`);
            } else {
              console.log(`      ✅ Status no Banco: NOVO (Não cadastrado)`);
            }
          });
        } else {
          console.log('\n🟢 Nenhuma falta detectada nesta conversa.');
        }

      } catch (aiErr) {
        console.error(`⚠️ Erro ao chamar IA para ${customerName}:`, aiErr.message);
      }
    }

  } catch (err) {
    console.error('❌ Erro na varredura:', err.message);
  } finally {
    db.close();
    console.log('\n================================================================');
    console.log('🏁                     FIM DA VARREDURA                         ');
    console.log('================================================================');
  }
}

listarFaltasDoWhatsApp();
