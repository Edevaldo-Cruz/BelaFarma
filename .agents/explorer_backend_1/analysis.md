# Relatório de Análise Técnica: Backend, Esteira de IA e Estrutura de Banco de Dados (BelaFarma)

## 1. Resumo Executivo

Este relatório apresenta a investigação aprofundada do backend Node.js/Express, da esteira de inteligência artificial (`ai.service.js` e `whatsapp-delivery-service.js`) e do banco de dados SQLite (`belafarma.db`) do projeto **BelaFarma**. 

A arquitetura atual já possui uma varredura automatizada via IA para conversas do WhatsApp que extrai intenções de venda e entregas. Para atender aos novos requisitos (**Fila de Revisão Pendente**, **Métricas de Rejeição de Produtos** e **Classificação de Clientes**), é necessário estender o prompt da IA, adicionar colunas de auditoria/revisão na tabela `deliveries`, criar a tabela `chat_product_rejections` para métricas estruturadas de produtos rejeitados e disponibilizar novos endpoints no `delivery-endpoints.js`.

---

## 2. Análise do Backend e Esteira de IA (`whatsapp-delivery-service.js` e `ai.service.js`)

### 2.1 Fluxo Atual de Processamento de Conversas
1. **Sincronização com Evolution API** (`backend/services/whatsapp-delivery-service.js`, linhas 80-180):
   - A função `syncMessagesFromEvolution(db)` faz requisições HTTP para a Evolution API (`/chat/findChats` e `/chat/findMessages`).
   - Filtra apenas chats individuais (excluindo grupos `@g.us` e transmissões `@broadcast`).
   - Salva/atualiza contatos na tabela `whatsapp_contacts (id, name, pushName, updated_at)` e mensagens na tabela `whatsapp_messages (id, phone, fromMe, messageText, timestamp)`.

2. **Varredura de Conversas Ociosas / Frias** (`whatsapp-delivery-service.js`, linhas 182-360):
   - A função `scanDeliveriesFromWhatsApp(db, options)` consulta o SQLite em busca de chats ativos no período desejado (últimas 24h/48h ou mês atual):
     ```sql
     SELECT phone, MAX(timestamp) as lastTimestamp, COUNT(*) as msgCount
     FROM whatsapp_messages
     WHERE timestamp >= ? AND phone IS NOT NULL AND phone != ''
     GROUP BY phone
     HAVING msgCount >= 1
     ORDER BY lastTimestamp DESC
     LIMIT ?
     ```
   - Para cada telefone encontrado, obtém até as últimas 50 mensagens ordenadas por timestamp.
   - **Deduplicação / Idempotência** (linhas 262-268): Verifica se já existe um registro na tabela `deliveries` para aquele `phone` e `last_message_id`. Se já existir, a conversa é ignorada, economizando chamadas de IA.

3. **Formatação do Transcrito e Invocação da IA** (linhas 270-287):
   - Monta um texto concatenando as mensagens: `[HH:MM] Atendente BelaFarma / NomeCliente: texto`.
   - Executa a chamada `callAI(userPrompt, DELIVERY_AUDIT_SYSTEM_PROMPT, { temperature: 0.2 })`.

4. **Modelos e APIs de IA Utilizados** (`backend/services/ai.service.js`, linhas 1-132):
   - **Provedor Principal**: Configurado via `process.env.AI_PROVIDER` (padrão: `'openai'`).
   - **Modelo OpenAI**: Utiliza a biblioteca oficial `openai` com o modelo `gpt-4o-mini` (editável via `process.env.GPT_MODEL`).
   - **Provedor Fallback (Backup)**: Caso o provedor principal falhe, redireciona automaticamente para **Google Gemini** (`gemini-flash-latest`) usando `process.env.GEMINI_API_KEY` via chamada REST HTTP POST.

