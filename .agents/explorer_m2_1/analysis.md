# Análise Detalhada de Implementação — Milestone 2 (M2 - Backend AI Scanner & REST Endpoints)

## Resumo Executivo
Esta análise fornece as especificações exatas de implementação do Milestone 2 (M2) para o sistema de auditoria interativa de WhatsApp da BelaFarma. Serão alterados dois arquivos backend principais:
1. `backend/services/whatsapp-delivery-service.js`: Atualização do prompt da IA para extrair `products_discussed`, cálculo de métricas da conversa (`is_new_customer`, `chat_duration_seconds`, `chat_message_count`, `review_status`), e persistência dos campos estendidos na tabela `deliveries`.
2. `backend/delivery-endpoints.js`: Criação e alteração dos 4 endpoints REST exigidos (`GET /api/deliveries/pending-reviews`, `GET /api/deliveries/pending-reviews/:id`, `POST /api/deliveries/:id/submit-review`, `GET /api/deliveries/rejection-metrics`).

---

## Componente 1: Auditoria IA e Scanner (`backend/services/whatsapp-delivery-service.js`)

### 1.1 Atualização do Prompt do Sistema (`DELIVERY_AUDIT_SYSTEM_PROMPT`)
- **Localização**: Linhas 34 a 75 do arquivo `backend/services/whatsapp-delivery-service.js`.
- **Modificação**: Adicionar a instrução para extrair o array JSON `products_discussed` com os nomes de todos os produtos citados na conversa.

```javascript
const DELIVERY_AUDIT_SYSTEM_PROMPT = `
Você é o auditor financeiro e de vendas da Drogaria BelaFarma.
Sua missão é analisar o diálogo no WhatsApp entre o Cliente e a Farmácia e classificar a conversa:

Determine 2 pontos cruciais:
1. FOI FECHADA UMA VENDA / PEDIDO DE ENTREGA? ("sale_closed": true ou false)
   - true: O cliente aceitou o orçamento, passou o endereço/dados, confirmou a compra ou a entrega foi agendada/realizada.
   - false: O cliente apenas perguntou preço/estoque, pediu orçamento e não respondeu mais, achou caro, ou o produto estava em falta.

2. QUAIS OS DETALHES DO ATENDIMENTO?
   - "customer_name": Nome do cliente (se mencionado) ou "Cliente".
   - "is_delivery": true se for pedido para entrega em casa, false se for retirada no balcão ou apenas orçamento.
   - "delivery_address": Endereço de entrega (se informado) ou null.
   - "items": Lista/Resumo dos medicamentos e produtos consultados ou comprados. IMPORTANTE: Se a conversa mencionar ou indicar o envio de uma foto, receita ou áudio (sem texto claro do nome), escreva "Receita / Imagem". Deixe vazio ("") APENAS se for uma conversa sem menção a produtos/receitas (ex: só "Bom dia").
   - "products_discussed": Array contendo os nomes individuais de TODOS os produtos ou medicamentos citados/consultados na conversa. Exemplo: ["Dipirona 500mg", "Dorflex 30 comprimidos"]. Se nenhum produto for citado, retorne [].
   - "total_amount": Valor total em R$ (valor cobrado se fechou a venda, ou valor total orçado se não fechou).
   - "payment_method": Forma de pagamento (Pix, Cartão, Dinheiro, Crediário, A combinar).
   - "status": 
       - Se FECHOU venda: "Pendente", "Em Rota" ou "Entregue".
       - Se NÃO FECHOU venda: "Nao_Fechado" ou "Cancelado".
   - "unclosed_reason": Caso "sale_closed" seja false, informe o motivo provável:
       - "Preço Alto": O cliente reclamou do valor ou achou caro.
       - "Falta de Estoque": A farmácia não tinha o produto disponível.
       - "Sem Resposta do Cliente": O atendente passou a cotação e o cliente parou de responder.
       - "Desistiu": O cliente informou que não queria mais.
       - "Apenas Cotação": Cliente só tirou dúvida sem intenção imediata.
       - null (caso a venda tenha sido FECHADA com sucesso).
   - "notes": Resumo direto de 1 linha sobre a negociação.

RESPONDA EXCLUSIVAMENTE EM FORMATO JSON VÁLIDO:
{
  "sale_closed": true ou false,
  "is_delivery": true ou false,
  "customer_name": "Nome do cliente",
  "delivery_address": "Endereço ou null",
  "items": "Descrição dos produtos",
  "products_discussed": ["Produto 1", "Produto 2"],
  "total_amount": 0.00,
  "payment_method": "Pix | Cartão | Dinheiro | Crediário | Outro",
  "status": "Pendente | Em Rota | Entregue | Nao_Fechado | Cancelado",
  "unclosed_reason": "Preço Alto | Falta de Estoque | Sem Resposta do Cliente | Desistiu | Apenas Cotação | null",
  "notes": "Observação curta sobre o atendimento"
}
`;
```

