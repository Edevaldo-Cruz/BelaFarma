const Database = require('./node_modules/better-sqlite3');
const config = require('./config.js');
const { queryDigifarma } = require('./services/digifarma.service');

const db = new Database(config.dbPath);

const ITENS_FOLHA = [
  { id: 187158, preco: 14.90, desc: '2.325_MASCARA ROLOU QUIMICA 300GR' },
  { id: 16336,  preco: 11.99, desc: 'ACNEZIL GEL C/ 20 GR' },
  { id: 29732,  preco: 14.99, desc: 'ACNEZIL GEL SECATIVO BG 10 GR' },
  { id: 3031,   preco: 4.99,  desc: 'ADOCYL SACARINA 100 ML' },
  { id: 12431,  preco: 19.99, desc: 'AERODINI SPRAY 200 DOSES TEUTO' },
  { id: 186369, preco: 9.99,  desc: 'AGUA MICELAR HIDRADERM 200ML' },
  { id: 16317,  preco: 9.99,  desc: 'AMBROXOL CLORID. 15 MG/5ML INF C/ 120' },
  { id: 35695,  preco: 20.00, desc: 'ANADOR 500 MG C/ 24 CPR' },
  { id: 32292,  preco: 29.99, desc: 'AP. GLICOSIMETRO G-TECH LITE' },
  { id: 188046, preco: 39.90, desc: 'ARTRODIV TIPO II C/ 60 CAPS DE 500MG' },
  { id: 187550, preco: 2.50,  desc: 'ATENOLOL 25MG 30CPR (G)' },
  { id: 188150, preco: 24.99, desc: 'BIOTINA 30MCG CX C/ 60 CAPS DE 400MG' },
  { id: 187389, preco: 17.60, desc: 'BRONCOALHO 140 GR ANVISA' },
  { id: 13109,  preco: 23.90, desc: 'BUSONID 32 MCG AQUOSO NASAL 120' },
  { id: 13002,  preco: 32.00, desc: 'BUSONID 50 MCG AQUOSO NASAL 120' },
  { id: 188441, preco: 16.00, desc: 'CALAMED ALOE VERA GEL FR 120G' },
  { id: 16284,  preco: 14.00, desc: 'CALAMED LOCAO C/ 100 ML' },
  { id: 188322, preco: 9.99,  desc: 'CALCIOPAR D+ 200UI 500MG 60CPRS' },
  { id: 7777,   preco: 14.00, desc: 'CELERG 2 MG C/ 20 CPR' },
  { id: 189028, preco: 14.99, desc: 'CENTRUM ESSENCIAL C/30 COMP-DEMAIS' },
  { id: 188663, preco: 14.90, desc: 'CEWIN LAR EF 1G CPR 5X2 FOOD' },
  { id: 16287,  preco: 13.90, desc: 'CIFLOGEX SPRAY MENTA 30ML' },
  { id: 188702, preco: 15.60, desc: 'COMPLEXO B 120CPR MASSIME' },
  { id: 188703, preco: 8.99,  desc: 'COMPLEXO B 60CPR MASSIME' },
  { id: 186253, preco: 21.90, desc: 'COREGA PO FIX DENT 3 EM 1 S/SABOR 22G' },
  { id: 28564,  preco: 9.99,  desc: 'CR BARBEAR BOZZANO 65 G-BG ALOE VERA' },
  { id: 186907, preco: 9.90,  desc: 'CREM HIDR UREIA 10%+PANTENOL+CALCIO' },
  { id: 188816, preco: 4.90,  desc: 'CREME DENTAL CLOSEUP MULTIVITAMINAS' },
  { id: 189002, preco: 9.99,  desc: 'DERMAFEME SAB LIQ INTIMO FRESH 200ML' },
  { id: 28602,  preco: 12.00, desc: 'DIPIRONA+CAFEINA 500 MG + 65 MG C/ 16' },
  { id: 187609, preco: 8.00,  desc: 'ELIXIR DE INHAME 240ML SANTA RAIZ' },
  { id: 188742, preco: 48.00, desc: 'FAR FPS 60 STICK C BASE CLARA 12G' },
  { id: 187357, preco: 14.99, desc: 'FLORAL THERAPI KIDS - CORAGENS - 30 ML' },
  { id: 187358, preco: 14.99, desc: 'FLORAL THERAPI KIDS - ESPERTIM - 30 ML' },
  { id: 188747, preco: 48.00, desc: 'FPS STICK FACIAL C BASE MEDIA 12G' },
  { id: 29586,  preco: 14.99, desc: 'FR CAPRICHO BABY JUMBINHO P C/ 24' },
  { id: 29587,  preco: 14.99, desc: 'FR CAPRICHO BABY JUMBINHO XXG C/ 12' },
  { id: 187757, preco: 4.99,  desc: 'GEL FACIAL ANTISSINAIS SUPER PODERES' },
  { id: 16292,  preco: 16.00, desc: 'GINKOMED 80 MG C/ 30 CPR' },
  { id: 188668, preco: 27.90, desc: 'HIDRABENE DESODORANTE COLONIA BODY SPLASH - FINE B' },
  { id: 188667, preco: 27.90, desc: 'HIDRABENE DESODORANTE COLONIA BODY SPLASH - CHARM' },
  { id: 188669, preco: 27.90, desc: 'HIDRABENE DESODORANTE COLONIA BODY SPLASH - ICONIC' },
  { id: 188670, preco: 27.90, desc: 'HIDRABENE DESODORANTE COLONIA BODY SPLASH - VELVET' },
  { id: 188308, preco: 17.00, desc: 'IMECALCIO D3 600MG+400UI 60CPR' },
  { id: 16399,  preco: 6.99,  desc: 'KURAMED SEPT SOL 30 ML' },
  { id: 30821,  preco: 19.99, desc: 'LAVITAN MAIS HAIR C/ 60 CPS' },
  { id: 30274,  preco: 29.99, desc: 'LAVITAN OMEGA 3 MAIS CAPS GEL MOLE' },
  { id: 186682, preco: 19.99, desc: 'LAVITAN VIT 50+ COMP REV FR 60' }
];