5. **Gatilhos e Agendamento (Cron/Boot)**:
   - `backend/server.js` (linha 3693): Dispara varredura inicial do mês atual 15 segundos após a inicialização do servidor.
   - `backend/server.js` (linha 3703): Executa `setInterval` a cada **10 minutos** para varrer as últimas 24h.
   - `backend/delivery-endpoints.js` (linha 262): Possui um `setInterval` secundário a cada **30 minutos** para varrer as últimas 48h.

---

## 3. Estrutura do Banco de Dados SQLite (`belafarma.db`)

### 3.1 Localização e Inicialização
- **Caminho da base**: Configurado em `backend/config.js` (linha 9-17). Em ambiente local, resolve para `data/belafarma.db` ou `backend/belafarma.db`. Em produção na Raspberry Pi/Docker, utiliza a variável `process.env.DB_PATH`.
- **Conexão**: Gerida em `backend/database.js` usando `better-sqlite3` com modo WAL ativado (`db.pragma('journal_mode = WAL')`).
- **Tabelas e Migrações**: Definidas dentro de `createTables()` em `backend/database.js`. Novas colunas são adicionadas defensivamente através de blocos `try { db.exec('ALTER TABLE ...'); } catch(e) {}`.

### 3.2 Tabelas Relevantes Existentes

1. **`deliveries`** (`backend/database.js`, linhas 1279-1308):
   ```sql
   CREATE TABLE IF NOT EXISTS deliveries (
     id TEXT PRIMARY KEY,
     phone TEXT NOT NULL,
     customer_name TEXT,
     delivery_address TEXT,
     items TEXT,
     total_amount REAL DEFAULT 0,
     payment_method TEXT,
     status TEXT DEFAULT 'Pendente', -- Valores atuais: 'Pendente', 'Em Rota', 'Entregue', 'Nao_Fechado', 'Cancelado'
     sale_closed INTEGER DEFAULT 1,   -- 1 = Fechado, 0 = Não Fechado
     unclosed_reason TEXT,            -- Ex: 'Preço Alto', 'Falta de Estoque', 'Sem Resposta do Cliente'
     last_message_id TEXT,
     notes TEXT,
     created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
     updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
   )
   ```

2. **`whatsapp_messages`** (`backend/database.js`, linhas 1251-1267):
   ```sql
   CREATE TABLE IF NOT EXISTS whatsapp_messages (
     id TEXT PRIMARY KEY,
     phone TEXT NOT NULL,
     fromMe INTEGER NOT NULL, -- 1 = Atendente, 0 = Cliente
     messageText TEXT NOT NULL,
     rawMessage TEXT,
     timestamp INTEGER NOT NULL -- Unix timestamp em milissegundos
   )
   ```

3. **`whatsapp_contacts`** (`backend/database.js`, linhas 1272-1277):
   ```sql
   CREATE TABLE IF NOT EXISTS whatsapp_contacts (
     id TEXT PRIMARY KEY, -- ex: 5548999999999@s.whatsapp.net
     name TEXT,
     pushName TEXT,
     updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
   )
   ```

4. **`customers`** (`backend/database.js`, linhas 228-241, 1312-1348):
   ```sql
   CREATE TABLE IF NOT EXISTS customers (
     id TEXT PRIMARY KEY,
     name TEXT NOT NULL,
     nickname TEXT,
     cpf TEXT,
     phone TEXT,
     email TEXT,
     address TEXT,
     notes TEXT,
     createdAt TEXT NOT NULL,
     updatedAt TEXT NOT NULL,
     creditLimit REAL DEFAULT 0,
     dueDay INTEGER,
     preferences TEXT,
     birthDate TEXT,
     source TEXT DEFAULT 'Manual',
     whatsapp_name TEXT
   )
   ```

5. **`sales` e `sale_items`** (`backend/database.js`, linhas 837-892):
   - Registra as vendas efetuadas no PDV vinculadas a `customer_id` e itens de venda com valores e lucro.

