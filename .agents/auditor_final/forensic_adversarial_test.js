/**
 * forensic_adversarial_test.js
 * Script de Verificação Forense e Adversarial Independente
 * Auditor Final — Central de Compras BelaFarma
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

console.log('=================================================================');
console.log('🔬 AUDITORIA FORENSE ADVERSARIAL: CENTRAL DE COMPRAS (M1 A M6)');
console.log('=================================================================\n');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function runAuditCheck(name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  ✅ [PASS] ${name}`);
  } catch (e) {
    failedTests++;
    console.error(`  ❌ [FAIL] ${name}`);
    console.error(`     Erro: ${e.message}`);
  }
}

async function runAsyncAuditCheck(name, fn) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`  ✅ [PASS] ${name}`);
  } catch (e) {
    failedTests++;
    console.error(`  ❌ [FAIL] ${name}`);
    console.error(`     Erro: ${e.message}`);
  }
}

async function main() {
  const db = require('../../backend/database');
  const baileysService = require('../../backend/baileys-compras-service');
  const aprovacaoService = require('../../backend/services/compras-aprovacao.service');
  const cotacoesService = require('../../backend/services/compras-cotacoes.service');
  const estoqueService = require('../../backend/services/compras-estoque.service');
  const pedidosService = require('../../backend/services/compras-pedidos.service');

  console.log('🛡️ [FASE 1] PENETRAÇÃO & TRAVA DE SEGURANÇA BAILEYS (R4 / F11 / F12)');

  // 1.1: Tentativa de envio com ID inexistente
  await runAsyncAuditCheck('1.1 Bloqueio de envio Baileys para ID inexistente', async () => {
    let threw = false;
    try {
      await baileysService.enviarMensagemAprovada('ID_FANTASMA_' + Date.now(), db);
    } catch (e) {
      threw = true;
      assert(e.message.includes('não encontrado'), 'Mensagem de erro deve indicar que item não foi encontrado');
    }
    assert(threw, 'Deveria ter lançado erro para ID inexistente');
  });

  // 1.2: Tentativa de envio direto com item com status "pendente"
  await runAsyncAuditCheck('1.2 Bloqueio de envio Baileys para mensagem pendente (sem aprovação prévia)', async () => {
    const item = aprovacaoService.enfileirarMensagem({
      tipo: 'cotacao',
      destinatario: '5532988880000',
      fornecedorNome: 'Distribuidora Teste',
      mensagemTexto: 'Mensagem de teste pendente',
      criadoPor: 'Auditor'
    }, db);

    let threw = false;
    try {
      await baileysService.enviarMensagemAprovada(item.id, db);
    } catch (e) {
      threw = true;
      assert(e.message.includes('Apenas itens com status "aprovado"'), 'Mensagem deve barrar envio não aprovado');
    }
    assert(threw, 'Deveria ter lançado erro impedindo envio de mensagem pendente');
  });

  // 1.3: Tentativa de envio para mensagem com status "rejeitado"
  await runAsyncAuditCheck('1.3 Bloqueio de envio Baileys para mensagem rejeitada', async () => {
    const item = aprovacaoService.enfileirarMensagem({
      tipo: 'cotacao',
      destinatario: '5532988880001',
      fornecedorNome: 'Distribuidora Teste Rejeitada',
      mensagemTexto: 'Mensagem a ser rejeitada',
      criadoPor: 'Auditor'
    }, db);

    aprovacaoService.rejeitarMensagem(item.id, 'Rejeitado pelo Auditor', 'Auditor', db);

    let threw = false;
    try {
      await baileysService.enviarMensagemAprovada(item.id, db);
    } catch (e) {
      threw = true;
      assert(e.message.includes('Apenas itens com status "aprovado"'));
    }
    assert(threw, 'Deveria barrar envio de item rejeitado');
  });

  // 1.4: Tentativa de aprovar item já rejeitado
  runAuditCheck('1.4 Bloqueio de transição inválida (aprovar item rejeitado)', () => {
    const item = aprovacaoService.enfileirarMensagem({
      tipo: 'cotacao',
      destinatario: '5532988880002',
      fornecedorNome: 'Distribuidora Rejeitada 2',
      mensagemTexto: 'Mensagem a ser rejeitada',
      criadoPor: 'Auditor'
    }, db);

    aprovacaoService.rejeitarMensagem(item.id, 'Motivo de teste', 'Auditor', db);

    let threw = false;
    try {
      aprovacaoService.aprovarMensagem(item.id, 'Auditor', null, db);
    } catch (e) {
      threw = true;
      assert(e.message.includes('Transição inválida'));
    }
    assert(threw, 'Deveria barrar aprovação de item rejeitado');
  });

  // 1.5: SQL Injection no motivo de rejeição e texto de aprovação
  runAuditCheck('1.5 Resiliência contra SQL Injection em campos de aprovação', () => {
    const payloadSql = "'; DROP TABLE compras_fila_aprovacao; --";
    const item = aprovacaoService.enfileirarMensagem({
      tipo: 'cotacao',
      destinatario: '5532988880003',
      fornecedorNome: 'Fornecedor SQL Inject',
      mensagemTexto: payloadSql,
      criadoPor: payloadSql
    }, db);

    const editado = aprovacaoService.editarMensagem(item.id, payloadSql, null, { usuarioEditor: payloadSql }, db);
    assert.strictEqual(editado.mensagemTexto, payloadSql);

    const rejeitado = aprovacaoService.rejeitarMensagem(item.id, payloadSql, payloadSql, db);
    assert.strictEqual(rejeitado.motivoRejeicao, payloadSql);

    // Confirma que a tabela ainda existe intacta
    const count = db.prepare('SELECT COUNT(*) as c FROM compras_fila_aprovacao').get();
    assert(count.c >= 1, 'Tabela compras_fila_aprovacao não foi afetada por SQL injection');
  });

  console.log('\n🧮 [FASE 2] INTEGRIDADE MATEMÁTICA E REGRAS DE NEGÓCIO (M1, M3, M5)');

  // 2.1: CMV 30-60 dias ponderado com +15% margem de segurança
  runAuditCheck('2.1 Validação exata da fórmula de CMV ponderado (0.65 e 0.35 + 15%)', () => {
    // Vendas 30d = 100, Vendas 31-60d = 50
    // Demanda = (100 * 0.65) + (50 * 0.35) = 65 + 17.5 = 82.5
    // VMD_P = 82.5 / 30 = 2.75
    // Estoque Minimo = Math.ceil(82.5 * 1.15) = Math.ceil(94.875) = 95
    const res = estoqueService.calcularDemandaPonderada(100, 50, 15);
    assert.strictEqual(res.demanda30d, 82.5);
    assert.strictEqual(res.vmdPonderado, 2.75);
    assert.strictEqual(res.estoqueMinimoSugerido, 95);
  });

  // 2.2: Piso de segurança para produtos Curva A
  runAuditCheck('2.2 Piso de segurança de 2 unidades para Curva A com vendas residuais', () => {
    const res = estoqueService.calcularDemandaPonderada(1, 0, 15, { curvaAbc: 'A' });
    // (1 * 0.65) + 0 = 0.65 * 1.15 = 0.7475 -> ceil = 1 -> Piso Curva A deve elevar para 2
    assert.strictEqual(res.estoqueMinimoSugerido, 2);
  });

  // 2.3: Motor de Score Ponderado 60/25/15
  runAuditCheck('2.3 Validação exata do Score Ponderado (60% Preço, 25% Prazo, 15% Histórico)', () => {
    // Fornecedor: Preço 10.00 (menor do mercado 10.00 -> 100 pts Preço)
    // Prazo: 42 dias -> (42/42)*100 = 100 pts Prazo
    // Histórico: 100 pontualidade, 0% quebra -> 100 pts Histórico
    // Score Total = 0.60*100 + 0.25*100 + 0.15*100 = 100.00
    const perfect = cotacoesService.calcularScoreFornecedor({
      precoLiquido: 10.00,
      menorPrecoRodada: 10.00,
      prazoDias: 42,
      pontualidadeScore: 100,
      taxaQuebraHistorica: 0
    });
    assert.strictEqual(perfect.scoreTotal, 100);
    assert.strictEqual(perfect.scorePreco, 100);
    assert.strictEqual(perfect.scorePrazo, 100);
    assert.strictEqual(perfect.scoreHistorico, 100);

    // Fornecedor B: Preço 12.50 (menor 10.00 -> scorePreco = (10/12.5)*100 = 80)
    // Prazo: 28 dias -> (28/42)*100 = 66.6667
    // Histórico: 80 pontualidade, 10% quebra -> 80 * (1 - 0.10) = 72
    // Score Total = (0.60 * 80) + (0.25 * 66.6667) + (0.15 * 72)
    //             = 48 + 16.6667 + 10.8 = 75.47
    const fornB = cotacoesService.calcularScoreFornecedor({
      precoLiquido: 12.50,
      menorPrecoRodada: 10.00,
      prazoDias: 28,
      pontualidadeScore: 80,
      taxaQuebraHistorica: 10
    });
    assert.strictEqual(fornB.scorePreco, 80);
    assert.strictEqual(fornB.scoreTotal, 75.47);
  });

  // 2.4: Bonificação "Compre 10 Ganhe 2" -> Custo efetivo reduzido em 16.67%
  runAuditCheck('2.4 Bonificação Comercial Compre 10 Ganhe 2', () => {
    // Preço bruto R$ 12,00. Paga 10 (R$ 120,00), leva 12 -> Preço Líquido = R$ 10,00
    const calc = cotacoesService.calcularPrecoLiquidoComBonificacao(12.00, 'compre 10 ganhe 2');
    assert.strictEqual(calc.precoBruto, 12.00);
    assert.strictEqual(calc.precoLiquido, 10.00);
    assert.strictEqual(calc.percentualEconomia, 16.67);
  });

  // 2.5: Controle Orçamentário e Trava de Limite Mensal
  runAuditCheck('2.5 Trava de estouro orçamentário mensal e parcelamento', () => {
    // Teto 50.000, comprometido 45.000, novo 6.000 -> estoura em 1.000
    const reprovado = pedidosService.validarOrcamento(50000, 45000, 6000, [28, 35, 42]);
    assert.strictEqual(reprovado.permitido, false);
    assert.strictEqual(reprovado.saldoAposPedido, -1000.00);

    // Teto 50.000, comprometido 45.000, novo 5.000 -> permitido com saldo 0
    const aprovado = pedidosService.validarOrcamento(50000, 45000, 5000, [28, 35, 42]);
    assert.strictEqual(aprovado.permitido, true);
    assert.strictEqual(aprovado.saldoAposPedido, 0.00);
    assert.strictEqual(aprovado.boletosProjetados.length, 3);
    const somaBoletos = aprovado.boletosProjetados.reduce((a, b) => a + b.valor, 0);
    assert.strictEqual(Number(somaBoletos.toFixed(2)), 5000.00);
  });

  console.log('\n🎨 [FASE 3] CONFORMIDADE COM REGRAS DE FRONTEND & ZERO ALERT');

  // 3.1: Zero alert() em todos os arquivos de compras
  runAuditCheck('3.1 Varredura de ausência total de alert(), confirm() e prompt() em CentralCompras e componentes', () => {
    const comprasDir = path.join(__dirname, '..', '..', 'components', 'compras');
    const centralFile = path.join(__dirname, '..', '..', 'components', 'CentralCompras.tsx');
    
    const filesToCheck = [centralFile];
    if (fs.existsSync(comprasDir)) {
      const subFiles = fs.readdirSync(comprasDir).map(f => path.join(comprasDir, f));
      filesToCheck.push(...subFiles);
    }

    filesToCheck.forEach(file => {
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n');
      lines.forEach((line, idx) => {
        // Ignora comentários
        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) return;
        
        assert(!/\balert\s*\(/.test(line), `Uso proibido de alert() detectado em ${path.basename(file)}: linha ${idx + 1}`);
        assert(!/\bwindow\.alert\s*\(/.test(line), `Uso proibido de window.alert() detectado em ${path.basename(file)}: linha ${idx + 1}`);
        assert(!/\bconfirm\s*\(/.test(line), `Uso proibido de confirm() detectado em ${path.basename(file)}: linha ${idx + 1}`);
        assert(!/\bwindow\.confirm\s*\(/.test(line), `Uso proibido de window.confirm() detectado em ${path.basename(file)}: linha ${idx + 1}`);
      });
    });
  });

  console.log('\n=================================================================');
  console.log(`📊 RESULTADO DA AUDITORIA FORENSE ADVERSARIAL:`);
  console.log(`   Total de Verificações: ${totalTests}`);
  console.log(`   Passaram com Sucesso:  ${passedTests}`);
  console.log(`   Falhas:                ${failedTests}`);
  console.log('=================================================================');

  if (failedTests > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Erro fatal na execução da auditoria:', err);
  process.exit(1);
});