---

### 1.2 Cálculo de Métricas no Scanner (`scanDeliveriesFromWhatsApp`)
- **Localização**: Linhas 225 a 350 do arquivo `backend/services/whatsapp-delivery-service.js`.

#### Regras de Cálculo:
1. **`is_new_customer`**:
   - `1` se o telefone do cliente NÃO possuir registros anteriores em:
     a) `deliveries` com `sale_closed = 1`
     b) tabela `customers` (pelo telefone)
     c) tabela `sales` vinculada a `customers` com `status = 'Finalizada'`
   - `0` caso contrário.
2. **`chat_duration_seconds`**:
   - `Math.round((maxTimestamp - minTimestamp) / 1000)` obtido da ordenação das mensagens da conversa.
3. **`chat_message_count`**:
   - Quantidade total de mensagens recuperadas para a conversa (`messages.length`).
4. **`review_status`**:
   - `'pending_review'` se a conversa foi auditada e a venda NÃO foi fechada (`sale_closed === false`).
   - `null` se a venda foi fechada (`sale_closed === true`).
5. **`discussed_products_json`**:
   - `JSON.stringify(result.products_discussed || [])`. Caso o campo venha vazio, fallback para `JSON.stringify(itemsStr ? [itemsStr] : [])`.

#### Snippet SQL e Código para `scanDeliveriesFromWhatsApp`:

```javascript
// Dentro do loop for (const chat of recentChats) em whatsapp-delivery-service.js:

// 1. Duração e quantidade de mensagens
const timestamps = messages.map(m => m.timestamp);
const minTimestamp = Math.min(...timestamps);
const maxTimestamp = Math.max(...timestamps);
const chatDurationSeconds = messages.length > 1 ? Math.round((maxTimestamp - minTimestamp) / 1000) : 0;
const chatMessageCount = messages.length;

// 2. Verificação de Novo Cliente (is_new_customer)
let isNewCustomer = 1;
try {
  const phoneSuffix = cleanPhone.length >= 8 ? cleanPhone.slice(-8) : cleanPhone;
  const hasPriorClosedDelivery = db.prepare(`
    SELECT id FROM deliveries WHERE phone = ? AND sale_closed = 1 LIMIT 1
  `).get(cleanPhone);

  const hasCustomerRecord = db.prepare(`
    SELECT id FROM customers WHERE phone LIKE ? OR phone = ? LIMIT 1
  `).get(`%${phoneSuffix}%`, cleanPhone);

  const hasPriorSale = db.prepare(`
    SELECT s.id FROM sales s
    JOIN customers c ON s.customer_id = c.id
    WHERE (c.phone LIKE ? OR c.phone = ?) AND s.status = 'Finalizada'
    LIMIT 1
  `).get(`%${phoneSuffix}%`, cleanPhone);

  if (hasPriorClosedDelivery || hasCustomerRecord || hasPriorSale) {
    isNewCustomer = 0;
  }
} catch (errCust) {
  isNewCustomer = 0;
}

// 3. Status de Revisão e Produtos Discutidos
const isClosed = result.sale_closed !== false;
const reviewStatus = !isClosed ? 'pending_review' : null;
const discussedProducts = Array.isArray(result.products_discussed)
  ? result.products_discussed
  : (itemsStr ? [itemsStr] : []);
const discussedProductsJson = JSON.stringify(discussedProducts);

// 4. Inserção / Atualização em `deliveries`
const existingPending = db.prepare(`
  SELECT id FROM deliveries WHERE phone = ? AND review_status = 'pending_review' LIMIT 1