6. **`whatsapp_product_history`** (`backend/database.js`, linhas 1204-1223):
   - Histórico de intenções/interações com produtos via WhatsApp (status: `'comprado'`, `'pesquisado'`, `'nao_encontrado'`, `'cancelado'`).

---

## 4. Cálculo de Histórico de Cliente, Duração e Frequência do Chat

### 4.1 Identificação de Cliente Novo vs. Recorrente (`is_new_customer`)
Para determinar se a conversa pertence a um **Cliente Novo** ou **Cliente Recorrente**:
- **Lógica de Consulta no SQLite**:
  1. Verificar se o número de telefone já possui cadastro prévio na tabela `customers`:
     ```sql
     SELECT id FROM customers WHERE phone LIKE '%' || ? || '%' LIMIT 1;
     ```
  2. Verificar se o número possui compras finalizadas anteriores na tabela `deliveries` ou `sales`:
     ```sql
     SELECT COUNT(*) as previous_sales
     FROM deliveries
     WHERE phone = ? AND sale_closed = 1 AND created_at < ?;
     ```
  3. **Regra de Negócio**: Se `previous_sales == 0` E não houver registro prévio cadastrado há mais de 30 dias em `customers`, o cliente é classificado como **Cliente Novo** (`is_new_customer = 1`). Caso contrário, é **Cliente Recorrente** (`is_new_customer = 0`).

### 4.2 Duração da Conversa (`chat_duration_seconds`)
Calculada diretamente a partir dos timestamps da tabela `whatsapp_messages` para a sessão auditada:
```sql
SELECT 
  MIN(timestamp) as first_msg_ts,
  MAX(timestamp) as last_msg_ts,
  COUNT(*) as total_messages
FROM whatsapp_messages
WHERE phone = ? AND timestamp >= ?;
```
- **Fórmula**: `duration_seconds = Math.round((last_msg_ts - first_msg_ts) / 1000)`.
- Se `total_messages == 1`, a duração é de 0 segundos.

### 4.3 Frequência / Histórico de Interações (`chat_frequency`)
Quantidade de dias distintos com mensagens trocadas nos últimos 30 dias:
```sql
SELECT 
  COUNT(DISTINCT date(timestamp/1000, 'unixepoch', 'localtime')) as active_days_30d,
  COUNT(*) as total_msgs_30d
FROM whatsapp_messages
WHERE phone = ? AND timestamp >= strftime('%s', 'now', '-30 days') * 1000;
```

---

## 5. Proposta de Alterações no Esquema de Banco de Dados

Para suportar a **Fila de Revisão Pendente (R1)**, o **Questionário do Atendente (R3)** e as **Métricas de Rejeição de Produtos**, são recomendadas as seguintes alterações no SQLite:

### 5.1 Atualização da Tabela `deliveries` (Novas Colunas)
Adicionar colunas para armazenar o status de auditoria/revisão manual, métricas pré-calculadas e produtos discutidos pela IA:

| Coluna | Tipo | Valor Padrão | Descrição |
| :--- | :--- | :--- | :--- |
| `review_status` | `TEXT` | `'pending_review'` | Status da revisão: `'pending_review'`, `'reviewed'`, `'skipped'`, `'not_applicable'` |
| `is_new_customer` | `INTEGER` | `0` | `1` se for cliente novo, `0` se for recorrente |
| `chat_duration_seconds` | `INTEGER` | `0` | Duração da conversa em segundos |
| `chat_message_count` | `INTEGER` | `0` | Total de mensagens trocadas no chat |
| `discussed_products_json` | `TEXT` | `NULL` | Array JSON extraído pela IA com produtos consultados, quantidades e preços estimados |
| `rejection_details_json` | `TEXT` | `NULL` | Array JSON estruturado com produtos rejeitados e os motivos confirmados pelo atendente |
| `reviewed_by` | `TEXT` | `NULL` | Nome/ID do atendente que respondeu ao questionário |
| `reviewed_at` | `DATETIME` | `NULL` | Data e hora em que a revisão foi concluída |

