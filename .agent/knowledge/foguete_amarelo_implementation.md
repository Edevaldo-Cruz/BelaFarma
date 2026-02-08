# Sistema Foguete Amarelo - Cimed
## Análise de Requisitos e Proposta de Implementação

---

## 📌 Resumo do Problema de Negócio

O fornecedor **Cimed** (Projeto Foguete Amarelo) oferece:
- **Prazo de pagamento**: 120 dias para o valor total da nota fiscal
- **Condição especial**: Se um produto da nota for vendido antes dos 120 dias, o custo desse produto é cobrado em **D+1** (dia seguinte)
- **Amortização**: O valor cobrado em D+1 é **abatido** do saldo total que venceria em 120 dias

---

## 🗄️ Alterações na Estrutura do Banco de Dados

### 1. Tabela: `invoices` (Notas Fiscais de Entrada)
```sql
CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  invoice_number TEXT NOT NULL UNIQUE,
  supplier_name TEXT NOT NULL,
  issue_date TEXT NOT NULL,           -- Data de emissão da nota
  total_value REAL NOT NULL,          -- Valor total da nota
  is_foguete_amarelo INTEGER DEFAULT 0, -- Flag booleana (0 = não, 1 = sim)
  payment_due_date TEXT,              -- Data de vencimento (120 dias se Foguete Amarelo)
  status TEXT DEFAULT 'Ativa',        -- 'Ativa', 'Quitada', 'Cancelada'
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,           -- ID do usuário que cadastrou
  notes TEXT
);
```

### 2. Tabela: `invoice_items` (Itens da Nota Fiscal)
```sql
CREATE TABLE IF NOT EXISTS invoice_items (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL,
  product_code TEXT NOT NULL,         -- Código/EAN do produto
  product_name TEXT NOT NULL,
  quantity REAL NOT NULL,             -- Quantidade comprada
  unit_cost REAL NOT NULL,            -- Custo unitário
  total_cost REAL NOT NULL,           -- Custo total (quantity * unit_cost)
  quantity_sold REAL DEFAULT 0,       -- Quantidade já vendida
  quantity_remaining REAL,            -- Quantidade ainda em estoque
  FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
);
```

### 3. Tabela: `foguete_amarelo_payments` (Pagamentos Antecipados)
```sql
CREATE TABLE IF NOT EXISTS foguete_amarelo_payments (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL,
  invoice_number TEXT NOT NULL,
  sale_id TEXT,                       -- ID da venda que gerou o pagamento
  payment_date TEXT NOT NULL,         -- Data do pagamento (D+1 da venda)
  value REAL NOT NULL,                -- Valor do pagamento antecipado
  status TEXT DEFAULT 'Pendente',     -- 'Pendente', 'Pago', 'Cancelado'
  created_at TEXT NOT NULL,
  notes TEXT,
  FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
);
```

### 4. Tabela: `sales` (Vendas - PDV)
```sql
CREATE TABLE IF NOT EXISTS sales (
  id TEXT PRIMARY KEY,
  sale_date TEXT NOT NULL,
  total_value REAL NOT NULL,
  payment_method TEXT NOT NULL,       -- 'Dinheiro', 'Cartão', 'Pix', etc.
  customer_id TEXT,                   -- Opcional: ID do cliente
  user_id TEXT NOT NULL,              -- ID do operador que realizou a venda
  status TEXT DEFAULT 'Finalizada',   -- 'Finalizada', 'Cancelada'
  created_at TEXT NOT NULL,
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);
```

### 5. Tabela: `sale_items` (Itens da Venda)
```sql
CREATE TABLE IF NOT EXISTS sale_items (
  id TEXT PRIMARY KEY,
  sale_id TEXT NOT NULL,
  product_code TEXT NOT NULL,
  product_name TEXT NOT NULL,
  quantity REAL NOT NULL,
  unit_price REAL NOT NULL,           -- Preço de venda unitário
  total_price REAL NOT NULL,          -- Preço total (quantity * unit_price)
  unit_cost REAL NOT NULL,            -- Custo unitário (para cálculo de margem)
  invoice_item_id TEXT,               -- Referência ao item da nota (lote)
  is_foguete_amarelo INTEGER DEFAULT 0, -- Flag se veio de nota Foguete Amarelo
  FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
  FOREIGN KEY (invoice_item_id) REFERENCES invoice_items(id)
);
```

