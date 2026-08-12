# Handoff Report — Milestone 2 (M2 - Backend AI Scanner & REST Endpoints)

## 1. Observation
- **Arquivos Inspecionados**:
  - `backend/database.js` (Linhas 1310–1339): Tabela `deliveries` com colunas de auditoria `review_status`, `is_new_customer`, `chat_duration_seconds`, `chat_message_count`, `discussed_products_json`, `rejection_details_json`, `reviewed_by`, `reviewed_at`. Tabela `chat_product_rejections` criada com colunas `id`, `delivery_id`, `phone`, `product_name`, `reason`, `notes`, `created_at`.
  - `backend/services/whatsapp-delivery-service.js` (Linhas 34–75 e 182–360): `DELIVERY_AUDIT_SYSTEM_PROMPT` necessita inclusão de `products_discussed`. `scanDeliveriesFromWhatsApp` precisa calcular `is_new_customer`, `chat_duration_seconds`, `chat_message_count`, `review_status`, `discussed_products_json` e persisti-los na consulta de `INSERT`/`UPDATE` de `deliveries`.
  - `backend/delivery-endpoints.js` (Linhas 4–280): Requer adição dos 4 endpoints REST: `GET /api/deliveries/pending-reviews`, `GET /api/deliveries/pending-reviews/:id`, `POST /api/deliveries/:id/submit-review`, `GET /api/deliveries/rejection-metrics`.
  - `types.ts` (Linhas 544–633): As interfaces TypeScript `Delivery`, `PendingReview`, `ProductRejection` e `RejectionMetrics` já foram atualizadas no M1 e estão prontas para consumo.

---

## 2. Logic Chain
1. **Prompt & IA Scanner**:
   - A especificação do R1 e M2 exige extrair os produtos discutidos na conversa (`products_discussed`). Adicionando essa chave com instrução explícita no `DELIVERY_AUDIT_SYSTEM_PROMPT`, a IA retorna um array JSON com os nomes dos produtos.
   - Para o cálculo de `chat_duration_seconds`, as mensagens já são lidas em ordem cronológica. `minTimestamp` e `maxTimestamp` fornecem o intervalo exato em milissegundos divididos por 1000.
   - Para `is_new_customer`, a consulta verifica a ausência de registros em `deliveries` (com `sale_closed = 1`), `customers` e `sales` (com `status = 'Finalizada'`).
   - Para conversas com vendas não fechadas (`sale_closed === false`), o status inicial de revisão é definido como `'pending_review'`.
   - Se já existir um registro pendente em `deliveries` para o número do cliente com `review_status = 'pending_review'`, ele é atualizado (`UPDATE`), do contrário, é inserido um novo registro (`INSERT`).

2. **Endpoints REST**:
   - `GET /api/deliveries/pending-reviews`: Busca todas as entregas onde `review_status = 'pending_review'`, ordenando por `created_at DESC`.
   - `GET /api/deliveries/pending-reviews/:id`: Busca por ID o registro com informações completas e JOIN com `whatsapp_contacts`.
   - `POST /api/deliveries/:id/submit-review`: Trata dois fluxos baseados em `gerou_entrega`:
     - `Sim (true)`: `sale_closed = 1`, `status = 'Pendente'`, atualiza dados da entrega, marca `review_status = 'reviewed'`, grava `reviewed_by` e `reviewed_at`.
     - `Não (false)`: `sale_closed = 0`, `status = 'Nao_Fechado'`, marca `review_status = 'reviewed'`, salva `rejection_details_json` e `unclosed_reason`, insere individualmente cada produto recusado na tabela `chat_product_rejections`, grava `reviewed_by` e `reviewed_at`.
   - `GET /api/deliveries/rejection-metrics`: Agrega `total_rejections`, agrupamento por `reason` (`by_reason`) e produtos mais rejeitados com seu motivo principal (`by_product`) a partir da tabela `chat_product_rejections`.

---

## 3. Caveats
- Se uma conversa não contiver menções de produtos explícitos ou for apenas uma conversa genérica de saudação sem orçamento, a IA deve retornar `products_discussed: []`.
- Caso `chat_product_rejections` esteja vazia (ex: antes de qualquer questionário ser submetido), `GET /api/deliveries/rejection-metrics` utiliza como fallback os motivos de `unclosed_reason` em `deliveries`.

---

## 4. Conclusion
As modificações necessárias para o Milestone 2 foram totalmente mapeadas e especificadas com trechos de código exatos, consultas SQL otimizadas e tratamento de erros no arquivo `analysis.md`. O worker pode proceder com a implementação direta nos arquivos `backend/services/whatsapp-delivery-service.js` e `backend/delivery-endpoints.js`.

---

## 5. Verification Method
1. Executar os testes dos endpoints REST utilizando requisições de teste HTTP (ou curl/Postman):
   - `GET http://localhost:3001/api/deliveries/pending-reviews`
   - `GET http://localhost:3001/api/deliveries/pending-reviews/<id>`
   - `POST http://localhost:3001/api/deliveries/<id>/submit-review` com payload `{"gerou_entrega": false, "rejection_details": [{"product_name": "Dorflex", "reason": "Preço Alto"}]}`
   - `GET http://localhost:3001/api/deliveries/rejection-metrics`
2. Verificar no banco SQLite (`backend/database.js` / `sqlite3`) que os registros em `deliveries` transicionaram para `review_status = 'reviewed'` e que as linhas foram gravadas em `chat_product_rejections`.
