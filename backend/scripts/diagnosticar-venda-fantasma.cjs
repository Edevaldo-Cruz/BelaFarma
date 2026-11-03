/**
 * Belinha ERP - Localizador e Destravador de Venda Fantasma no Digifarma (Firebird)
 * 
 * Localiza vendas incompletas, pré-vendas abertas ou registros corrompidos que
 * impedem o Fechamento de Caixa no sistema Digifarma.
 * 
 * Pode ser executado diretamente no SERVIDOR da drogaria ou em qualquer terminal da rede.
 */

const firebird = require('node-firebird');
const readline = require('readline');

// Lista de hosts para tentar conectar (Servidor local primeiro, depois IPs da rede da farmácia)
const CANDIDATE_HOSTS = [
  process.env.DIGIFARMA_HOST,
  '127.0.0.1',
  'localhost',
  '192.168.1.7',
  '192.168.1.10'
].filter(Boolean);

const BASE_OPTIONS = {
  port: parseInt(process.env.DIGIFARMA_PORT || '3050', 10),
  database: process.env.DIGIFARMA_DB_PATH || 'C:\\Digifarma\\Dados\\digifarma6.fdb',
  user: process.env.DIGIFARMA_USER || 'SYSDBA',
  password: process.env.DIGIFARMA_PASSWORD || 'masterkey',
  lowercase_keys: false,
  role: null,
  pageSize: 4096
};

function tentarConexao(host) {
  return new Promise((resolve, reject) => {
    const opts = { ...BASE_OPTIONS, host };
    const timer = setTimeout(() => {
      reject(new Error(`Timeout de conexão em ${host}:3050`));
    }, 3000);

    firebird.attach(opts, (err, db) => {
      clearTimeout(timer);
      if (err) return reject(err);
      resolve({ db, host });
    });
  });
}

async function conectarFirebird() {
  console.log('🔍 Localizando Servidor do Digifarma na rede...');
  for (const host of CANDIDATE_HOSTS) {
    try {
      process.stdout.write(`   Testando ${host}:3050 ... `);
      const res = await tentarConexao(host);
      console.log(`✅ CONECTADO com sucesso ao Digifarma em ${host}!`);
      return res;
    } catch (e) {
      console.log(`❌ (${e.message})`);
    }
  }
  throw new Error('Não foi possível conectar ao Firebird em nenhum dos IPs conhecidos (127.0.0.1, 192.168.1.7, 192.168.1.10).');
}

function queryPromised(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
}

function executePromised(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.execute(sql, params, (err, result) => {
      if (err) return reject(err);
      resolve(result);
    });
  });
}

