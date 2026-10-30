/**
 * scripts/reorganizar_porcentagens_precificacao.cjs
 *
 * Reorganiza as porcentagens da tabela product_pricing_customizations da Belinha
 * para atingir as médias alinhadas:
 * - Custo Fixo Médio: ~30,00%
 * - Pró-Labore Total Médio: ~16,00% (Sócio 1: ~8,00%, Sócio 2: ~8,00%)
 * - Lucro Líquido Médio: ~2,50%
 *
 * Preços de Venda permanecem 100% INALTERADOS.
 */

const path = require('path');
const Database = require(path.join(__dirname, '..', 'backend', 'node_modules', 'better-sqlite3'));

const DB_PATH = path.join(__dirname, '..', 'data', 'belafarma.db');
console.log('Conectando ao banco de dados:', DB_PATH);

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 30000');

// 1. Criar tabela de Backup de segurança
console.log('\n[1/4] Criando backup de segurança da tabela product_pricing_customizations...');
db.exec(`
  DROP TABLE IF EXISTS product_pricing_customizations_backup_20261029;
  CREATE TABLE product_pricing_customizations_backup_20261029 AS 
  SELECT * FROM product_pricing_customizations;
`);
const backupCount = db.prepare('SELECT COUNT(*) as count FROM product_pricing_customizations_backup_20261029').get().count;
console.log(`✅ Backup criado com sucesso: ${backupCount} produtos salvos em product_pricing_customizations_backup_20261029.`);

// 2. Ler todos os itens atuais
const items = db.prepare('SELECT * FROM product_pricing_customizations').all();
console.log(`\n[2/4] Lendo ${items.length} produtos para reorganização...`);

// 3. Executar atualização transacional
console.log('\n[3/4] Calculando e atualizando percentuais item a item...');

const updateStmt = db.prepare(`
  UPDATE product_pricing_customizations
  SET 
    custo_fixo_pct = ?,
    pro_labore_1_pct = ?,
    pro_labore_2_pct = ?,
    pro_labore_total_pct = ?,
    margem_liquida_pct = ?,
    markup_divisor = ?,
    markup_multiplicador = ?,
    atualizado_por = 'Ajuste Médias Provisões',
    atualizado_em = datetime('now', 'localtime')
  WHERE produto_id = ?
`);

const executeMigration = db.transaction(() => {
  let updatedCount = 0;

  for (const it of items) {
    const p = it.preco_venda || 0;
    const cmv = it.cmv || 0;
    const taxes = (it.imposto_pct || 4) + (it.taxa_cartao_pct || 2.5) + (it.custos_variaveis_pct || 1);
    const m = p > 0 ? Math.max(0, 100 - (cmv / p * 100) - taxes) : 0;

    let fixo = 0, pro = 0, lucro = 0;

    if (m <= 0) {
      fixo = 12.0;
      pro = 2.0;
      lucro = 0.0;
    } else {
      fixo = parseFloat((m * 0.5970).toFixed(2));
      pro = parseFloat((m * 0.3208).toFixed(2));
      lucro = parseFloat((m * 0.0502).toFixed(2));

      // Garante piso de pró-labore
      if (pro < 2) {
        const diff = 2 - pro;
        pro = 2.0;
        fixo = Math.max(0, parseFloat((fixo - diff).toFixed(2)));
      }
    }

    const s1 = parseFloat((pro / 2).toFixed(2));
    const s2 = parseFloat((pro - s1).toFixed(2));

    // Recalcula markup divisor e multiplicador consistentes
    const sumAllDeductions = (it.imposto_pct || 4) + (it.taxa_cartao_pct || 2.5) + (it.custos_variaveis_pct || 1) + fixo + pro + lucro;
    const markupDiv = parseFloat((1 - (sumAllDeductions / 100)).toFixed(4));
    const markupMult = markupDiv > 0 ? parseFloat((1 / markupDiv).toFixed(2)) : (it.markup_multiplicador || 1);

    updateStmt.run(fixo, s1, s2, pro, lucro, markupDiv, markupMult, it.produto_id);
    updatedCount++;
  }

  return updatedCount;
});

const totalUpdated = executeMigration();
console.log(`✅ ${totalUpdated} produtos atualizados com sucesso em transação única.`);

// 4. Conferência das Médias Finais
console.log('\n[4/4] Verificando médias calculadas após a migração...');

const updatedItems = db.prepare('SELECT * FROM product_pricing_customizations').all();
let sumPreco = 0;
let sumCmv = 0;
let sumFixo = 0;
let sumPro = 0;
let sumS1 = 0;
let sumS2 = 0;
let sumLucro = 0;
let sumImposto = 0;
let sumCartao = 0;
let priceDifferences = 0;

for (const it of updatedItems) {
  sumPreco += (it.preco_venda || 0);
  sumCmv += (it.cmv || 0);
  sumFixo += (it.custo_fixo_pct || 0);
  sumPro += (it.pro_labore_total_pct || 0);
  sumS1 += (it.pro_labore_1_pct || 0);
  sumS2 += (it.pro_labore_2_pct || 0);
  sumLucro += (it.margem_liquida_pct || 0);
  sumImposto += (it.imposto_pct || 0);
  sumCartao += (it.taxa_cartao_pct || 0);

  // Compara com o backup
  const original = db.prepare('SELECT preco_venda FROM product_pricing_customizations_backup_20261029 WHERE produto_id = ?').get(it.produto_id);
  if (!original || Math.abs(original.preco_venda - it.preco_venda) > 0.001) {
    priceDifferences++;
  }
}

const n = updatedItems.length;
console.log('\n======================================================');
console.log('   📊 RELATÓRIO FINAL DE MÉDIAS (339 PRODUTOS)');
console.log('======================================================');
console.log(`Preço Médio de Venda: R$ ${(sumPreco / n).toFixed(2)} (Inalterado: ${priceDifferences === 0 ? 'SIM ✅ (0 divergências)' : 'NÃO ❌'})`);
console.log(`CMV Médio (Custo de Compra): R$ ${(sumCmv / n).toFixed(2)}`);
console.log('------------------------------------------------------');
console.log(`🏢 Custo Fixo Médio:        ${(sumFixo / n).toFixed(2)}%  (Meta: 30,00%)`);
console.log(`👥 Pró-Labore Total Médio:  ${(sumPro / n).toFixed(2)}%  (Meta: 16,00%)`);
console.log(`   ↳ Sócio 1:               ${(sumS1 / n).toFixed(2)}%  (Meta: ~8,00%)`);
console.log(`   ↳ Sócio 2:               ${(sumS2 / n).toFixed(2)}%  (Meta: ~8,00%)`);
console.log(`📈 Margem Líquida / Lucro:  ${(sumLucro / n).toFixed(2)}%  (Meta: 2,50%)`);
console.log(`🏛️ Impostos Médios:         ${(sumImposto / n).toFixed(2)}%`);
console.log(`💳 Taxa Cartão Média:       ${(sumCartao / n).toFixed(2)}%`);
console.log('======================================================\n');

db.close();
console.log('Conexão SQLite encerrada com sucesso.');
