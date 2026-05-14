/**
 * debug-pix-flow.js
 * Script de diagnóstico completo do fluxo PIX
 * 
 * Uso: node debug-pix-flow.js
 * 
 * Testa:
 * 1. Conexão com banco de dados
 * 2. Se a tabela pix_confirmations existe
 * 3. Se o daily_records de hoje existe
 * 4. Simula um lançamento PIX direto (sem IA, sem WhatsApp)
 * 5. Verifica o resultado no banco
 * 6. Verifica configuração da Evolution API
 * 7. Checa se o webhook está configurado corretamente
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const Database = require('better-sqlite3');
const config = require('./config.js');
const fetch = require('node-fetch');

const db = new Database(config.dbPath);
const today = new Date().toISOString().split('T')[0];

console.log('\n========================================');
console.log('  DIAGNÓSTICO COMPLETO DO ROBÔ DE PIX');
console.log('========================================\n');

// ─── 1. BANCO DE DADOS ───────────────────────────────────────────────────────
console.log('📋 [1/7] Verificando banco de dados...');
try {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);
  console.log(`   ✅ Banco OK. Tabelas: ${tables.filter(t => ['pix_confirmations','daily_records','tasks'].includes(t)).join(', ')}`);
  
  if (!tables.includes('pix_confirmations')) {
    console.log('   ❌ PROBLEMA: Tabela pix_confirmations NÃO EXISTE! Banco desatualizado.');
    console.log('   → Solução: Reinicie o servidor para criar as tabelas.');
  }
} catch (e) {
  console.log(`   ❌ ERRO ao acessar banco: ${e.message}`);
  process.exit(1);
}

// ─── 2. PIX CONFIRMATIONS RECENTES ───────────────────────────────────────────
console.log('\n📋 [2/7] Verificando PIX confirmados recentes...');
try {
  const pixRecentes = db.prepare('SELECT * FROM pix_confirmations ORDER BY createdAt DESC LIMIT 5').all();
  if (pixRecentes.length === 0) {
    console.log('   ℹ️  Nenhum PIX confirmado no banco ainda.');
  } else {
    console.log(`   ✅ ${pixRecentes.length} PIX(s) confirmado(s) encontrado(s):`);
    pixRecentes.forEach(p => {
      console.log(`      - ${p.createdAt} | R$ ${p.value} | ${p.senderName} | ${p.phone}`);
    });
  }
} catch (e) {
  console.log(`   ❌ ERRO: ${e.message}`);
}

// ─── 3. REGISTRO DIÁRIO DE HOJE ───────────────────────────────────────────────
console.log('\n📋 [3/7] Verificando registro diário de hoje...');
try {
  const recHoje = db.prepare('SELECT * FROM daily_records WHERE date = ?').get(today);
  if (!recHoje) {
    console.log(`   ℹ️  Nenhum registro diário para hoje (${today}). Será criado automaticamente ao confirmar um PIX.`);
  } else {
    const pixList = JSON.parse(recHoje.pixDiretoList || '[]');
    console.log(`   ✅ Registro de hoje encontrado (id: ${recHoje.id})`);
    console.log(`   📊 PIX Direto lançados hoje: ${pixList.length}`);
    if (pixList.length > 0) {
      pixList.forEach(p => console.log(`      - R$ ${p.val} | ${p.desc}`));
    }
  }
} catch (e) {
  console.log(`   ❌ ERRO: ${e.message}`);
}

// ─── 4. SIMULAÇÃO DE LANÇAMENTO PIX ──────────────────────────────────────────
console.log('\n📋 [4/7] Simulando lançamento PIX de teste...');
try {
  const PixBotService = require('./services/pix-bot.service');
  const pixBot = new PixBotService(db);
  
  const testValue = 0.01; // R$ 0,01 para não confundir com lançamentos reais
  const testSender = 'TESTE-DIAGNOSTICO';
  
  pixBot.recordPixDirect(testValue, testSender, today);
  
  // Verifica se foi inserido
  const recDepois = db.prepare('SELECT * FROM daily_records WHERE date = ?').get(today);
  if (recDepois) {
    const pixListDepois = JSON.parse(recDepois.pixDiretoList || '[]');
    const pixTeste = pixListDepois.find(p => p.desc === testSender);
    if (pixTeste) {
      console.log(`   ✅ Lançamento de teste bem-sucedido! PIX de R$ ${pixTeste.val} inserido no registro do dia.`);
      
      // Remove o lançamento de teste
      const semTeste = pixListDepois.filter(p => p.desc !== testSender);
      db.prepare('UPDATE daily_records SET pixDiretoList = ? WHERE id = ?')
        .run(JSON.stringify(semTeste), recDepois.id);
      console.log('   🧹 Lançamento de teste removido (era apenas diagnóstico).');
    } else {
      console.log('   ❌ PROBLEMA: recordPixDirect executou mas não encontrou o lançamento!');
    }
  } else {
    console.log('   ❌ PROBLEMA: recordPixDirect falhou em criar o registro diário!');
  }
} catch (e) {
  console.log(`   ❌ ERRO na simulação: ${e.message}`);
  console.log('   Stack:', e.stack?.split('\n').slice(0,3).join('\n'));
}

// ─── 5. CONFIGURAÇÃO DA EVOLUTION API ─────────────────────────────────────────
console.log('\n📋 [5/7] Verificando configuração da Evolution API...');
const EVOLUTION_URL = process.env.EVOLUTION_API_URL || 'http://evolution-api:8080';
const EVOLUTION_KEY = process.env.EVOLUTION_API_KEY || 'BelafarmaSul2026';
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE_NAME || 'BelaFarma2';

console.log(`   🔧 URL: ${EVOLUTION_URL}`);
console.log(`   🔧 Instância: ${EVOLUTION_INSTANCE}`);
console.log(`   🔧 Chave: ${EVOLUTION_KEY.substring(0, 8)}...`);

async function checkEvolution() {
  // ─── 6. TESTE DE CONEXÃO COM EVOLUTION API ──────────────────────────────────
  console.log('\n📋 [6/7] Testando conexão com Evolution API...');
  try {
    const response = await fetch(`${EVOLUTION_URL}/instance/fetchInstances`, {
      headers: { 'apikey': EVOLUTION_KEY },
      signal: AbortSignal.timeout(5000)
    });
    
    if (response.ok) {
      const instances = await response.json();
      const instanceList = Array.isArray(instances) ? instances : (instances.data || [instances]);
      console.log(`   ✅ Evolution API acessível! Instâncias: ${instanceList.map(i => i.instance?.instanceName || i.instanceName || JSON.stringify(i)).join(', ')}`);
      
      // Verifica se a instância está conectada
      const minha = instanceList.find(i => 
        (i.instance?.instanceName || i.instanceName) === EVOLUTION_INSTANCE
      );
      if (minha) {
        const status = minha.instance?.state || minha.state || 'desconhecido';
        if (status === 'open') {
          console.log(`   ✅ Instância "${EVOLUTION_INSTANCE}" está CONECTADA (status: ${status})`);
        } else {
          console.log(`   ❌ PROBLEMA: Instância "${EVOLUTION_INSTANCE}" com status: ${status} (esperado: open)`);
        }
      } else {
        console.log(`   ❌ PROBLEMA: Instância "${EVOLUTION_INSTANCE}" NÃO encontrada na Evolution API!`);
        console.log(`   → Instâncias disponíveis: ${instanceList.map(i => i.instance?.instanceName || i.instanceName).join(', ')}`);
      }
    } else {
      const txt = await response.text();
      console.log(`   ❌ Evolution API retornou erro ${response.status}: ${txt.substring(0, 200)}`);
    }
  } catch (e) {
    console.log(`   ❌ ERRO de conexão com Evolution API: ${e.message}`);
    console.log('   → Verifique se a Evolution API está rodando e se a URL está correta no .env');
  }

  // ─── 7. WEBHOOK CONFIGURADO ──────────────────────────────────────────────────
  console.log('\n📋 [7/7] Verificando webhook configurado na Evolution...');
  try {
    const response = await fetch(`${EVOLUTION_URL}/webhook/find/${EVOLUTION_INSTANCE}`, {
      headers: { 'apikey': EVOLUTION_KEY },
      signal: AbortSignal.timeout(5000)
    });
    
    if (response.ok) {
      const webhook = await response.json();
      console.log(`   🔧 Webhook configurado:`);
      console.log(`      URL: ${webhook.url || webhook.webhook?.url || 'não definida'}`);
      console.log(`      Enabled: ${webhook.enabled ?? webhook.webhook?.enabled ?? 'desconhecido'}`);
      console.log(`      Eventos: ${(webhook.events || webhook.webhook?.events || []).join(', ') || 'nenhum'}`);
      
      const webhookUrl = webhook.url || webhook.webhook?.url || '';
      if (!webhookUrl.includes('/api/webhook/evolution')) {
        console.log(`   ❌ PROBLEMA: Webhook não aponta para /api/webhook/evolution!`);
        console.log(`   → Configure o webhook para: http://SEU-SERVIDOR:3001/api/webhook/evolution`);
      } else {
        console.log(`   ✅ Webhook parece corretamente configurado.`);
      }
    } else {
      const txt = await response.text();
      console.log(`   ⚠️  Não foi possível verificar webhook: ${response.status} - ${txt.substring(0, 100)}`);
    }
  } catch (e) {
    console.log(`   ❌ ERRO ao checar webhook: ${e.message}`);
  }

  console.log('\n========================================');
  console.log('  DIAGNÓSTICO CONCLUÍDO');
  console.log('========================================\n');

  db.close();
}

checkEvolution().catch(e => {
  console.error('Erro no diagnóstico:', e.message);
  db.close();
});
