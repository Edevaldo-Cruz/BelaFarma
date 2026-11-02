/**
 * Belinha ERP - Script de Levantamento e Extração de Fornecedores do Digifarma (Firebird)
 * Executa a descoberta das tabelas de fornecedores, extrai os dados cadastrais/fiscais
 * e armazena no cache local SQLite (tabela suppliers) do BelaFarma.
 */

const firebird = require('node-firebird');
const path = require('path');
const fs = require('fs');
const db = require('../database');

// Configuração do Digifarma Firebird (Lê de variáveis de ambiente ou usa fallback do servidor local da farmácia)
const firebirdOptions = {
  host: process.env.DIGIFARMA_HOST || '192.168.1.7',
  port: parseInt(process.env.DIGIFARMA_PORT || '3050', 10),
  database: process.env.DIGIFARMA_DB_PATH || 'C:\\Digifarma\\Dados\\digifarma6.fdb',
  user: process.env.DIGIFARMA_USER || 'SYSDBA',
  password: process.env.DIGIFARMA_PASSWORD || 'masterkey',
  lowercase_keys: false,
  role: null,
  pageSize: 4096
};

// 1. Garante a tabela local de fornecedores enriquecida no SQLite do BelaFarma
function initSuppliersTable() {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS suppliers (
      id TEXT PRIMARY KEY,
      digifarma_id INTEGER,
      razao_social TEXT NOT NULL,
      nome_fantasia TEXT,
      cnpj TEXT,
      inscricao_estadual TEXT,
      inscricao_municipal TEXT,
      logradouro TEXT,
      numero TEXT,
      complemento TEXT,
      bairro TEXT,
      cidade TEXT,
      cod_municipio_ibge TEXT,
      uf TEXT,
      cep TEXT,
      telefone TEXT,
      telefone2 TEXT,
      whatsapp TEXT,
      contato_nome TEXT,
      email TEXT,
      prazo_padrao TEXT,
      pedido_minimo REAL DEFAULT 0,
      ativo INTEGER DEFAULT 1,
      origem TEXT DEFAULT 'DIGIFARMA',
      raw_data TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime'))
    )
  `).run();

  db.prepare(`CREATE INDEX IF NOT EXISTS idx_suppliers_cnpj ON suppliers (cnpj)`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_suppliers_razao ON suppliers (razao_social)`).run();
  console.log('[Suppliers Script] ✅ Tabela local suppliers pronta no SQLite.');
}