async function main() {
  console.log('======================================================================');
  console.log('  DROGARIA BELA FARMA - DIAGNÓSTICO & LIBERAÇÃO DE CAIXA DIGIFARMA');
  console.log('======================================================================\n');

  let conn;
  try {
    conn = await conectarFirebird();
  } catch (err) {
    console.error('\n❌ ERRO CRÍTICO:', err.message);
    console.log('\n💡 DICA: Execute este script diretamente no computador do SERVIDOR ou no terminal do Caixa onde o Digifarma está aberto.');
    process.exit(1);
  }

  const { db, host } = conn;

  try {
    // 1. Obter Caixa Ativo Aberto
    console.log('\n📋 1. Verificando Caixas no Digifarma...');
    const caixas = await queryPromised(db, `
      SELECT FIRST 3 
        CAIXA_ID, OPERADOR_ABERTURA, ABERTURA, FECHAMENTO, 
        VALOR_ABERTURA, TOTAL_VENDAS, VENDAS_DINHEIRO, VENDAS_CARTAO, VENDAS_CREDIARIO
      FROM CAIXA 
      ORDER BY CAIXA_ID DESC
    `);

    if (!caixas || caixas.length === 0) {
      console.log('⚠️ Nenhum caixa encontrado na tabela CAIXA.');
      db.detach();
      return;
    }

    const caixaAberto = caixas.find(c => c.FECHAMENTO === null);

    if (caixaAberto) {
      console.log(`\n🟢 CAIXA ABERTO ENCONTRADO:`);
      console.log(`   - ID do Caixa: ${caixaAberto.CAIXA_ID}`);
      console.log(`   - Operador: ${caixaAberto.OPERADOR_ABERTURA}`);
      console.log(`   - Data de Abertura: ${caixaAberto.ABERTURA}`);
      console.log(`   - Valor Abertura: R$ ${parseFloat(caixaAberto.VALOR_ABERTURA || 0).toFixed(2)}`);
      console.log(`   - Total Vendas Acumuladas: R$ ${parseFloat(caixaAberto.TOTAL_VENDAS || 0).toFixed(2)}`);
    } else {
      console.log('ℹ️ O último caixa cadastrado já consta como FECHADO no banco.');
      console.log(`   Último Caixa ID: ${caixas[0].CAIXA_ID} (Fechado em: ${caixas[0].FECHAMENTO})`);
    }

    const targetCaixaId = caixaAberto ? caixaAberto.CAIXA_ID : caixas[0].CAIXA_ID;

    // 2. Buscar Vendas Fantasmas / Pré-Vendas Pendentes vinculadas a este Caixa
    console.log(`\n🔎 2. Investigando vendas pendentes/fantasmas que impedem o fechamento do Caixa #${targetCaixaId}...`);

    // Critérios que travam o fechamento no Digifarma:
    // A) Pré-vendas não finalizadas (PRE_VENDA IS NOT NULL)
    // B) Vendas com CANCELADO = 'N' e (VENDA_TOTAL = 0 ou VENDA_RECEBIDO = 0 ou CARTAO_FECHADO = 'N' ou CANCELADO_SEM_FECHAR = 'S')
    // C) Vendas sem itens vinculados na tabela ITEM_VENDAS
    const suspeitas = await queryPromised(db, `
      SELECT 
        v.VENDA_NOTA_ID,
        v.PRE_VENDA,
        v.VENDA_DATA_HORA,
        v.VENDA_TOTAL,
        v.VENDA_RECEBIDO,
        v.CANCELADO,
        v.CANCELADO_SEM_FECHAR,
        v.CARTAO_FECHADO,
        v.CAIXA_DEFINIDO,
        v.CLIENTE_CUPOM,
        v.NUM_PEDIDO,
        (SELECT COUNT(1) FROM ITEM_VENDAS iv WHERE iv.VENDA_NOTA_ID = v.VENDA_NOTA_ID) as TOTAL_ITENS
      FROM CAB_VENDAS v
      WHERE v.CAIXA_ID = ?
        AND v.CANCELADO = 'N'
        AND (
          v.PRE_VENDA IS NOT NULL
          OR v.VENDA_TOTAL = 0
          OR v.CARTAO_FECHADO = 'N'
          OR v.CANCELADO_SEM_FECHAR = 'S'
          OR (SELECT COUNT(1) FROM ITEM_VENDAS iv WHERE iv.VENDA_NOTA_ID = v.VENDA_NOTA_ID) = 0
        )
      ORDER BY v.VENDA_NOTA_ID DESC
    `, [targetCaixaId]);

    console.log(`\n📊 Resultado da Varredura: ${suspeitas.length} registro(s) fantasma(s)/pendente(s) encontrado(s)!\n`);

    if (suspeitas.length === 0) {
      console.log('✅ Nenhuma venda fantasma com flag óbvia foi detectada para o Caixa atual.');
      console.log('   Listando as últimas 5 vendas gravadas neste caixa para auditoria manual:');
      const ultimas = await queryPromised(db, `
        SELECT FIRST 5 VENDA_NOTA_ID, VENDA_DATA_HORA, VENDA_TOTAL, CANCELADO, PRE_VENDA, CLIENTE_CUPOM
        FROM CAB_VENDAS
        WHERE CAIXA_ID = ?
        ORDER BY VENDA_NOTA_ID DESC
      `, [targetCaixaId]);
      console.table(ultimas);
    } else {
      console.table(suspeitas.map(s => ({
        'VENDA_ID': s.VENDA_NOTA_ID,
        'PRÉ-VENDA': s.PRE_VENDA || '-',
        'DATA/HORA': String(s.VENDA_DATA_HORA).substring(0, 19),
        'VALOR': `R$ ${parseFloat(s.VENDA_TOTAL || 0).toFixed(2)}`,
        'ITENS': s.TOTAL_ITENS,
        'CLIENTE': s.CLIENTE_CUPOM || s.NUM_PEDIDO || 'Balcão',
        'CARTÃO_FECH': s.CARTAO_FECHADO,
        'MOTIVO_TRAVA': s.TOTAL_ITENS === 0 ? 'Sem itens no cupom' : (s.PRE_VENDA ? 'Pré-venda não faturada' : 'Total zerado/incompleto')
      })));

      console.log('\n----------------------------------------------------------------------');
      console.log('⚠️ ESTES REGISTROS SÃO EXATAMENTE O QUE IMPEDE O DIGIFARMA DE FECHAR O CAIXA!');
      console.log('----------------------------------------------------------------------\n');

      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      rl.question('Deseja CANCELAR automaticamente essas vendas fantasmas no Digifarma para DESTRAVAR o caixa agora? (S/N): ', async (ans) => {
        if (ans.trim().toUpperCase() === 'S') {
          console.log('\n⚡ Destravando caixa no Digifarma...');
          let count = 0;
          for (const item of suspeitas) {
            try {
              await executePromised(db, `
                UPDATE CAB_VENDAS 
                SET CANCELADO = 'S',
                    CANCELADO_CUPOM = 'S',
                    CANCELADO_SEM_FECHAR = 'S',
                    LASTUPDATE = CURRENT_TIMESTAMP
                WHERE VENDA_NOTA_ID = ?
              `, [item.VENDA_NOTA_ID]);

              // Cancelar também itens se houver
              await executePromised(db, `
                UPDATE ITEM_VENDAS
                SET CANCELADO = 'S',
                    LASTUPDATE = CURRENT_TIMESTAMP
                WHERE VENDA_NOTA_ID = ?
              `, [item.VENDA_NOTA_ID]);

              console.log(`   ✅ Venda/Pré-venda #${item.VENDA_NOTA_ID} cancelada com sucesso!`);
              count++;
            } catch (err) {
              console.error(`   ❌ Falha ao cancelar #${item.VENDA_NOTA_ID}:`, err.message);
            }
          }

          console.log(`\n🎉 CONCLUÍDO! ${count} venda(s) fantasma(s) foram canceladas no Firebird.`);
          console.log('👉 Agora você já pode ir no Digifarma e realizar o FECHAMENTO DE CAIXA normalmente!');
        } else {
          console.log('\nOperação cancelada pelo usuário. Nenhuma alteração foi feita no banco.');
          console.log('Você pode anotar o número da Venda/Pré-venda acima e cancelá-la manualmente no Digifarma.');
        }
        rl.close();
        db.detach();
      });
      return;
    }

    db.detach();
  } catch (err) {
    console.error('\n❌ Erro durante a consulta:', err.message);
    try { db.detach(); } catch(e) {}
    process.exit(1);
  }
}

main();
