#!/usr/bin/env node
const security = require('../backend/security.js');

async function main() {
  const args = process.argv.slice(2);
  const limite = parseInt(args[0], 10) || 40;
  const prioridade = args[1] || 'P1'; // 'P1', 'P2', 'P3', 'TODAS_PRIORITARIAS'
  const fornecedor = args[2] || 'TODOS';

  console.log('\n=========================================');
  console.log(`🚀 BELAPED: DISPARO DE COTAÇÃO VIA TERMINAL`);
  console.log(`   Lote: ${limite} itens | Prioridade: ${prioridade} | Fornecedor: ${fornecedor}`);
  console.log('=========================================\n');

  try {
    const token = security.signToken({ id: 1, name: 'Admin', role: 'admin' });

    console.log('1. Disparando lote para os robôs...');
    const res = await fetch('http://localhost:3001/api/belaped/cotar-ao-vivo', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify({
        fornecedor,
        limite,
        prioridade: prioridade === 'TODAS_PRIORITARIAS' ? undefined : prioridade
      })
    });

    const data = await res.json();
    if (!data.success) {
      console.error('❌ Falha ao iniciar:', data.error);
      return;
    }

    console.log(`✅ Lote iniciado! Total a cotar: ${data.status?.total || limite} produtos.`);
    console.log('⏳ Acompanhando progresso ao vivo...\n');

    let ultimoProgresso = -1;
    let timer = setInterval(async () => {
      try {
        const sRes = await fetch('http://localhost:3001/api/belaped/status-cotacao', {
          headers: { 'Authorization': 'Bearer ' + token }
        });
        const sData = await sRes.json();
        if (sData.success && sData.status) {
          const s = sData.status;
          const progresso = s.atual || 0;
          const total = s.total || limite;
          const pct = Math.round((progresso / total) * 100);

          if (progresso !== ultimoProgresso || !s.emAndamento) {
            ultimoProgresso = progresso;
            console.log(`[${new Date().toLocaleTimeString('pt-BR')}] Progresso: ${progresso}/${total} (${pct}%) | Preços encontrados: ${s.encontrados} | Último: ${s.ultimoItem || '...'}`);
          }

          if (!s.emAndamento) {
            clearInterval(timer);
            console.log('\n=========================================');
            console.log(`🎉 COTAÇÃO CONCLUÍDA COM SUCESSO!`);
            console.log(`   Total de preços capturados neste lote: ${s.encontrados}`);
            console.log('=========================================\n');
          }
        }
      } catch (e) {
        clearInterval(timer);
        console.error('Erro no polling:', e.message);
      }
    }, 2500);

  } catch (err) {
    console.error('❌ Erro no disparo:', err.message);
  }
}

main();
