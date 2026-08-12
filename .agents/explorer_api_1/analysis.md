# Relatório de Análise Técnica: API Routes, Setup do Servidor Express e Mecanismos de Comunicação (BelaFarma)

## 1. Resumo Executivo

Este relatório apresenta a investigação minuciosa dos componentes de servidor Express, rotas da API REST, protocolos de comunicação cliente-servidor e infraestrutura de testes da aplicação **BelaFarma** (`f:\Documentos\Desenvolvimento\BelaFarma`).

A investigação visa fornecer a base técnica necessária para a implementação do **Sistema de Auditoria Interativa de WhatsApp**, cobrindo a Fila de Revisão Pendente (R1), Alerta e Fila no Painel (R2) e o Questionário do Atendente com Métricas de Rejeição (R3).

---

## 2. Express & Configuração do Servidor (`backend/server.js`)

### 2.1 Ponto de Entrada e Inicialização
- **Arquivo de Ponto de Entrada**: `backend/server.js` (4.520 linhas).
- **Comando de Execução**: `node --dns-result-order=ipv4first server.js` (definido no `backend/package.json`, rodando no container Docker `backend` na porta 3001).
- **Variáveis de Ambiente**: Carregadas via `require('dotenv').config({ path: path.join(__dirname, '../.env') })` (linha 2 de `backend/server.js`).
  - *Variáveis Principais*: `DB_PATH`, `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `EVOLUTION_MAIN_INSTANCE`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `AI_PROVIDER`, `GPT_MODEL`.

### 2.2 Middlewares Registrados (`backend/server.js`, linhas 15-41)
1. **CORS**: `app.use(cors())` (linha 16) — Permite requisições do frontend React rodando em portas distintas (`8085` no Docker / Vite dev server `5173`).
2. **Body Parsers**:
   - `app.use(express.json({ limit: '100mb' }))` (linha 17) — Suporta uploads e payloads extensos.
   - `app.use(express.urlencoded({ limit: '100mb', extended: true }))` (linha 18).
3. **Servidores Estáticos**:
   - `app.use(express.static(path.join(__dirname, 'public')))` (linha 19).
   - `app.use('/uploads', express.static(path.join(__dirname, 'uploads')))` (linha 20) — Serve imagens de ofertas/produtos.
4. **Sistema de Log Persistente**:
   - Sobrescreve `console.log` e `console.error` para gravar em `backend.log` no diretório `data/` (linhas 22-41).

### 2.3 Arquitetura Modular de Endpoints
O `backend/server.js` atua como um orquestrador/centralizador que inicializa módulos de rotas independentes:

| Módulo | Arquivo de Origem | Linha de Inicialização em `server.js` | Descrição / Responsabilidade |
| :--- | :--- | :--- | :--- |
| **Deliveries & Vendas** | `backend/delivery-endpoints.js` | Linha 3688 (`initializeDeliveryEndpoints(app, db)`) | Gestão de entregas, vendas e varredura via IA |
| **CRM WhatsApp** | `backend/whatsapp-crm-endpoints.js` | Linha 3680 (`initializeWhatsAppCRMEndpoints(app, db)`) | Importação de contatos, histórico e cadastro de clientes |
| **WhatsApp Vendas** | `backend/whatsapp-vendas-endpoints.js` | Linha 3684 (`initializeWhatsAppVendasEndpoints(app, db)`) | Chat web, produtos e sincronização de fotos |
| **Mensagens & Templates** | `backend/message-endpoints.js` | Linha 3581 (`initializeMessageEndpoints(app, db)`) | Templates de mensagens, agendador e disparos |
| **Grupos WhatsApp** | `backend/whatsapp-group-endpoints.js` | Linha 3602 (`initializeWhatsAppGroupEndpoints(app, db)`) | Postagem de ofertas JIT nos grupos |
| **Agente Financeiro** | `backend/finance-endpoints.js` | Linha 3733 (`app.use('/api/finance-agent', ...)`)| Análise e conciliação financeira via IA |
| **Estoque** | `backend/stock-endpoints.js` | Linha 3737 (`app.use('/api/stock', ...)`)| Consulta e movimentação de estoque |
| **Inventário** | `backend/inventario-endpoints.js` | Linha 3741 (`app.use('/api/inventario', ...)`)| Inventário rotativo de medicamentos |
| **Saúde Financeira** | `backend/financial-health-endpoints.js` | Linha 3745 (`require(...)(app, db)`)| Diagnóstico financeiro Gemini |
| **Agente de Compras** | `backend/purchasing-endpoints.js` | Linha 3768 (`app.use('/api/purchasing', ...)`)| Cotações e pedidos de compra |

### 2.4 Endpoints Relevantes Existentes

#### A. Módulo Delivery (`backend/delivery-endpoints.js`)
- `GET /api/deliveries`: Retorna a lista de entregas/atendimentos filtrados por `status`, `period` (`today`, `7days`, `30days`, `month`, `prev_month`, `YYYY-MM`, `all`), `search` e `filterClosed` (`closed`, `unclosed`), acompanhados de métricas consolidadas (`conversionRate`, `averageTicket`, `byPaymentMethod`, `byStatus`, `byUnclosedReason`).
- `POST /api/deliveries/scan`: Gatilho manual para a varredura e auditoria via IA (`scanDeliveriesFromWhatsApp(db, { scanCurrentMonth, hours })`).
- `POST /api/deliveries`: Criação manual de registro de delivery.
- `PUT /api/deliveries/:id`: Edição de dados ou atualização de status da entrega.
- `DELETE /api/deliveries/:id`: Remoção de registro.

#### B. Módulo Dados Gerais do Painel (`backend/server.js`)
- `GET /api/all-data`: Retorna o estado consolidado da farmácia (pedidos, boletos, faltas, fechamentos de caixa, contas fixas, limites mensais, tarefas e logs de auditoria).

---

## 3. Protocolos e Mecanismos de Comunicação

### 3.1 HTTP REST Endpoints (100% Client-Server)
Todas as interações entre o frontend React (Vite/TypeScript) e o backend Express ocorrem exclusivamente através de requisições **HTTP REST** no formato JSON.

### 3.2 Ausência de Socket.io / WebSockets no Cliente-Servidor
- **Diagnóstico**: O projeto **NÃO** possui a biblioteca `socket.io` ou servidor `ws`/`WebSocket` para atualização em tempo real do navegador.
- **Nota Importante sobre `@whiskeysockets/baileys`**: O pacote `@whiskeysockets/baileys` presente em `backend/package.json` é utilizado **estritamente como cliente headless internamente no Node.js** para conexão via socket com os servidores do WhatsApp Web. Ele não abre nem expõe servidor WebSocket para o painel web frontend.

### 3.3 Mecanismo de Polling (Consultas Periódicas)
Como a aplicação opera sem WebSockets no frontend, a sincronização de dados e atualização do painel utiliza o padrão de **Polling**:
1. **Frontend Polling**:
   - Componentes React como `DeliveryWidget.tsx`, `DeliverySummaryChart.tsx` e `App.tsx` realizam chamadas HTTP `fetch()` periódicas via `useEffect` ou refetches acionados por ação do usuário.
2. **Backend Background Services & Timers**:
   - **Varredura Periódica de Deliveries**: `backend/server.js:3703` executa `setInterval` a cada **10 minutos** chamando `scanDeliveriesFromWhatsApp(db, { hours: 24 })`.
   - **Varredura Secundária**: `backend/delivery-endpoints.js:262` executa `setInterval` a cada **30 minutos** (últimas 48h).
   - **Varredura no Boot**: `backend/server.js:3693` executa varredura do mês atual 15 segundos após o boot do servidor.
3. **Comunicação Backend ↔ Evolution API**:
   - O backend faz chamadas REST para a Evolution API (`http://evolution-api:8080`) nos endpoints `/chat/findChats/:instance` e `/chat/findMessages/:instance` para sincronizar conversas do WhatsApp no SQLite local (`whatsapp_messages` e `whatsapp_contacts`).

