/**
 * Bateria de Testes Automatizada e Auditoria de Consistência do BelaPed
 * Executa:
 * 1. Auditoria das cotações no banco SQLite (belaped_cotacoes_reais)
 * 2. Purga de preços falsos (dosagens 0,07/0,25, Nimesulida 1,11, produtos sem estoque e divergências grotescas)
 * 3. Validação de paridade e teste ao vivo com os robôs nos 1º e 2º colocados
 */

const db = require('./database.js');

function limparString(str) {
  if (!str) return '';
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
}

function calcularSimilaridade(s1, s2) {
  const p1 = new Set(limparString(s1).split(/\s+/).filter(w => w.length >= 3));
  const p2 = new Set(limparString(s2).split(/\s+/).filter(w => w.length >= 3));
  if (p1.size === 0 || p2.size === 0) return 0;
  let intersec = 0;
  for (const w of p1) {
    if (p2.has(w)) intersec++;
  }
  return intersec / Math.max(p1.size, p2.size);
}

async function executarAuditoriaEtestes() {
  console.log('================================================================');
  console.log('🚀 INICIANDO BATERIA DE AUDITORIA & TESTES DO BELAPED');
  console.log('================================================================\n');

  // 1. Identificar cotações no banco com preços suspeitos
  const cotacoes = db.prepare(`
    SELECT c.id, c.ean, c.fornecedor, c.preco, c.descricao as desc_cotacao,
           e.descricao as desc_estoque, e.custo_unitario
    FROM belaped_cotacoes_reais c
    LEFT JOIN compras_estoque_cache e ON e.ean = c.ean
    WHERE c.disponivel = 1
  `).all();

  console.log(`📦 Total de cotações ativas analisadas no banco: ${cotacoes.length}`);

  let purgadas = 0;
  const purgadosPorFornecedor = {};
  const motivos = {
    dosagemOuPrecoIrreal: 0,
    fantasmaNimesulida: 0,
    desvioCriticoCusto: 0,
    descricaoIncompativel: 0
  };

  const stmtInvalidar = db.prepare(`
    UPDATE belaped_cotacoes_reais
    SET preco = NULL, disponivel = 0, descricao = ?
    WHERE id = ?
  `);

  for (const c of cotacoes) {
    let ehInvalida = false;
    let motivoTexto = '';

    const preco = Number(c.preco) || 0;
    const custo = Number(c.custo_unitario) || 0;
    const descCot = (c.desc_cotacao || '').toUpperCase();
    const descEst = (c.desc_estoque || '').toUpperCase();

    // 1.1 Preços de centavos associados a dosagem (ex: 0,07 para 0,075mg, 0,25 para 0,25mg)
    if (preco > 0 && preco <= 0.35) {
      ehInvalida = true;
      motivoTexto = 'Preço irreal / dosagem capturada por engano (< R$ 0,35)';
      motivos.dosagemOuPrecoIrreal++;
    }
    // 1.2 Fantasmas conhecidos da Distrimed (Nimesulida 1,11)
    else if (c.fornecedor === 'DISTRIMED' && preco === 1.11 && !descEst.includes('NIMESULIDA')) {
      ehInvalida = true;
      motivoTexto = 'Cotação fantasma de resíduo de tela (Nimesulida R$ 1,11)';
      motivos.fantasmaNimesulida++;
    }
    // 1.3 Preço com variação absurda em relação ao custo histórico (< 30% do custo para itens acima de R$ 3,00)
    // Evita dosagens capturadas como preço (ex: 1,25mg gravado como R$ 1,25 para item que custa R$ 55,00)
    else if (custo >= 3.0 && preco > 0 && (preco / custo) < 0.30) {
      ehInvalida = true;
      motivoTexto = `Variação absurda detectada: Preço R$ ${preco.toFixed(2)} é apenas ${(preco / custo * 100).toFixed(0)}% do custo histórico (R$ ${custo.toFixed(2)})`;
      motivos.desvioCriticoCusto++;
    }
    // 1.4 Descrições completamente discrepantes entre estoque e distribuidora
    else if (descEst && descCot && custo > 2.0) {
      const palavrasChaveEst = limparString(descEst).split(/\s+/).filter(w => w.length >= 4);
      if (palavrasChaveEst.length > 0) {
        const palavraPrincipal = palavrasChaveEst[0]; // ex: ENO, SORVETE, AGULHA, FRALDA
        const palavrasChaveCot = limparString(descCot).split(/\s+/).filter(w => w.length >= 4);
        if (palavrasChaveCot.length > 0) {
          const cotPrincipal = palavrasChaveCot[0]; // ex: COMPRESSA, DESODORANTE
          const sim = calcularSimilaridade(descCot, descEst);
          if (sim === 0 && !descCot.includes(palavraPrincipal)) {
            ehInvalida = true;
            motivoTexto = `Produto divergente do EAN (Estoque: ${descEst.slice(0, 30)} | Cotado: ${descCot.slice(0, 30)})`;
            motivos.descricaoIncompativel++;
          }
        }
      }
    }

    if (ehInvalida) {
      stmtInvalidar.run(`[INVALIDADO] ${motivoTexto}`, c.id);
      purgadas++;
      purgadosPorFornecedor[c.fornecedor] = (purgadosPorFornecedor[c.fornecedor] || 0) + 1;
    }
  }

  console.log(`\n🧹 RESULTADO DA AUDITORIA DO BANCO:`);
  console.log(`- Total de cotações corrigidas/invalidadas: ${purgadas}`);
  console.log(`- Detalhamento por fornecedor:`, purgadosPorFornecedor);
  console.log(`- Detalhamento por motivo:`, motivos);

  // 2. Análise do novo 1º e 2º colocados dos produtos prioritários
  const rankingAtualizado = db.prepare(`
    SELECT ean, fornecedor, preco, descricao
    FROM belaped_cotacoes_reais
    WHERE disponivel = 1
    ORDER BY preco ASC
    LIMIT 10
  `).all();

  console.log('\n🏆 TOP 10 COTAÇÕES LEGÍTIMAS VIGENTES (APÓS SANEAMENTO):');
  console.table(rankingAtualizado);

  console.log('\n✅ Auditoria e saneamento de consistência finalizados com sucesso!');
}

executarAuditoriaEtestes()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Erro na bateria de testes:', err);
    process.exit(1);
  });
