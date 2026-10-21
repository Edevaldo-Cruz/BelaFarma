#!/usr/bin/env node
const security = require('../backend/security.js');

async function main() {
  console.log('\n=========================================');
  console.log('🔄 BELAPED: RESET DE COTAÇÃO VIA TERMINAL');
  console.log('=========================================\n');

  try {
    const token = security.signToken({ id: 1, name: 'Admin', role: 'admin' });

    console.log('1. Enviando solicitação de reset e destrave ao backend...');
    const res = await fetch('http://localhost:3001/api/belaped/reiniciar-cotacao', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify({
        fornecedor: 'TODOS',
        dispararImediato: false
      })
    });

    const data = await res.json();
    if (data.success) {
      console.log('✅ Status dos robôs resetado com sucesso!');
      console.log('   Mensagem:', data.message || 'Pronto para novo ciclo.');
    } else {
      console.warn('⚠️ Resposta do backend:', data);
    }

    // 2. Consulta o status da fila após o reset
    const statusRes = await fetch('http://localhost:3001/api/belaped/status-cotacao', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const statusData = await statusRes.json();
    if (statusData.success && statusData.status) {
      const fila = statusData.status.fila || {};
      console.log('\n📊 ESTADO ATUAL DA FILA:');
      console.log(`   - Já cotados hoje: ${fila.jaCotados || 0}`);
      console.log(`   - Aguardando robô: ${fila.aguardandoRobo || 0}`);
      console.log(`   - P1 (Ruptura Crítica): ${fila.p1Aguardando || 0}`);
      console.log(`   - P2 (Risco Iminente): ${fila.p2Aguardando || 0}`);
      console.log(`   - P3 (Orçamento Semanal): ${fila.p3Aguardando || 0}`);
      console.log(`   - Em andamento agora: ${statusData.status.emAndamento ? 'SIM' : 'NÃO (Livre para iniciar)'}`);
    }

    console.log('\n✨ Robôs 100% livres e prontos! Você já pode disparar nova cotação pela tela ou pelo terminal.');
  } catch (err) {
    console.error('❌ Erro ao resetar cotação:', err.message);
  }
}

main();