async function executarLevantamentoFornecedores() {
  initSuppliersTable();
  console.log(`\n======================================================`);
  console.log(`🔍 INICIANDO VARREDURA DE FORNECEDORES NO DIGIFARMA`);
  console.log(`Conectando em ${firebirdOptions.host}:${firebirdOptions.port}...`);
  console.log(`======================================================\n`);

  return new Promise((resolve, reject) => {
    firebird.attach(firebirdOptions, async (err, fbDb) => {
      if (err) {
        console.error(`[Digifarma] ❌ Não foi possível conectar ao Firebird: ${err.message}`);
        console.log(`[Digifarma] O servidor da farmácia pode estar desligado ou fora do horário comercial.`);
        return resolve({
          sucesso: false,
          erro: err.message,
          motivo: 'Servidor Firebird inacessível no momento.'
        });
      }

      console.log(`[Digifarma] ✅ Conectado com sucesso ao Firebird!`);

      // 1. Busca todas as tabelas do sistema que possam conter fornecedores
      fbDb.query(`
        SELECT TRIM(RDB$RELATION_NAME) AS TNAME 
        FROM RDB$RELATIONS 
        WHERE RDB$SYSTEM_FLAG = 0
        ORDER BY RDB$RELATION_NAME
      `, async (errTabelas, tabelasResult) => {
        if (errTabelas) {
          fbDb.detach();
          return reject(errTabelas);
        }

        const nomesTabelas = (tabelasResult || []).map(r => r.TNAME);
        console.log(`[Digifarma] Total de tabelas encontradas no banco: ${nomesTabelas.length}`);

        const tabelasCandidatas = nomesTabelas.filter(t => 
          t.includes('FORNEC') || t.includes('DISTRIB') || t.includes('FABRIC') || t.includes('COMPRA') || t.includes('ENTRADA')
        );
        console.log(`[Digifarma] Tabelas candidatas identificadas:`, tabelasCandidatas);

        // Se encontrar tabela FORNECEDORES
        const tabelaFornecedores = tabelasCandidatas.find(t => t === 'FORNECEDORES' || t === 'CAD_FORNECEDORES' || t.includes('FORNEC')) || 'FORNECEDORES';

        // 2. Inspeciona as colunas da tabela de fornecedores
        fbDb.query(`
          SELECT TRIM(RDB$FIELD_NAME) AS FNAME 
          FROM RDB$RELATION_FIELDS 
          WHERE RDB$RELATION_NAME = ?
          ORDER BY RDB$FIELD_POSITION
        `, [tabelaFornecedores], (errCols, colsResult) => {
          const colunas = (colsResult || []).map(c => c.FNAME);
          console.log(`[Digifarma] Colunas disponíveis em ${tabelaFornecedores}:`, colunas);

          // 3. Extrai todos os registros de fornecedores
          fbDb.query(`SELECT * FROM ${tabelaFornecedores}`, (errRows, fornecedoresRows) => {
            fbDb.detach();

            if (errRows) {
              console.error(`[Digifarma] Erro ao consultar ${tabelaFornecedores}:`, errRows.message);
              return resolve({ sucesso: false, erro: errRows.message });
            }

            console.log(`[Digifarma] 📦 Total de fornecedores extraídos: ${fornecedoresRows.length}`);

            const upsertStmt = db.prepare(`
              INSERT INTO suppliers (
                id, digifarma_id, razao_social, nome_fantasia, cnpj,
                inscricao_estadual, logradouro, numero, bairro, cidade,
                uf, cep, telefone, email, raw_data, updated_at
              ) VALUES (
                ?, ?, ?, ?, ?,
                ?, ?, ?, ?, ?,
                ?, ?, ?, ?, ?, datetime('now', 'localtime')
              )
              ON CONFLICT(id) DO UPDATE SET
                razao_social = excluded.razao_social,
                nome_fantasia = excluded.nome_fantasia,
                cnpj = excluded.cnpj,
                inscricao_estadual = excluded.inscricao_estadual,
                logradouro = excluded.logradouro,
                bairro = excluded.bairro,
                cidade = excluded.cidade,
                uf = excluded.uf,
                cep = excluded.cep,
                telefone = excluded.telefone,
                email = excluded.email,
                raw_data = excluded.raw_data,
                updated_at = datetime('now', 'localtime')
            `);

            let sincronizados = 0;
            const insertMany = db.transaction((rows) => {
              for (const row of rows) {
                const idForn = String(row.FORNECEDOR_ID || row.FORN_ID || row.ID || row.CODIGO || Math.random());
                const razao = String(row.RAZAO_SOCIAL || row.FORNECEDOR || row.NOME || 'SEM RAZAO SOCIAL').trim();
                const fantasia = String(row.FANTASIA || row.NOME_FANTASIA || row.APELIDO || razao).trim();
                const cnpj = String(row.CNPJ || row.CGC || '').replace(/\D/g, '');
                const ie = String(row.INSC_ESTADUAL || row.IE || '').trim();
                const logradouro = String(row.ENDERECO || row.LOGRADOURO || '').trim();
                const numero = String(row.NUMERO || '').trim();
                const bairro = String(row.BAIRRO || '').trim();
                const cidade = String(row.CIDADE || row.MUNICIPIO || '').trim();
                const uf = String(row.UF || row.ESTADO || '').trim().toUpperCase();
                const cep = String(row.CEP || '').replace(/\D/g, '');
                const tel = String(row.TELEFONE || row.FONE || '').trim();
                const email = String(row.EMAIL || '').trim();

                upsertStmt.run(
                  idForn,
                  parseInt(idForn, 10) || null,
                  razao,
                  fantasia,
                  cnpj,
                  ie,
                  logradouro,
                  numero,
                  bairro,
                  cidade,
                  uf,
                  cep,
                  tel,
                  email,
                  JSON.stringify(row)
                );
                sincronizados++;
              }
            });

            insertMany(fornecedoresRows);

            console.log(`[Digifarma] ✅ ${sincronizados} fornecedores sincronizados com sucesso na tabela suppliers do BelaFarma!`);

            // Salva um arquivo JSON de auditoria
            const auditReport = {
              dataExecucao: new Date().toISOString(),
              totalFornecedores: fornecedoresRows.length,
              tabelaOrigem: tabelaFornecedores,
              colunasMapeadas: colunas,
              amostraFornecedores: fornecedoresRows.slice(0, 10).map(f => ({
                id: f.FORNECEDOR_ID || f.ID,
                razao: f.RAZAO_SOCIAL || f.FORNECEDOR,
                cnpj: f.CNPJ || f.CGC,
                uf: f.UF || f.ESTADO
              }))
            };

            const auditPath = path.join(__dirname, '..', 'reports', 'ultimo_levantamento_fornecedores.json');
            fs.mkdirSync(path.dirname(auditPath), { recursive: true });
            fs.writeFileSync(auditPath, JSON.stringify(auditReport, null, 2), 'utf-8');

            resolve({
              sucesso: true,
              totalFornecedores: fornecedoresRows.length,
              tabelaOrigem: tabelaFornecedores,
              colunas: colunas
            });
          });
        });
      });
    });
  });
}

if (require.main === module) {
  executarLevantamentoFornecedores().then(res => {
    console.log('\nResultado do levantamento:', res);
    process.exit(0);
  }).catch(e => {
    console.error('Falha:', e);
    process.exit(1);
  });
}

module.exports = { executarLevantamentoFornecedores };
