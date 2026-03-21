/**
 * Teste Completo do Marketing — Bela Farma Sul
 * 
 * Testa com geração REAL pela IA e envio REAL via WhatsApp.
 * 
 * Uso:
 *   node test-marketing-completo.js diario       → Clima (Rosana) + Venda Parada (Edevaldo)
 *   node test-marketing-completo.js quinzenal    → Relatório estratégico completo (Rosana)
 *   node test-marketing-completo.js tudo         → Ambos
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const db = require('./database');
const marketingAgent = require('./services/marketing-agent.service');
const sender = require('./services/message-sender.service');
const { executarJobMarketing } = require('./services/marketing-scheduler.service');

const ROSANA_PHONE  = process.env.MARKETING_ROSANA_PHONE  || process.env.ADMIN_WHATSAPP;
const EDEVALDO_PHONE = process.env.EDEVALDO_WHATSAPP || '+5532988634755';

// ─── Separador visual ────────────────────────────────────────
function sep(titulo) {
  console.log('\n' + '═'.repeat(55));
  console.log(`  ${titulo}`);
  console.log('═'.repeat(55));
}

// ─── TESTE 1: Relatório Diário ────────────────────────────────
async function testarDiario() {
  sep('🌤️  TESTE DIÁRIO — Clima + Venda Parada');

  // 1a. Clima para Rosana
  console.log(`\n[1/2] Gerando mensagem de clima via IA...`);
  console.log(`      Destino: Rosana (${ROSANA_PHONE})`);
  try {
    const mensagemClima = await marketingAgent.gerarMensagemClimaDiaria();
    if (!mensagemClima) {
      console.log('⚠️  Clima não gerado (API de clima indisponível?)');
    } else {
      console.log('\n📝 Texto gerado pela IA:');
      console.log('─'.repeat(50));
      console.log(mensagemClima);
      console.log('─'.repeat(50));

      console.log('\n📤 Enviando para Rosana...');
      const r = await sender.sendMessage(ROSANA_PHONE, mensagemClima);
      if (r.success && !r.fallback) {
        console.log('✅ Mensagem enviada com sucesso para Rosana!');
      } else if (r.fallback) {
        console.log('⚠️  Enviado via fallback (arquivo). Evolution API offline?');
      } else {
        console.log('❌ Falha no envio para Rosana:', r.error);
      }
    }
  } catch (e) {
    console.error('❌ Erro no clima:', e.message);
  }

  // 1b. Venda Parada para Edevaldo
  console.log(`\n[2/2] Gerando análise de venda parada (90 dias) via IA...`);
  console.log(`      Destino: Edevaldo (${EDEVALDO_PHONE})`);
  try {
    const analise = await marketingAgent.analisarProdutosParados90Dias(db, EDEVALDO_PHONE);
    if (!analise) {
      console.log('⚠️  Análise não gerada. Verifique os PDFs em backend/reports/digifarma/');
      console.log('      O PDF deve conter palavras como "90 dias", "venda parada" etc.');
    } else {
      console.log('\n📝 Texto gerado pela IA (primeiros 600 chars):');
      console.log('─'.repeat(50));
      console.log(analise.substring(0, 600) + '...');
      console.log('─'.repeat(50));

      console.log('\n📤 Enviando para Edevaldo...');
      const r = await sender.sendMessage(EDEVALDO_PHONE, analise);
      if (r.success && !r.fallback) {
        console.log('✅ Mensagem enviada com sucesso para Edevaldo!');
        console.log('   Responda com "ok" no WhatsApp para criar as tarefas automaticamente.');
      } else if (r.fallback) {
        console.log('⚠️  Enviado via fallback (arquivo). Evolution API offline?');
      } else {
        console.log('❌ Falha no envio para Edevaldo:', r.error);
      }
    }
  } catch (e) {
    console.error('❌ Erro na análise de venda parada:', e.message);
  }
}

// ─── TESTE 2: Relatório Quinzenal ─────────────────────────────
async function testarQuinzenal() {
  sep('📊 TESTE QUINZENAL — Relatório Estratégico Completo');

  console.log(`\nGerando relatório completo da Isa-Marketing via IA...`);
  console.log(`Destino: Rosana (${ROSANA_PHONE})`);
  console.log('(pode demorar ~30 segundos)\n');

  try {
    const resultado = await executarJobMarketing(db, {
      phone: ROSANA_PHONE,
      forcar: true  // ignora a flag isRunning para forçar execução no teste
    });

    if (resultado.success) {
      console.log(`\n✅ Relatório quinzenal enviado com sucesso!`);
      console.log(`   Report ID: ${resultado.reportId}`);
    } else {
      console.log(`\n❌ Falha ao gerar/enviar relatório quinzenal:`, resultado.error);
    }
  } catch (e) {
    console.error('❌ Erro no relatório quinzenal:', e.message);
  }
}

// ─── Main ─────────────────────────────────────────────────────
async function main() {
  const modo = process.argv[2] || 'diario';

  console.log('\n🤖 Belinha — Teste de Marketing');
  console.log(`   Modo: ${modo}`);
  console.log(`   Rosana:   ${ROSANA_PHONE}`);
  console.log(`   Edevaldo: ${EDEVALDO_PHONE}`);
  console.log(`   Hora:     ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`);

  if (!ROSANA_PHONE) {
    console.error('\n❌ MARKETING_ROSANA_PHONE não configurado no .env!');
    process.exit(1);
  }

  switch (modo) {
    case 'diario':
      await testarDiario();
      break;
    case 'quinzenal':
      await testarQuinzenal();
      break;
    case 'tudo':
      await testarDiario();
      await testarQuinzenal();
      break;
    default:
      console.log('\nUso: node test-marketing-completo.js [diario|quinzenal|tudo]');
  }

  console.log('\n✅ Teste finalizado!\n');
  process.exit(0);
}

main().catch(e => {
  console.error('Erro fatal:', e);
  process.exit(1);
});