---

## 4. Especificação dos Novos Endpoints REST da Fila de Revisão

Para atender aos requisitos R1, R2 e R3, propõe-se a adição de 3 novos endpoints REST principais e 1 endpoint de métricas agregadas no arquivo `backend/delivery-endpoints.js`.

### 4.1 Endpoint 1: `GET /api/deliveries/pending-reviews`
- **Finalidade**: Obter a lista de conversas ociosas/encerradas com status `pending_review` para exibição na caixa de entrada/fila de pendências do Painel.
- **Método HTTP**: `GET`
- **URL**: `/api/deliveries/pending-reviews`
- **Query Parameters**:
  - `limit` (opcional, padrão `50`)
  - `offset` (opcional, padrão `0`)
  - `search` (opcional: busca por nome do cliente, telefone ou produtos)

#### Exemplo de Resposta (200 OK):
```json
{
  "success": true,
  "count": 2,
  "totalPending": 5,
  "pendingReviews": [
    {
      "id": "deliv_1723467890_a1b2c",
      "phone": "32988634755",
      "customer_name": "Maria Silva",
      "wa_name": "Maria Silva",
      "is_new_customer": 1,
      "chat_duration_seconds": 420,
      "chat_message_count": 14,
      "items": "Amoxicilina 500mg, Paracetamol 750mg",
      "discussed_products": [
        {
          "product_name": "Amoxicilina 500mg",
          "quantity": 1,
          "estimated_price": 28.50
        },
        {
          "product_name": "Paracetamol 750mg",
          "quantity": 2,
          "estimated_price": 12.00
        }
      ],
      "total_amount": 52.50,
      "ai_suggested_status": "Nao_Fechado",
      "ai_suggested_reason": "Preço Alto",
      "last_message_id": "msg_1723467885",
      "created_at": "2026-08-12T13:30:00Z"
    }
  ]
}
```

