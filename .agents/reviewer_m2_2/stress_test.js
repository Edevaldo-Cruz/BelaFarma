const Database = require('better-sqlite3');
const assert = require('assert');
const baileys = require('../../backend/baileys-compras-service');
const service = require('../../backend/services/compras-mineracao.service');

console.log('=== STRESS TEST REVIEWER 2 M2 ===');

const db = new Database(':memory:');
db.exec(`
  CREATE TABLE IF NOT EXISTS compras_fila_aprovacao (
    id TEXT PRIMARY KEY,
    tipo TEXT NOT NULL,
    destinatario_telefone TEXT NOT NULL,
    destinatario_nome TEXT NOT NULL,
    fornecedor_id TEXT,
    fornecedor_nome TEXT NOT NULL,
    distribuidora TEXT,
    mensagem_texto TEXT NOT NULL,
    dados_contexto TEXT,
    status TEXT DEFAULT 'pendente',
    notificado_admin INTEGER DEFAULT 0,
    admin_notificado_em TEXT,
    aprovado_por TEXT,
    aprovado_em TEXT,
    rejeitado_motivo TEXT,
    message_id_enviada TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

// Test 1: Approval Gate Traps
['pendente', 'rejeitado', 'enviado', 'cancelado', 'rascunho'].forEach(status => {
  const id = 'test_' + status;
  db.prepare(`
    INSERT INTO compras_fila_aprovacao (
      id, tipo, destinatario_telefone, destinatario_nome, fornecedor_nome, mensagem_texto, status, created_at, updated_at
    ) VALUES (?, 'tipo', '5532999999999', 'Nome', 'Forn', 'Texto', ?, datetime('now'), datetime('now'))
  `).run(id, status);

  let blocked = false;
  try {
    baileys.enviarMensagemAprovada(id, db);
  } catch (err) {
    blocked = true;
    console.log(`[PASS] Bloqueou envio não autorizado para status "${status}": ${err.message}`);
  }
  assert.ok(blocked, `Deveria ter bloqueado envio com status ${status}`);
});

// Test 2: Inexistent Approval ID
let nonExistentBlocked = false;
try {
  baileys.enviarMensagemAprovada('id_que_nao_existe', db);
} catch (err) {
  nonExistentBlocked = true;
  console.log(`[PASS] Bloqueou ID inexistente: ${err.message}`);
}
assert.ok(nonExistentBlocked, 'Deveria bloquear ID inexistente');

// Test 3: Math and Bonificações Stress Test
const bonifCases = [
  { text: 'Dipirona R$ 10,00 (compre 10 ganhe 2)', expectedGross: 10.00, expectedNet: 8.33 },
  { text: 'Paracetamol R$ 20,00 (compre 20 leve 25)', expectedGross: 20.00, expectedNet: 16.00 },
  { text: 'Ibuprofeno R$ 5,00 (10+2)', expectedGross: 5.00, expectedNet: 4.17 },
  { text: 'Amoxicilina R$ 12,00 (compre 10 leve 12)', expectedGross: 12.00, expectedNet: 10.00 },
  { text: 'Neosaldina R$ 15,00 com 10% de desconto', expectedGross: 15.00, expectedNet: 13.50 },
  { text: 'Dramin R$ 8,00 com 25% off', expectedGross: 8.00, expectedNet: 6.00 }
];

bonifCases.forEach((c, idx) => {
  const res = service.extrairLinhasDeOferta(c.text);
  assert.strictEqual(res.length, 1, `Caso ${idx + 1} deve retornar 1 oferta`);
  assert.strictEqual(res[0].precoBruto, c.expectedGross, `Caso ${idx + 1} preço bruto incorreto`);
  assert.strictEqual(res[0].precoOfertado, c.expectedNet, `Caso ${idx + 1} preço líquido incorreto`);
  console.log(`[PASS] Caso matemático ${idx + 1} ("${c.text}") -> Bruto: ${res[0].precoBruto}, Líquido: ${res[0].precoOfertado}`);
});

console.log('=== TODOS OS TESTES ADVERSARIAIS PASSARAM COM SUCESSO! ===');