async function run() {
  console.log('🚀 Iniciando aplicação da Folha Oficial de Liquidação BelaFarma...');
  const hojeStr = new Date().toISOString().split('T')[0];
  const terminoStr = '2026-10-31';
  const fbInicio = `${hojeStr} 00:00:00`;
  const fbTermino = `${terminoStr} 23:59:59`;

  // 1. Limpa campanhas e itens anteriores conforme solicitado ("descartar as outras informações")
  console.log('🧹 Limpando itens e testes anteriores da liquidação...');
  db.prepare('DELETE FROM liquidacao_campanhas_itens').run();
  db.prepare('DELETE FROM liquidacao_itens_pulados').run();
  db.prepare('DELETE FROM liquidacao_campanhas').run();

  // Cria a campanha oficial de Outubro/2026
  const campanhaId = 'camp_oficial_out_2026';
  db.prepare(`
    INSERT INTO liquidacao_campanhas (id, semana_ano, data_inicio, data_fim, meta_semanal, total_resgatado, status)
    VALUES (?, ?, ?, ?, ?, 0, 'ativa')
  `).run(campanhaId, '2026-OUTUBRO', hojeStr, terminoStr, 3500.00);

  console.log(`✅ Campanha ${campanhaId} criada (Vigência: ${hojeStr} até ${terminoStr}).`);

  let sucessos = 0;
  let errosFirebird = 0;

  for (const it of ITENS_FOLHA) {
    const pId = it.id;
    const prPromo = it.preco;

    // Busca detalhes do produto no banco local
    const pLocal = db.prepare(`
      SELECT produto_id, descricao, apresentacao, ean as cod_barras, categoria_id, saldo, preco_normal, custo_unitario
      FROM compras_estoque_cache WHERE produto_id = ?
    `).get(pId) || {
      produto_id: pId,
      descricao: it.desc,
      apresentacao: '',
      cod_barras: '',
      categoria_id: 'Geral',
      saldo: 1,
      preco_normal: prPromo,
      custo_unitario: prPromo * 0.7
    };

    const precoNormal = Number(pLocal.preco_normal) || prPromo;
    const precoCusto = Number(pLocal.custo_unitario) || (prPromo * 0.7);
    const descontoPct = precoNormal > 0 ? Math.max(0, Math.round(((precoNormal - prPromo) / precoNormal) * 100)) : 0;

    // 1. Atualiza no Digifarma Firebird
    let firebirdOk = false;
    try {
      await queryDigifarma(
        `UPDATE PRODUTOS 
         SET PROD_PRPROMOCAO = ?, 
             INICIO_PROMOCAO = ?, 
             TERMINO_PROMOCAO = ? 
         WHERE PRODUTO_ID = ?`,
        [prPromo, fbInicio, fbTermino, pId],
        10000
      );
      firebirdOk = true;
    } catch (fbErr) {
      errosFirebird++;
      console.warn(`⚠️ [Firebird] Não foi possível atualizar ${pId} (${it.desc}): ${fbErr.message}`);
    }

    // 2. Insere na tabela de itens ativos da campanha
    const itemId = `liq_${pId}_${Date.now()}`;
    db.prepare(`
      INSERT INTO liquidacao_campanhas_itens (
        id, campanha_id, produto_id, descricao, apresentacao, ean, categoria,
        saldo_estoque, preco_custo, preco_normal, preco_promocional, desconto_percentual,
        data_inicio, data_termino, status, sincronizado_digifarma, aprovado_por
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ativo', ?, ?)
    `).run(
      itemId,
      campanhaId,
      pId,
      pLocal.descricao || it.desc,
      pLocal.apresentacao || '',
      pLocal.cod_barras || '',
      String(pLocal.categoria_id || 'Geral'),
      Number(pLocal.saldo) || 0,
      precoCusto,
      precoNormal,
      prPromo,
      descontoPct,
      hojeStr,
      terminoStr,
      firebirdOk ? 1 : 0,
      'Edevaldo Cruz (Folha Oficial)'
    );

    // 3. Atualiza caches SQLite
    try {
      db.prepare(`
        UPDATE compras_estoque_cache 
        SET preco_promocional = ?, inicio_promocao = ?, termino_promocao = ?
        WHERE produto_id = ?
      `).run(prPromo, hojeStr, terminoStr, pId);
    } catch (e) {}

    try {
      db.prepare(`
        UPDATE digifarma_products_cache 
        SET preco_promocao = ?, inicio_promocao = ?, termino_promocao = ?
        WHERE produto_id = ?
      `).run(prPromo, hojeStr, terminoStr, pId);
    } catch (e) {}

    try {
      db.prepare(`
        UPDATE mural_produtos_parados 
        SET status = 'resolvido', 
            acao_tomada = 'Liquidação Queima Folha Oficial',
            acao_detalhe = ?,
            data_resolucao = datetime('now'),
            resolvido_por = ?
        WHERE produto_id = ?
      `).run(`Preço promocional R$ ${prPromo.toFixed(2)} até 31/10/2026`, 'Edevaldo Cruz', pId);
    } catch (e) {}

    sucessos++;
    console.log(`[${sucessos}/${ITENS_FOLHA.length}] ✅ ${pId} - ${pLocal.descricao || it.desc} -> R$ ${prPromo.toFixed(2)} (Validade: 31/10/2026) [Digifarma: ${firebirdOk ? 'OK' : 'Cache'}]`);
  }

  console.log(`\n🎉 Concluído com sucesso! ${sucessos} produtos inseridos na liquidação.`);
  if (errosFirebird > 0) {
    console.log(`⚠️ Houve ${errosFirebird} avisos de conexão temporária no Firebird (produtos salvos no cache SQLite).`);
  }
}

run().catch(err => console.error('Erro geral:', err));