---

### 4.2 Endpoint 2: `GET /api/deliveries/pending-reviews/:id`
- **Finalidade**: Obter os detalhes completos de uma revisão pendente específica para popular o modal do Questionário do Atendente no Painel.
- **Método HTTP**: `GET`
- **URL**: `/api/deliveries/pending-reviews/:id`

#### Exemplo de Resposta (200 OK):
```json
{
  "success": true,
  "review": {
    "id": "deliv_1723467890_a1b2c",
    "phone": "32988634755",
    "customer_name": "Maria Silva",
    "wa_name": "Maria Silva",
    "is_new_customer": 1,
    "customer_history": {
      "is_registered": true,
      "previous_purchases_count": 0,
      "registered_since": "2026-08-10"
    },
    "chat_metrics": {
      "duration_seconds": 420,
      "formatted_duration": "7m 00s",
      "total_messages": 14,
      "first_message_at": "2026-08-12T13:23:00Z",
      "last_message_at": "2026-08-12T13:30:00Z"
    },
    "discussed_products": [
      {
        "id": "prod_1",
        "product_name": "Amoxicilina 500mg",
        "quantity": 1,
        "estimated_price": 28.50
      },
      {
        "id": "prod_2",
        "product_name": "Paracetamol 750mg",
        "quantity": 2,
        "estimated_price": 12.00
      }
    ],
    "ai_prefill": {
      "sale_closed": false,
      "suggested_reason": "Preço Alto",
      "notes": "Cliente achou o valor da Amoxicilina acima do orçamento."
    },
    "review_status": "pending_review",
    "created_at": "2026-08-12T13:30:00Z"
  }
}
```

---

### 4.3 Endpoint 3: `POST /api/deliveries/:id/submit-review`
- **Finalidade**: Submeter as respostas do Questionário do Atendente. Confirma se gerou entrega (Sim) ou registra os motivos de rejeição por produto (Não), marca o item como revisado (`review_status = 'reviewed'`) e o remove da fila pendente.
- **Método HTTP**: `POST`
- **URL**: `/api/deliveries/:id/submit-review`

#### Exemplo de Payload de Requisição (Body JSON):
```json
{
  "sale_closed": false,
  "reviewed_by": "Atendente João",
  "delivery_details": {
    "customer_name": "Maria Silva",
    "delivery_address": "Rua das Flores, 123",
    "payment_method": "Pix",
    "total_amount": 52.50
  },
  "rejection_details": {
    "primary_reason": "Preço Alto",
    "rejected_products": [
      {
        "product_name": "Amoxicilina 500mg",
        "reason": "Preço Alto",
        "notes": "Cliente comprou na farmácia concorrente por R$ 22,00"
      },
      {
        "product_name": "Paracetamol 750mg",
        "reason": "Apenas Dúvida",
        "notes": "Consultou preço para compra futura"
      }
    ]
  },
  "notes": "Atendimento finalizado pelo atendente no painel."
}
```