### 5.2 Nova Tabela Normalizada: `chat_product_rejections`
Para permitir consultas de alta performance e gráficos agregados no Painel (ex: "Quais os medicamentos mais rejeitados por motivo de Preço Alto no mês?"), cria-se uma tabela filha normalizada:

```sql
CREATE TABLE IF NOT EXISTS chat_product_rejections (
  id TEXT PRIMARY KEY,
  delivery_id TEXT NOT NULL,
  phone TEXT NOT NULL,
  customer_name TEXT,
  is_new_customer INTEGER DEFAULT 0,
  product_name TEXT NOT NULL,
  product_code TEXT,
  estimated_price REAL DEFAULT 0,
  rejection_reason TEXT NOT NULL, -- 'Preço Alto', 'Falta de Estoque', 'Apenas Dúvida', 'Prazo de Entrega', 'Outro'
  rejection_notes TEXT,
  reviewed_by TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (delivery_id) REFERENCES deliveries(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_cpr_delivery ON chat_product_rejections(delivery_id);
CREATE INDEX IF NOT EXISTS idx_cpr_reason ON chat_product_rejections(rejection_reason);
CREATE INDEX IF NOT EXISTS idx_cpr_product ON chat_product_rejections(product_name);
CREATE INDEX IF NOT EXISTS idx_cpr_created ON chat_product_rejections(created_at);
```

### 5.3 Código de Migração no `backend/database.js`
Adicionar o seguinte trecho no método `createTables()` de `backend/database.js`:

```javascript
// --- MIGRATION: Fila de Revisão e Métricas de Rejeição de Produtos ---
try { db.exec("ALTER TABLE deliveries ADD COLUMN review_status TEXT DEFAULT 'pending_review'"); } catch(e) {}
try { db.exec("ALTER TABLE deliveries ADD COLUMN is_new_customer INTEGER DEFAULT 0"); } catch(e) {}
try { db.exec("ALTER TABLE deliveries ADD COLUMN chat_duration_seconds INTEGER DEFAULT 0"); } catch(e) {}
try { db.exec("ALTER TABLE deliveries ADD COLUMN chat_message_count INTEGER DEFAULT 0"); } catch(e) {}
try { db.exec("ALTER TABLE deliveries ADD COLUMN discussed_products_json TEXT"); } catch(e) {}
try { db.exec("ALTER TABLE deliveries ADD COLUMN rejection_details_json TEXT"); } catch(e) {}
try { db.exec("ALTER TABLE deliveries ADD COLUMN reviewed_by TEXT"); } catch(e) {}
try { db.exec("ALTER TABLE deliveries ADD COLUMN reviewed_at DATETIME"); } catch(e) {}

db.exec(`
  CREATE TABLE IF NOT EXISTS chat_product_rejections (
    id TEXT PRIMARY KEY,
    delivery_id TEXT NOT NULL,
    phone TEXT NOT NULL,
    customer_name TEXT,
    is_new_customer INTEGER DEFAULT 0,
    product_name TEXT NOT NULL,
    product_code TEXT,
    estimated_price REAL DEFAULT 0,
    rejection_reason TEXT NOT NULL,
    rejection_notes TEXT,
    reviewed_by TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (delivery_id) REFERENCES deliveries(id) ON DELETE CASCADE
  )
`);
try {
  db.exec('CREATE INDEX IF NOT EXISTS idx_cpr_delivery ON chat_product_rejections(delivery_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_cpr_reason ON chat_product_rejections(rejection_reason)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_cpr_product ON chat_product_rejections(product_name)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_cpr_created ON chat_product_rejections(created_at)');
} catch(e) {}
```

---

## 6. Recomendações de Implementação na Esteira de IA e Endpoints API

### 6.1 Atualização do Prompt do Sistema (`DELIVERY_AUDIT_SYSTEM_PROMPT`)
Em `backend/services/whatsapp-delivery-service.js`, ajustar o prompt para instruir a IA a retornar a lista de produtos discutidos em formato JSON estruturado:

```javascript
const DELIVERY_AUDIT_SYSTEM_PROMPT = `
Você é o auditor de atendimento e vendas da Drogaria BelaFarma.
Analise a conversa do WhatsApp e retorne um JSON com os seguintes campos:

1. "sale_closed": true (se comprou/confirmou entrega) ou false (se não fechou).
2. "customer_name": Nome do cliente ou "Cliente WhatsApp".
3. "is_delivery": true se pediu entrega em domicílio, false caso contrário.
4. "delivery_address": Endereço de entrega informado ou null.
5. "total_amount": Valor total em R$ (cobrado ou orçado).
6. "payment_method": Forma de pagamento (Pix, Cartão, Dinheiro, Crediário, A combinar).
7. "status": "Pendente", "Em Rota", "Entregue", "Nao_Fechado" ou "Cancelado".
8. "unclosed_reason": "Preço Alto" | "Falta de Estoque" | "Sem Resposta do Cliente" | "Desistiu" | "Apenas Cotação" | null.
9. "products_discussed": Array de objetos com os produtos citados:
   [
     {
       "product_name": "Nome do produto/medicamento",
       "estimated_price": 0.00,
       "quantity": 1,
       "was_rejected": true ou false,
       "rejection_reason": "Preço Alto" | "Falta de Estoque" | "Apenas Dúvida" | "Outro"
     }
   ]
10. "notes": Resumo curto de 1 linha.

RESPONDA APENAS EM FORMATO JSON VÁLIDO.
`;
```

### 6.2 Atualização da Função `scanDeliveriesFromWhatsApp`
Na varredura (`whatsapp-delivery-service.js`):
1. Calcular `is_new_customer`, `chat_duration_seconds` e `chat_message_count` via SQL antes de enviar para a IA.
2. Ao salvar na tabela `deliveries`, definir:
   - `review_status = 'pending_review'` se a conversa foi um orçamento não concluído ou se precisa de validação manual.
   - `discussed_products_json = JSON.stringify(result.products_discussed)`.

### 6.3 Novos / Alterados Endpoints API (`backend/delivery-endpoints.js`)

1. **`GET /api/deliveries/pending-reviews`**:
   - Retorna a lista de itens onde `review_status = 'pending_review'`, ordenados por data decrescente.
   - Inclui métricas pré-preenchidas pela IA (`is_new_customer`, `chat_duration_seconds`, `discussed_products_json`).

2. **`POST /api/deliveries/:id/submit-review`**:
   - Endpoint acionado quando o atendente submete o questionário no modal.
   - Recebe no body:
     ```json
     {
       "generated_delivery": false,
       "reviewed_by": "Atendente João",
       "rejections": [
         {
           "product_name": "Dipirona 500mg",
           "estimated_price": 15.00,
           "rejection_reason": "Preço Alto",
           "notes": "Cliente achou mais barato na concorrência"
         }
       ]
     }
     ```
   - Atualiza `deliveries`: define `review_status = 'reviewed'`, `sale_closed = 0` (ou 1 se `generated_delivery: true`), `reviewed_by` e `reviewed_at`.
   - Insere os registros de rejeição na tabela `chat_product_rejections`.

3. **`GET /api/deliveries/rejection-metrics`**:
   - Retorna dados consolidados para o Painel:
     - Total de rejeições por motivo (`Preço Alto`, `Falta de Estoque`, etc.).
     - Produtos com maior índice de rejeição.
     - Taxa de conversão comparativa: Clientes Novos vs. Clientes Recorrentes.

---

## 7. Conclusão

A arquitetura do backend do BelaFarma está totalmente preparada para suportar a funcionalidade de auditoria interativa de WhatsApp. As modificações propostas mantêm retrocompatibilidade com o banco SQLite existente e aproveitam a infraestrutura já estabelecida de IA e sincronização do WhatsApp via Evolution API.