### 6. Tabela: `accounts_payable` (Contas a Pagar - Atualização)
```sql
-- Adicionar campos à tabela existente ou criar nova
ALTER TABLE boletos ADD COLUMN invoice_id TEXT;
ALTER TABLE boletos ADD COLUMN is_foguete_amarelo INTEGER DEFAULT 0;
ALTER TABLE boletos ADD COLUMN original_value REAL; -- Valor original
ALTER TABLE boletos ADD COLUMN amortized_value REAL DEFAULT 0; -- Valor já amortizado
ALTER TABLE boletos ADD COLUMN remaining_value REAL; -- Saldo restante

-- Ou criar uma nova tabela específica:
CREATE TABLE IF NOT EXISTS accounts_payable (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,                 -- 'Nota Fiscal', 'Boleto Avulso', 'Conta Fixa'
  reference_id TEXT,                  -- ID da nota, boleto, etc.
  supplier_name TEXT NOT NULL,
  description TEXT,
  due_date TEXT NOT NULL,
  original_value REAL NOT NULL,
  amortized_value REAL DEFAULT 0,
  remaining_value REAL NOT NULL,
  status TEXT DEFAULT 'Pendente',     -- 'Pendente', 'Pago', 'Vencido'
  is_foguete_amarelo INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  paid_at TEXT,
  notes TEXT
);
```

---

## 🔄 Fluxo de Processos

### **Processo 1: Cadastro de Nota Fiscal (Compras)**

```
INÍCIO
  ├─ Usuário preenche formulário de entrada de nota
  ├─ Campos principais:
  │   ├─ Número da Nota
  │   ├─ Fornecedor (Cimed)
  │   ├─ Data de Emissão
  │   ├─ Valor Total
  │   ├─ ☑️ Checkbox "É Foguete Amarelo?"
  │   └─ Lista de Produtos (código, nome, qtd, custo unitário)
  │
  ├─ SE checkbox "É Foguete Amarelo" MARCADO:
  │   ├─ Calcular data de vencimento = Data Emissão + 120 dias
  │   ├─ Criar registro em `invoices` com is_foguete_amarelo = 1
  │   ├─ Criar registros em `invoice_items` para cada produto
  │   └─ Criar "Título Principal" em `accounts_payable`:
  │       ├─ type = 'Nota Fiscal'
  │       ├─ reference_id = invoice.id
  │       ├─ due_date = Data Emissão + 120 dias
  │       ├─ original_value = total_value
  │       ├─ remaining_value = total_value
  │       ├─ is_foguete_amarelo = 1
  │       └─ status = 'Pendente'
  │
  └─ SENÃO:
      └─ Processar como nota fiscal normal
FIM
```

---

### **Processo 2: Venda de Produto (PDV)**

```
INÍCIO - Finalizar Venda
  ├─ Para cada item vendido:
  │   ├─ Buscar produto no estoque
  │   ├─ Identificar lote (invoice_item_id) de onde sairá o produto
  │   │   └─ Critério: FIFO (First In, First Out) ou outro critério definido
  │   │
  │   ├─ Verificar SE o lote pertence a uma nota Foguete Amarelo:
  │   │   └─ Query: 
  │   │       SELECT ii.*, i.is_foguete_amarelo, i.id as invoice_id
  │   │       FROM invoice_items ii
  │   │       JOIN invoices i ON ii.invoice_id = i.id
  │   │       WHERE ii.product_code = ? 
  │   │         AND i.is_foguete_amarelo = 1
  │   │         AND i.status = 'Ativa'
  │   │         AND ii.quantity_remaining > 0
  │   │       ORDER BY i.issue_date ASC
  │   │       LIMIT 1
  │   │
  │   └─ SE is_foguete_amarelo = 1:
  │       ├─ Calcular custo da venda:
  │       │   └─ custo_venda = quantity_vendida * unit_cost
  │       │
  │       ├─ Criar registro em `foguete_amarelo_payments`:
  │       │   ├─ invoice_id = invoice.id
  │       │   ├─ sale_id = sale.id
  │       │   ├─ payment_date = Data da Venda + 1 dia
  │       │   ├─ value = custo_venda
  │       │   └─ status = 'Pendente'
  │       │
  │       ├─ Atualizar `accounts_payable` (Título Principal):
  │       │   ├─ amortized_value += custo_venda
  │       │   └─ remaining_value = original_value - amortized_value
  │       │
  │       ├─ Atualizar `invoice_items`:
  │       │   ├─ quantity_sold += quantity_vendida
  │       │   └─ quantity_remaining -= quantity_vendida
  │       │
  │       └─ Registrar em `sale_items`:
  │           ├─ invoice_item_id = ii.id
  │           ├─ is_foguete_amarelo = 1
  │           └─ unit_cost = ii.unit_cost
  │
  └─ Finalizar venda normalmente
FIM
```