`).get(cleanPhone);

if (existingPending) {
  db.prepare(`
    UPDATE deliveries SET
      customer_name = ?,
      delivery_address = ?,
      items = ?,
      total_amount = ?,
      payment_method = ?,
      status = ?,
      sale_closed = ?,
      unclosed_reason = ?,
      last_message_id = ?,
      notes = ?,
      review_status = ?,
      is_new_customer = ?,
      chat_duration_seconds = ?,
      chat_message_count = ?,
      discussed_products_json = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    finalName,
    address,
    itemsStr,
    totalAmount,
    paymentMethod,
    status,
    isClosed ? 1 : 0,
    unclosedReason,
    lastMsgId,
    notes,
    reviewStatus,
    isNewCustomer,
    chatDurationSeconds,
    chatMessageCount,
    discussedProductsJson,
    existingPending.id
  );
} else {
  const deliveryId = `deliv_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  db.prepare(`
    INSERT INTO deliveries (
      id, phone, customer_name, delivery_address, items,
      total_amount, payment_method, status, sale_closed, unclosed_reason,
      last_message_id, notes,
      review_status, is_new_customer, chat_duration_seconds, chat_message_count, discussed_products_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    deliveryId,
    cleanPhone,
    finalName,
    address,
    itemsStr,
    totalAmount,
    paymentMethod,
    status,
    isClosed ? 1 : 0,
    unclosedReason,
    lastMsgId,
    notes,
    reviewStatus,
    isNewCustomer,
    chatDurationSeconds,
    chatMessageCount,
    discussedProductsJson
  );
}
```

---

## Componente 2: Endpoints REST (`backend/delivery-endpoints.js`)

Todos os novos endpoints serão adicionados dentro da função `initializeDeliveryEndpoints(app, db)`.

### 2.1 `GET /api/deliveries/pending-reviews`
Retorna a lista de todas as entregas com `review_status = 'pending_review'` ordenadas por `created_at DESC`.

```javascript
app.get('/api/deliveries/pending-reviews', (req, res) => {
  try {
    const sql = `
      SELECT d.*, COALESCE(wc.name, wc.pushName) as wa_name
      FROM deliveries d
      LEFT JOIN whatsapp_contacts wc ON wc.id = d.phone || '@s.whatsapp.net'
      WHERE d.review_status = 'pending_review'
      ORDER BY d.created_at DESC
    `;
    const pendingReviews = db.prepare(sql).all();
    res.json({
      success: true,
      count: pendingReviews.length,
      pending_reviews: pendingReviews
    });
  } catch (err) {
    console.error('[DeliveryEndpoints] Erro ao buscar pending-reviews:', err);
    res.status(500).json({ error: 'Erro ao buscar revisões pendentes.', details: err.message });
  }
});
```

---

### 2.2 `GET /api/deliveries/pending-reviews/:id`
Retorna o registro detalhado de uma revisão pendente pelo ID.

```javascript
app.get('/api/deliveries/pending-reviews/:id', (req, res) => {
  try {
    const { id } = req.params;
    const sql = `
      SELECT d.*, COALESCE(wc.name, wc.pushName) as wa_name
      FROM deliveries d
      LEFT JOIN whatsapp_contacts wc ON wc.id = d.phone || '@s.whatsapp.net'
      WHERE d.id = ?
    `;
    const record = db.prepare(sql).get(id);

    if (!record) {
      return res.status(404).json({ error: 'Registro de revisão pendente não encontrado.' });
    }

    res.json({
      success: true,
      delivery: record
    });
  } catch (err) {
    console.error('[DeliveryEndpoints] Erro ao buscar detalhes da revisão pendente:', err);
    res.status(500).json({ error: 'Erro ao carregar detalhes da revisão pendente.', details: err.message });
  }
});
```

---

### 2.3 `POST /api/deliveries/:id/submit-review`
Recebe as respostas do questionário preenchido pelo atendente.
- Se `gerou_entrega === true`:
  - `sale_closed = 1`
  - `status = 'Pendente'`
  - Atualiza os detalhes da entrega (endereço, itens, valor total, pagamento)
  - `review_status = 'reviewed'`
  - `reviewed_at = CURRENT_TIMESTAMP`
  - `reviewed_by = reviewed_by || 'Atendente'`
- Se `gerou_entrega === false`:
  - `sale_closed = 0`
  - `status = 'Nao_Fechado'`
  - `review_status = 'reviewed'`
  - `rejection_details_json = JSON.stringify(rejection_details || [])`
  - `unclosed_reason = unclosed_reason || (rejection_details[0]?.reason || 'Desistiu')`
  - Insere cada item de `rejection_details` na tabela `chat_product_rejections`
  - `reviewed_at = CURRENT_TIMESTAMP`
  - `reviewed_by = reviewed_by || 'Atendente'`

```javascript
app.post('/api/deliveries/:id/submit-review', (req, res) => {
  try {
    const { id } = req.params;
    const { gerou_entrega, delivery_details, rejection_details, unclosed_reason, reviewed_by } = req.body;

    const existing = db.prepare('SELECT * FROM deliveries WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Registro de entrega não encontrado.' });
    }

    const reviewer = reviewed_by || 'Atendente';

    if (gerou_entrega) {
      const details = delivery_details || {};
      db.prepare(`
        UPDATE deliveries SET
          sale_closed = 1,
          status = 'Pendente',
          review_status = 'reviewed',
          reviewed_at = CURRENT_TIMESTAMP,
          reviewed_by = ?,
          customer_name = COALESCE(?, customer_name),
          delivery_address = COALESCE(?, delivery_address),
          items = COALESCE(?, items),
          total_amount = COALESCE(?, total_amount),
          payment_method = COALESCE(?, payment_method),
          notes = COALESCE(?, notes),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        reviewer,
        details.customer_name || null,
        details.delivery_address || null,
        details.items || null,
        details.total_amount !== undefined ? parseFloat(details.total_amount) : null,
        details.payment_method || null,
        details.notes || null,
        id
      );
    } else {
      const rejectionsArr = Array.isArray(rejection_details) ? rejection_details : [];
      const rejectionDetailsJson = JSON.stringify(rejectionsArr);
      const primaryReason = unclosed_reason || (rejectionsArr.length > 0 ? rejectionsArr[0].reason : 'Desistiu');

      db.prepare(`
        UPDATE deliveries SET
          sale_closed = 0,
          status = 'Nao_Fechado',
          review_status = 'reviewed',
          rejection_details_json = ?,
          unclosed_reason = ?,
          reviewed_at = CURRENT_TIMESTAMP,
          reviewed_by = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        rejectionDetailsJson,
        primaryReason,
        reviewer,
        id
      );

      if (rejectionsArr.length > 0) {
        const insertRejection = db.prepare(`
          INSERT INTO chat_product_rejections (delivery_id, phone, product_name, reason, notes, created_at)
          VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `);

        db.transaction(() => {
          for (const rej of rejectionsArr) {
            insertRejection.run(
              id,
              existing.phone,
              rej.product_name || 'Produto não especificado',
              rej.reason || primaryReason,
              rej.notes || ''
            );
          }
        })();
      }
    }

    const updatedRecord = db.prepare('SELECT * FROM deliveries WHERE id = ?').get(id);

    res.json({
      success: true,
      delivery_id: id,
      review_status: 'reviewed',
      delivery: updatedRecord
    });
  } catch (err) {
    console.error('[DeliveryEndpoints] Erro ao submeter revisão:', err);
    res.status(500).json({ error: 'Erro ao processar submissão de revisão.', details: err.message });
  }
});
```

---

### 2.4 `GET /api/deliveries/rejection-metrics`
Retorna métricas agregadas de rejeição de produtos das tabelas `chat_product_rejections` e `deliveries`.

```javascript
app.get('/api/deliveries/rejection-metrics', (req, res) => {
  try {
    // 1. Total de rejeições
    const totalRejectionsRow = db.prepare('SELECT COUNT(*) as count FROM chat_product_rejections').get();
    const total_rejections = totalRejectionsRow ? totalRejectionsRow.count : 0;

    // 2. Agrupamento por motivo em chat_product_rejections
    const reasonsRows = db.prepare(`
      SELECT reason, COUNT(*) as count
      FROM chat_product_rejections
      WHERE reason IS NOT NULL AND reason != ''
      GROUP BY reason
      ORDER BY count DESC
    `).all();

    const by_reason = {};
    for (const r of reasonsRows) {
      by_reason[r.reason] = r.count;
    }

    // Fallback: se ainda não houver inserções em chat_product_rejections, agrega unclosed_reason de deliveries
    if (Object.keys(by_reason).length === 0) {
      const delivReasons = db.prepare(`
        SELECT unclosed_reason as reason, COUNT(*) as count
        FROM deliveries
        WHERE sale_closed = 0 AND unclosed_reason IS NOT NULL AND unclosed_reason != ''
        GROUP BY unclosed_reason
        ORDER BY count DESC
      `).all();
      for (const r of delivReasons) {
        by_reason[r.reason] = r.count;
      }
    }

    // 3. Agrupamento por produto mais rejeitado e seu motivo principal
    const productsRows = db.prepare(`
      SELECT 
        product_name, 
        COUNT(*) as count,
        reason as main_reason
      FROM chat_product_rejections
      WHERE product_name IS NOT NULL AND product_name != ''
      GROUP BY product_name
      ORDER BY count DESC
      LIMIT 50
    `).all();

    const by_product = productsRows.map(p => ({
      product_name: p.product_name,
      count: p.count,
      main_reason: p.main_reason || 'Outro'
    }));

    res.json({
      success: true,
      metrics: {
        total_rejections,
        by_reason,
        by_product
      }
    });
  } catch (err) {
    console.error('[DeliveryEndpoints] Erro ao carregar métricas de rejeição:', err);
    res.status(500).json({ error: 'Erro ao carregar métricas de rejeição.', details: err.message });
  }
});
```

---

## Verificação e Teste
Para validar os endpoints do M2:
1. Iniciar o servidor Node backend (`node backend/server.js`).
2. Testar a varredura chamando `POST /api/deliveries/scan`.
3. Verificar a lista de pendências chamando `GET /api/deliveries/pending-reviews`.
4. Submeter uma revisão de teste via `POST /api/deliveries/:id/submit-review`.
5. Consultar `GET /api/deliveries/rejection-metrics` para confirmar a agregação de dados.