#### Exemplo de Resposta (200 OK):
```json
{
  "success": true,
  "message": "Revisão concluída e removida da fila com sucesso!",
  "delivery": {
    "id": "deliv_1723467890_a1b2c",
    "status": "Nao_Fechado",
    "sale_closed": 0,
    "review_status": "reviewed",
    "reviewed_by": "Atendente João",
    "reviewed_at": "2026-08-12T13:50:00Z"
  },
  "rejectionsRecorded": 2
}
```

---

### 4.4 Endpoint de Apoio: `GET /api/deliveries/rejection-metrics`
- **Finalidade**: Retornar métricas agregadas de rejeição de produtos e motivos para os gráficos e relatórios do Painel.
- **Método HTTP**: `GET`
- **URL**: `/api/deliveries/rejection-metrics`
- **Query Parameters**: `period` (`today`, `7days`, `30days`, `month`, `all`)

#### Exemplo de Resposta (200 OK):
```json
{
  "success": true,
  "period": "month",
  "metrics": {
    "totalRejections": 45,
    "byReason": {
      "Preço Alto": 20,
      "Falta de Estoque": 15,
      "Apenas Dúvida": 7,
      "Desistiu": 3
    },
    "topRejectedProducts": [
      { "product_name": "Dorflex 36 Comprimidos", "count": 8, "topReason": "Preço Alto" },
      { "product_name": "Ozempic 1mg", "count": 6, "topReason": "Falta de Estoque" }
    ],
    "newVsRecurringRejections": {
      "new_customer": 28,
      "recurring_customer": 17
    }
  }
}
```

---

## 5. Infraestrutura de Testes e Estratégia de Verificação

### 5.1 Estado Atual da Suíte de Testes
- **Diagnóstico**: O projeto **NÃO** utiliza frameworks de testes como Jest, Vitest ou Mocha nos scripts do npm (`package.json`).
- **Padrão Utilizado na Aplicação**: Testes automatizados e de integração são realizados via scripts isolados Node.js em `backend/scripts/` (ex: `backend/scripts/test-delivery-ai.js`) e scripts utilitários em `scratch/test_*.cjs`.

### 5.2 Estratégia Recomendada para Testes da API

1. **Script de Teste de Integração Node.js (`backend/scripts/test-audit-endpoints.js`)**:
   - Cria um registro fictício em `whatsapp_messages` e executa a varredura da IA.
   - Valida a presença da conversa na fila via `GET /api/deliveries/pending-reviews`.
   - Executa a submissão via `POST /api/deliveries/:id/submit-review`.
   - Verifica se a conversa mudou o status para `reviewed`, saiu da fila pendente e gerou os registros na tabela `chat_product_rejections`.

2. **Validação via PowerShell / cURL HTTP**:
   ```powershell
   # 1. Consultar a fila de revisões pendentes
   Invoke-RestMethod -Uri "http://localhost:3001/api/deliveries/pending-reviews" -Method Get

   # 2. Submeter formulário de auditoria
   $body = @{
       sale_closed = $false
       reviewed_by = "Atendente Teste"
       rejection_details = @{
           primary_reason = "Preço Alto"
           rejected_products = @(
               @{ product_name = "Medicamento Teste"; reason = "Preço Alto"; notes = "Caro" }
           )
       }
   } | ConvertTo-Json -Depth 5

   Invoke-RestMethod -Uri "http://localhost:3001/api/deliveries/deliv_123/submit-review" -Method Post -ContentType "application/json" -Body $body
   ```

---

## 6. Matriz de Rastreabilidade de Requisitos

| Requisito | Componente / Endpoint | Status / Ação Recomendada |
| :--- | :--- | :--- |
| **R1. Fila de Revisão Automática (IA)** | `whatsapp-delivery-service.js` & SQLite | Atualizar IA para classificar `review_status = 'pending_review'`, calcular `is_new_customer`, `chat_duration_seconds` e extrair `discussed_products_json`. |
| **R2. Alerta e Fila no Painel (Frontend)** | `GET /api/deliveries/pending-reviews` | Criar novo endpoint REST no `delivery-endpoints.js` e implementar polling no frontend. |
| **R3. Questionário do Atendente** | `GET /api/deliveries/pending-reviews/:id` & `POST /api/deliveries/:id/submit-review` | Criar endpoints REST para buscar detalhes pré-preenchidos e salvar a auditoria de rejeição de produtos no SQLite. |