---

### **Processo 3: Dashboard Financeiro - Monitoramento Foguete Amarelo**

```
QUERY para listar notas Foguete Amarelo ativas:

SELECT 
  i.id,
  i.invoice_number,
  i.supplier_name,
  i.issue_date,
  i.payment_due_date,
  ap.original_value,
  ap.amortized_value,
  ap.remaining_value,
  (ap.amortized_value * 100.0 / ap.original_value) as percentual_amortizado,
  COUNT(fap.id) as total_pagamentos_antecipados,
  SUM(fap.value) as total_pago_antecipadamente
FROM invoices i
JOIN accounts_payable ap ON ap.reference_id = i.id AND ap.type = 'Nota Fiscal'
LEFT JOIN foguete_amarelo_payments fap ON fap.invoice_id = i.id
WHERE i.is_foguete_amarelo = 1 
  AND i.status = 'Ativa'
GROUP BY i.id
ORDER BY i.payment_due_date ASC;
```

**Exibição no Dashboard:**
```
┌─────────────────────────────────────────────────────────────────┐
│  📊 Monitoramento Foguete Amarelo - Cimed                       │
├─────────────────────────────────────────────────────────────────┤
│  NF: 12345  |  Emissão: 01/02/2026  |  Venc: 01/06/2026        │
│  ────────────────────────────────────────────────────────────    │
│  💰 Valor Original:      R$ 10.000,00                           │
│  ✅ Já Amortizado:       R$  3.500,00  (35%)                    │
│  ⏳ Saldo Restante:      R$  6.500,00                           │
│  📦 Pagamentos D+1:      7 lançamentos                          │
│  ────────────────────────────────────────────────────────────    │
│  [Ver Detalhes]  [Histórico de Vendas]                         │
└─────────────────────────────────────────────────────────────────┘
```

---

## 💻 Pseudocódigo - Backend

### **Endpoint: POST /api/sales (Criar Venda)**

```javascript
app.post('/api/sales', async (req, res) => {
  const { items, paymentMethod, customerId, userId } = req.body;
  
  const transaction = db.transaction(() => {
    // 1. Criar registro de venda
    const saleId = `sale_${Date.now()}`;
    const saleDate = new Date().toISOString().split('T')[0];
    const totalValue = items.reduce((sum, item) => sum + item.total_price, 0);
    
    db.prepare(`
      INSERT INTO sales (id, sale_date, total_value, payment_method, customer_id, user_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(saleId, saleDate, totalValue, paymentMethod, customerId, userId, new Date().toISOString());
    
    // 2. Processar cada item da venda
    for (const item of items) {
      // 2.1. Buscar lote (invoice_item) do produto - FIFO
      const invoiceItem = db.prepare(`
        SELECT ii.*, i.is_foguete_amarelo, i.id as invoice_id, i.invoice_number
        FROM invoice_items ii
        JOIN invoices i ON ii.invoice_id = i.id
        WHERE ii.product_code = ? 
          AND ii.quantity_remaining >= ?
          AND i.status = 'Ativa'
        ORDER BY i.issue_date ASC
        LIMIT 1
      `).get(item.product_code, item.quantity);
      
      if (!invoiceItem) {
        throw new Error(`Produto ${item.product_code} sem estoque suficiente`);
      }
      
      // 2.2. Registrar item da venda
      const saleItemId = `sale_item_${Date.now()}_${Math.random()}`;
      db.prepare(`
        INSERT INTO sale_items (
          id, sale_id, product_code, product_name, quantity, 
          unit_price, total_price, unit_cost, invoice_item_id, is_foguete_amarelo
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        saleItemId, saleId, item.product_code, item.product_name, 
        item.quantity, item.unit_price, item.total_price, 
        invoiceItem.unit_cost, invoiceItem.id, invoiceItem.is_foguete_amarelo
      );
      
      // 2.3. Atualizar quantidade do lote
      db.prepare(`
        UPDATE invoice_items 
        SET quantity_sold = quantity_sold + ?,
            quantity_remaining = quantity_remaining - ?
        WHERE id = ?
      `).run(item.quantity, item.quantity, invoiceItem.id);
      
      // 2.4. SE for Foguete Amarelo, processar pagamento antecipado
      if (invoiceItem.is_foguete_amarelo === 1) {
        const custoVenda = item.quantity * invoiceItem.unit_cost;
        const paymentDate = new Date();
        paymentDate.setDate(paymentDate.getDate() + 1); // D+1
        const paymentDateStr = paymentDate.toISOString().split('T')[0];
        
        // 2.4.1. Criar pagamento antecipado
        const paymentId = `fap_${Date.now()}_${Math.random()}`;
        db.prepare(`
          INSERT INTO foguete_amarelo_payments (
            id, invoice_id, invoice_number, sale_id, payment_date, value, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          paymentId, invoiceItem.invoice_id, invoiceItem.invoice_number, 
          saleId, paymentDateStr, custoVenda, new Date().toISOString()
        );
        
        // 2.4.2. Atualizar título principal (accounts_payable)
        db.prepare(`
          UPDATE accounts_payable
          SET amortized_value = amortized_value + ?,
              remaining_value = original_value - (amortized_value + ?)
          WHERE reference_id = ? AND type = 'Nota Fiscal'
        `).run(custoVenda, custoVenda, invoiceItem.invoice_id);
        
        console.log(`[FOGUETE AMARELO] Pagamento antecipado criado: R$ ${custoVenda.toFixed(2)} para NF ${invoiceItem.invoice_number}`);
      }
    }
    
    // 3. Registrar log
    db.prepare(`
      INSERT INTO logs (id, timestamp, userName, userId, action, category, details)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      `log_${Date.now()}`, new Date().toISOString(), 
      req.user.name, userId, 'Criou', 'Vendas', 
      `Venda ${saleId} - Total: R$ ${totalValue.toFixed(2)}`
    );
  });
  
  try {
    transaction();
    res.json({ success: true, message: 'Venda registrada com sucesso!' });
  } catch (error) {
    console.error('[ERRO] Falha ao processar venda:', error);
    res.status(500).json({ error: error.message });
  }
});
```

### **Endpoint: GET /api/foguete-amarelo/dashboard**

```javascript
app.get('/api/foguete-amarelo/dashboard', (req, res) => {
  try {
    const notas = db.prepare(`
      SELECT 
        i.id,
        i.invoice_number,
        i.supplier_name,
        i.issue_date,
        i.payment_due_date,
        ap.original_value,
        ap.amortized_value,
        ap.remaining_value,
        ROUND((ap.amortized_value * 100.0 / ap.original_value), 2) as percentual_amortizado,
        COUNT(fap.id) as total_pagamentos,
        COALESCE(SUM(fap.value), 0) as total_pago_antecipado
      FROM invoices i
      JOIN accounts_payable ap ON ap.reference_id = i.id AND ap.type = 'Nota Fiscal'
      LEFT JOIN foguete_amarelo_payments fap ON fap.invoice_id = i.id
      WHERE i.is_foguete_amarelo = 1 
        AND i.status = 'Ativa'
      GROUP BY i.id
      ORDER BY i.payment_due_date ASC
    `).all();
    
    res.json(notas);
  } catch (error) {
    console.error('[ERRO] Falha ao buscar dashboard Foguete Amarelo:', error);
    res.status(500).json({ error: error.message });
  }
});
```

### **Endpoint: GET /api/foguete-amarelo/:invoiceId/details**

```javascript
app.get('/api/foguete-amarelo/:invoiceId/details', (req, res) => {
  const { invoiceId } = req.params;
  
  try {
    // Informações da nota
    const invoice = db.prepare(`
      SELECT i.*, ap.amortized_value, ap.remaining_value
      FROM invoices i
      JOIN accounts_payable ap ON ap.reference_id = i.id
      WHERE i.id = ?
    `).get(invoiceId);
    
    // Histórico de pagamentos antecipados
    const payments = db.prepare(`
      SELECT fap.*, s.sale_date, s.user_id
      FROM foguete_amarelo_payments fap
      LEFT JOIN sales s ON fap.sale_id = s.id
      WHERE fap.invoice_id = ?
      ORDER BY fap.payment_date DESC
    `).all(invoiceId);
    
    // Itens da nota (produtos)
    const items = db.prepare(`
      SELECT * FROM invoice_items
      WHERE invoice_id = ?
      ORDER BY product_name
    `).all(invoiceId);
    
    res.json({ invoice, payments, items });
  } catch (error) {
    console.error('[ERRO] Falha ao buscar detalhes:', error);
    res.status(500).json({ error: error.message });
  }
});
```

---

## 🎨 Interface do Usuário (Frontend)

### **1. Formulário de Entrada de Nota Fiscal**

Adicionar ao componente de compras:

```tsx
// Novo campo no formulário
<div className="form-group">
  <label>
    <input 
      type="checkbox" 
      checked={isFogueteAmarelo}
      onChange={(e) => setIsFogueteAmarelo(e.target.checked)}
    />
    <span className="checkbox-label">
      🚀 É Foguete Amarelo? (Pagamento em 120 dias com amortização por venda)
    </span>
  </label>
</div>

{isFogueteAmarelo && (
  <div className="info-box foguete-amarelo">
    <p>
      ⚠️ <strong>Atenção:</strong> Esta nota terá vencimento em 120 dias.
      Cada venda de produtos desta nota gerará um pagamento antecipado em D+1,
      que será abatido do saldo total.
    </p>
    <p>
      <strong>Data de Vencimento:</strong> {calculateDueDate(issueDate, 120)}
    </p>
  </div>
)}
```

### **2. Dashboard de Monitoramento**

Criar novo componente `FogueteAmareloMonitor.tsx`:

```tsx
interface FogueteAmareloData {
  id: string;
  invoice_number: string;
  supplier_name: string;
  issue_date: string;
  payment_due_date: string;
  original_value: number;
  amortized_value: number;
  remaining_value: number;
  percentual_amortizado: number;
  total_pagamentos: number;
}

export function FogueteAmareloMonitor() {
  const [notas, setNotas] = useState<FogueteAmareloData[]>([]);
  
  useEffect(() => {
    fetch('/api/foguete-amarelo/dashboard')
      .then(res => res.json())
      .then(data => setNotas(data));
  }, []);
  
  return (
    <div className="foguete-amarelo-dashboard">
      <h2>🚀 Monitoramento Foguete Amarelo - Cimed</h2>
      
      {notas.map(nota => (
        <div key={nota.id} className="nota-card">
          <div className="nota-header">
            <h3>NF: {nota.invoice_number}</h3>
            <span className="supplier">{nota.supplier_name}</span>
          </div>
          
          <div className="nota-dates">
            <span>Emissão: {formatDate(nota.issue_date)}</span>
            <span>Vencimento: {formatDate(nota.payment_due_date)}</span>
          </div>
          
          <div className="nota-values">
            <div className="value-item">
              <label>Valor Original</label>
              <span className="value">R$ {nota.original_value.toFixed(2)}</span>
            </div>
            
            <div className="value-item amortized">
              <label>Já Amortizado ({nota.percentual_amortizado}%)</label>
              <span className="value">R$ {nota.amortized_value.toFixed(2)}</span>
            </div>
            
            <div className="value-item remaining">
              <label>Saldo Restante</label>
              <span className="value">R$ {nota.remaining_value.toFixed(2)}</span>
            </div>
          </div>
          
          <div className="progress-bar">
            <div 
              className="progress-fill" 
              style={{ width: `${nota.percentual_amortizado}%` }}
            />
          </div>
          
          <div className="nota-footer">
            <span>{nota.total_pagamentos} pagamentos antecipados</span>
            <button onClick={() => viewDetails(nota.id)}>
              Ver Detalhes
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
```

### **3. Integração com "Contas a Pagar"**

Atualizar `ContasAPagar.tsx` para exibir notas Foguete Amarelo:

```tsx
// Adicionar badge visual para identificar
{conta.is_foguete_amarelo === 1 && (
  <span className="badge foguete-amarelo">
    🚀 Foguete Amarelo
  </span>
)}

// Mostrar progresso de amortização
{conta.is_foguete_amarelo === 1 && (
  <div className="amortization-info">
    <small>
      Amortizado: R$ {conta.amortized_value.toFixed(2)} / 
      Restante: R$ {conta.remaining_value.toFixed(2)}
    </small>
  </div>
)}
```

---

## 📊 Relatórios e Consultas Úteis

### **1. Listar produtos de notas Foguete Amarelo ainda em estoque**

```sql
SELECT 
  ii.product_code,
  ii.product_name,
  ii.quantity_remaining,
  ii.unit_cost,
  i.invoice_number,
  i.issue_date
FROM invoice_items ii
JOIN invoices i ON ii.invoice_id = i.id
WHERE i.is_foguete_amarelo = 1
  AND ii.quantity_remaining > 0
  AND i.status = 'Ativa'
ORDER BY i.issue_date ASC;
```

### **2. Histórico de vendas que geraram pagamentos antecipados**

```sql
SELECT 
  s.sale_date,
  s.id as sale_id,
  si.product_name,
  si.quantity,
  si.unit_cost,
  (si.quantity * si.unit_cost) as custo_total,
  fap.payment_date,
  fap.value as valor_pagamento,
  i.invoice_number
FROM sales s
JOIN sale_items si ON si.sale_id = s.id
JOIN foguete_amarelo_payments fap ON fap.sale_id = s.id
JOIN invoices i ON fap.invoice_id = i.id
WHERE si.is_foguete_amarelo = 1
ORDER BY s.sale_date DESC;
```

### **3. Projeção de pagamentos futuros**

```sql
SELECT 
  payment_date,
  COUNT(*) as qtd_pagamentos,
  SUM(value) as total_a_pagar
FROM foguete_amarelo_payments
WHERE status = 'Pendente'
  AND payment_date >= date('now')
GROUP BY payment_date
ORDER BY payment_date ASC;
```

---

## ⚠️ Considerações Importantes

### **1. Controle de Estoque**
- O sistema precisa rastrear de qual lote (nota fiscal) cada produto vendido saiu
- Sugestão: Implementar FIFO (First In, First Out) para consumir primeiro os produtos mais antigos
- Alternativa: Permitir que o usuário escolha manualmente o lote na venda

### **2. Cancelamento de Vendas**
- Se uma venda for cancelada, é necessário:
  - Reverter a quantidade no `invoice_items`
  - Cancelar ou estornar o `foguete_amarelo_payment`
  - Atualizar o `accounts_payable` (diminuir amortização)

### **3. Produtos sem Nota Fiscal**
- Definir comportamento para produtos que não têm lote rastreado
- Opção: Criar um lote "genérico" ou permitir venda sem rastreamento

### **4. Múltiplos Lotes**
- Se um produto está em múltiplas notas Foguete Amarelo, o sistema deve escolher qual consumir primeiro
- Critério sugerido: Nota mais antiga (FIFO)

### **5. Notificações**
- Alertar quando uma nota Foguete Amarelo estiver próxima do vencimento (ex: 15 dias antes)
- Notificar quando o saldo restante for baixo (ex: < 10% do valor original)

---

## 🚀 Próximos Passos para Implementação

1. **Criar as tabelas no banco de dados** (`database.js`)
2. **Implementar endpoints de API** (`server.js`)
3. **Criar componente de cadastro de notas** (novo componente ou adaptar existente)
4. **Implementar módulo de vendas/PDV** (se ainda não existir)
5. **Criar dashboard de monitoramento** (`FogueteAmareloMonitor.tsx`)
6. **Integrar com "Contas a Pagar"** (atualizar `ContasAPagar.tsx`)
7. **Adicionar ao menu principal** (atualizar `Sidebar.tsx` e `App.tsx`)
8. **Testes e validações**

---

## 📝 Resumo da Lógica

```
┌─────────────────────────────────────────────────────────────┐
│  CADASTRO DE NOTA FOGUETE AMARELO                           │
│  ✓ Checkbox marcado → Cria título de R$ X com venc. 120d   │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  VENDA DE PRODUTO                                           │
│  ✓ Sistema verifica se produto é de nota Foguete Amarelo   │
│  ✓ Calcula custo: qtd_vendida × custo_unitário             │
│  ✓ Cria pagamento antecipado para D+1                       │
│  ✓ Abate do saldo do título principal                      │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  DASHBOARD                                                  │
│  ✓ Mostra valor original, amortizado e saldo restante      │
│  ✓ Lista todos os pagamentos antecipados                   │
│  ✓ Exibe progresso visual (%)                              │
└─────────────────────────────────────────────────────────────┘
```

---

**Documento criado em:** 08/02/2026  
**Versão:** 1.0  
**Autor:** Antigravity AI Assistant
