# Relatório de Análise Técnica — Arquitetura de Backend e Serviços da BelaFarma

**Data**: 2026-08-29  
**Investigador**: Explorer Survey Backend (teamwork_preview_explorer)  
**Escopo**: Mapeamento completo de backend, serviços, integrações (Firebird Digifarma, Baileys WhatsApp, SQLite local, Evolution API, IA) e especificação arquitetural do novo módulo **"Central de Compras"** (Requisitos R1 a R5).

---

## 1. Visão Geral da Arquitetura e Topologia do Sistema

O ecossistema **BelaFarma** opera em um modelo híbrido local de alta disponibilidade, rodando em hardware dedicado no ambiente da farmácia e integrando o sistema de gestão legado (Digifarma em Firebird) à plataforma moderna (Node.js/Express + SQLite + React/Vite + Baileys WhatsApp).

### 1.1 Topologia de Rede e Infraestrutura

```
+------------------------------------------------------------------------------------+
|                                REDE LOCAL DA FARMÁCIA                              |
|                                                                                    |
|  +-----------------------------+               +--------------------------------+  |
|  |  SERVIDOR DIGIFARMA ERP     |               |  SERVIDOR VPS CASEIRO (PROD)   |  |
|  |  IP: 192.168.1.10           |               |  Raspberry Pi 4 (192.168.1.70) |  |
|  |  - Firebird 2.5 (Port 3050) |               |                                |  |
|  |  - C:\Digifarma\Dados\      |               |  +-- Docker Compose ---------+ |  |
|  |    digifarma6.fdb           |               |  | - Frontend (Nginx :8085)  | |  |
|  +--------------^--------------+               |  | - Backend (Express :3001) | |  |
|                 |                              |  | - Evolution API (:8080)   | |  |
|                 | (TCP 3050 - node-firebird)   |  +-------------^-------------+ |  |
|                 +------------------------------+----------------+               |  |
|                                                                 |                  |
|  +-----------------------------+                                |                  |
|  | DISPOSITIVO RÁDIO LOCAL     |<-------------------------------+                  |
|  | IP: 192.168.1.70:5005       | (HTTP TTS Anúncios)                               |
|  +-----------------------------+                                                   |
+------------------------------------------------------------------------------------+
```

- **Hospedagem de Produção**: Raspberry Pi 4 rodando Debian/Docker (`192.168.1.70`).
- **Deploy**: `git pull origin main` seguido de reinicialização dos containers via Docker Compose.
- **Volumes Persistentes no Host**:
  - `./data:/usr/src/app/data` (Banco SQLite `belafarma.db` e sessões)
  - `./data/baileys-session:/usr/src/app/data/baileys-session` (WhatsApp Principal)
  - `./data/baileys-session-secondary:/usr/src/app/data/baileys-session-secondary` (WhatsApp Secundário)
  - `./uploads:/usr/src/app/uploads` (Mídias e relatórios)
  - `./mensagens:/usr/src/app/mensagens` (Arquivos locais de mensagens)

---

## 2. Inventário de Serviços, Dependências e Configuração de Backend

### 2.1 Backend Monolítico Express (`backend/`)
- **Ponto de Entrada**: `backend/server.js` (escuta na porta interna `3001`).
- **Gerenciador de Pacotes / Runtime**: Node.js com CommonJS (`package.json`).
- **Dependências Chave (`backend/package.json`)**:
  - `@whiskeysockets/baileys` (`^7.0.0-rc14`): Conexão direta de socket ao protocolo do WhatsApp sem navegador.
  - `better-sqlite3` (`^12.6.2`): Banco de dados transacional de altíssima performance local com modo WAL ativado.
  - `node-firebird` (`^2.3.2`): Driver nativo para conexão com o banco Firebird 2.5 do Digifarma com pool de conexões e controle transacional explícito.
  - `express` (`^4.19.2`) & `cors` (`^2.8.5`): Servidor HTTP e middlewares de API.
  - `node-cron` (`^4.2.1`): Agendador de tarefas periódicas em segundo plano.
  - `multer` (`^2.0.2`): Upload multipart para boletos, relatórios e comprovantes.
  - `pdf-parse` (`^2.4.5`) & `csv-parser` (`^3.2.0`): Extração de dados de relatórios e faturas.
  - `openai` (`^4.33.0`) & `@google/genai` (suporte a Gemini): Motores de IA para processamento de linguagem natural e visão computacional.
  - `qrcode` (`^1.5.4`): Geração de strings base64 para pareamento de sessões Baileys.
  - `puppeteer` (`^24.43.1`): Usado em scripts de automação/scraping isolados.

### 2.2 Variáveis de Ambiente Essenciais (`.env`)
- `EVOLUTION_API_URL=http://192.168.1.70:8080`
- `EVOLUTION_API_KEY=BelafarmaSul2026`
- `EVOLUTION_INSTANCE_NAME=belaFarma`
- `EVOLUTION_SENDER_INSTANCE=belaAtende`
- `ADMIN_WHATSAPP=+5532988634755,+553298526604`
- `EDEVALDO_WHATSAPP=+5532988634755`
- `AI_PROVIDER=gemini` (ou `openai` / `ollama`)
- `GEMINI_API_KEY` & `OPENAI_API_KEY`
- `DB_PATH=/usr/src/app/data/belafarma.db`

### 2.3 Camada de Persistência Dual (SQLite + Firebird)

1. **SQLite (`backend/database.js`)**:
   - Ativado com `db.pragma('journal_mode = WAL')` para alta concorrência.
   - Centraliza todas as entidades web: `users`, `orders`, `boletos`, `monthly_limits`, `shortages`, `suppliers`, `local_suppliers`, `quotations`, `quotation_lists`, `quotation_list_items`, `accounts_payable`, `invoices`, `sales`, `deliveries`, `whatsapp_messages`, `ai_cache`, `digifarma_products_cache`, etc.

2. **Firebird ERP (`backend/services/digifarma.service.js` & `digifarma-sync.service.js`)**:
   - Pool de conexões: `firebird.pool(5, options)`.
   - Suporte nativo tanto a leitura quanto a **escrita transacional** com `db.transaction(firebird.ISOLATION_READ_COMMITTED)` e `tr.commit()`.
   - **Tabelas do Firebird Mapeadas**:
     - `PRODUTOS`: `PRODUTO_ID`, `PRODUTO`, `APRESENTACAO`, `COD_BARRAS`, `PROD_SALDO`, `PROD_ESTMINIMO`, `PROD_PRVENDA`, `PROD_PRCOMPRA`, `VALOR_ULT_COMPRA`, `CATEGORIA_ID`, `PROD_ATIVO`.
     - `CAB_VENDAS` / `ITEM_VENDAS`: Registro de vendas históricas e faturamento por produto.
     - `CAB_NOTAS` / `ITEM_NOTAS`: Entradas de mercadorias, fornecedor, quantidade e preço de custo real faturado.
     - `VIEW_ULT_COMPRAS`: Visão do Digifarma com histórico de última compra e fornecedor.
     - `FORNECEDORES`: `FORNECEDOR_ID`, `FORNECEDOR`, `TELEFONE`, `CNPJ`.
     - `FICHARIO` / `CLIENTES`: Dados do crediário e inadimplência.

---

## 3. Estado Atual dos Módulos Relacionados a Compras e WhatsApp

### 3.1 Módulo Legado de Compras (`purchasing-endpoints.js`)
Atualmente possui endpoints parciais e experimentais:
- `GET /api/purchasing/suppliers`: Lista fornecedores do Digifarma mesclados com dados locais de `local_suppliers` (representante, telefone, prazo de boletos).
- `POST /api/purchasing/suppliers/update`: Atualiza telefone e dados do representante localmente.
- `GET /api/purchasing/live-suggestions`: Sugestões simples baseadas em `PROD_SALDO <= PROD_ESTMINIMO` ou `<= 1`.
- `GET /api/purchasing/forecast`: Previsão de esgotamento e cálculo de Curva ABC para 30 dias.
- `POST /api/purchasing/quotes/send`: Envia cotação via `baileysSecondaryService` diretamente sem fila formal de aprovação human-in-the-loop.
- `GET /api/purchasing/product/:id/history`: Consulta últimas 6 compras do produto em `ITEM_NOTAS` / `CAB_NOTAS`.

### 3.2 Instâncias Baileys Existentes no Backend
1. **`baileys-service.js` (Instância Primária)**:
   - Sessão: `baileys-session` (ou `data/baileys-session`).
   - Uso: Auditoria de comprovantes PIX (`pix-bot.service.js`), histórico de mensagens do WhatsApp e catálogo.
2. **`baileys-secondary-service.js` (Instância Secundária)**:
   - Sessão: `baileys-session-secondary` (ou `data/baileys-session-secondary`).
   - Uso: Robô de etiquetas e envios operacionais.

> **Importante para a Central de Compras**: O requisito **R2** exige uma **instância de WhatsApp isolada e dedicada exclusivamente para o Comercial de Compras** (`baileys-compras-service.js`), com seu próprio diretório de sessão (`baileys-session-compras`), garantindo total independência operacional e separação das conversas de compras das conversas de clientes/vendas e de etiquetas.

---

## 4. Arquitetura Proposta para o Módulo "Central de Compras" (R1 a R5)

Para atender integralmente aos requisitos do `ORIGINAL_REQUEST.md`, estruturamos a arquitetura do backend em 5 serviços especializados sob `backend/services/`, com um roteador dedicado `backend/compras-endpoints.js` montado em `server.js` como `/api/central-compras`.

```
backend/
├── compras-endpoints.js                   <-- Router principal (/api/central-compras/*)
├── baileys-compras-service.js            <-- Instância isolada Baileys para Compras
└── services/
    ├── compras-estoque.service.js        <-- R1: Cálculo de Estoque Mínimo (30d) e gravação Firebird
    ├── compras-mineracao.service.js       <-- R2: Mineração histórica de conversas e radar de ofertas
    ├── compras-cotacoes.service.js        <-- R3: Motor de cotações, Score Ponderado e Pedido Mínimo
    ├── compras-aprovacao.service.js       <-- R4: Fila de aprovação estrita e alerta duplo
    └── compras-pedidos.service.js         <-- R5: Geração de pedidos formais e controle orçamentário
```

---

### 4.1 Detalhamento dos Componentes

#### R1: Inteligência de Estoque Mínimo para 30 Dias e Sincronização Digifarma
- **Arquivo**: `backend/services/compras-estoque.service.js`
- **Algoritmo de Cálculo**:
  1. Para cada produto com `PROD_ATIVO = 'S'`:
     - Consulta vendas dos últimos 30 a 60 dias (`ITEM_VENDAS` / `CAB_VENDAS`).
     - Calcula a média diária ponderada de vendas: $\text{VendaDiaria} = \frac{\text{QtdVendida60d}}{60}$.
     - Calcula o estoque ideal para 30 dias com margem de segurança configurável (padrão 15%):
       $$\text{EstoqueMinimo30d} = \lceil (\text{VendaDiaria} \times 30) \times (1 + \text{MargemSegurança}) \rceil$$
  2. **Gravação no Digifarma**:
     - Executa via `queryDigifarma` com transação segura:
       ```sql
       UPDATE PRODUTOS 
       SET PROD_ESTMINIMO = ? 
       WHERE PRODUTO_ID = ?
       ```
     - Tratamento automático de rollback caso o banco esteja travado ou ocorra falha de rede.
  3. **Monitoramento e Alertas em Tempo Real**:
     - Classifica produtos em:
       - **Ruptura Crítica**: `PROD_SALDO <= 0` com histórico de vendas ativo.
       - **Abaixo do Mínimo**: `PROD_SALDO < PROD_ESTMINIMO`.
       - **Estoque Regular**: `PROD_SALDO >= PROD_ESTMINIMO`.

#### R2: Instância Isolada Baileys WhatsApp de Compras e Mineração Histórica
- **Arquivos**: `backend/baileys-compras-service.js` e `backend/services/compras-mineracao.service.js`
- **Diretório de Sessão**: `backend/baileys-session-compras` (ou `/usr/src/app/data/baileys-session-compras` no container Docker).
- **Funcionalidades**:
  1. Pareamento via QR Code exibido na guia "Conexão WhatsApp Comercial" da Central de Compras.
  2. **Varredura e Mineração do Histórico**:
     - Percorre as conversas existentes com representantes da farmácia.
     - Extrai via IA e expressões regulares:
       - Nome do representante e Distribuidora/Laboratório representada;
       - Condições e prazos negociados (ex: 28/35/42 dias, 30 dias boleto, à vista com desconto);
       - Valor de **Pedido Mínimo** de cada distribuidora (ex: R$ 300,00, R$ 500,00);
       - Catálogo histórico de itens/categorias fornecidos.
     - Persiste na tabela `compras_fornecedores_meta`.
  3. **Radar de Ofertas Contínuo**:
     - Ao receber novas mensagens (texto ou imagens de tabelas/promocionais), analisa os produtos e preços ofertados.
     - Cruza com a lista de faltas/estoque baixo e com `VIEW_ULT_COMPRAS` do Digifarma.
     - Se o preço ofertado for **inferior ao último preço de compra registrado no Digifarma**, gera uma oportunidade imediata no painel `Mineração & Oportunidades`.

#### R3: Motor de Cotações Inteligentes, Ranking Ponderado e Otimização de Pedido Mínimo
- **Arquivo**: `backend/services/compras-cotacoes.service.js`
- **Funcionalidades**:
  1. **Seleção de Fornecedores Elegíveis**:
     - Identifica quais fornecedores atendem cada item com base no histórico de compras (`CAB_NOTAS`) e produtos minerados no WhatsApp.
  2. **Geração Contextualizada de Solicitação de Cotação**:
     - Prepara a mensagem personalizada para o representante com os itens necessários.
     - **Encaminha a mensagem diretamente para a Fila de Aprovação Obrigatória (R4)**.
  3. **Interpretação de Respostas de Cotação**:
     - Parser inteligente (texto, mensagens de tabela, imagens via OCR/IA multimodal).
     - Extrai preço bruto, desconto comercial, bonificação (ex: "compre 10 ganhe 2" $\rightarrow$ preço unitário efetivo = $\frac{10 \times \text{preço}}{12}$).
  4. **Algoritmo de Score Ponderado**:
     $$\text{Score} = (0.60 \times S_{\text{preço}}) + (0.25 \times S_{\text{prazo}}) + (0.15 \times S_{\text{confiabilidade}})$$
     - **Preço Líquido (60%)**: Pontuação normalizada pelo menor preço unitário efetivo.
     - **Prazo & Orçamento (25%)**: Avalia dias para pagamento (ex: 42 dias > 28 dias > à vista) e compatibilidade com o fluxo de caixa do mês.
     - **Histórico & Quebras (15%)**: Penaliza fornecedores com histórico de não entrega (falta de estoque/ruptura no faturamento).
  5. **Otimização de Pedido Mínimo**:
     - Se o total de itens mais baratos em uma distribuidora não atingir o valor mínimo de faturamento (ex: R$ 400 de um mínimo de R$ 600):
       - *Opção A*: Simula preenchimento com outros produtos de giro alto atendidos por ela.
       - *Opção B*: Realoca para o 2º colocado global e compara o custo total (preço ligeiramente superior vs não pagar frete/não atingir mínimo).
  6. **Gestão de Timeout e Quebra**:
     - Se o fornecedor não responder no prazo limite estipulado (ex: 4 horas úteis) ou avisar falta de estoque, o motor passa a vez para o segundo colocado no ranking.

#### R4: Fila de Aprovação Obrigatória com Alerta Duplo
- **Arquivo**: `backend/services/compras-aprovacao.service.js`
- **Regra Fundamental**: **Nenhuma mensagem externa é disparada no WhatsApp sem autorização humana explícita**.
- **Fluxo**:
  1. Toda mensagem gerada pelo bot (solicitação de cotação, envio de espelho de pedido, contraproposta) é inserida na tabela `compras_approval_queue` com status `Pendente`.
  2. **Disparo de Alerta Duplo**:
     - **Canal 1 (Web)**: Badge vermelho e item destacado na aba "Fila de Aprovação" da interface web.
     - **Canal 2 (WhatsApp ADM)**: Notificação instantânea para os números configurados em `ADMIN_WHATSAPP` com o resumo da solicitação e link direto de aprovação rápida.
  3. **Ações do Administrador na Interface Web**:
     - Visualizar destinatário, produtos, preços e texto completo;
     - Editar texto e quantidades se desejar;
     - Clicar em `[Aprovar e Enviar]` (dispara via Baileys Compras) ou `[Rejeitar / Cancelar]`.

#### R5: Elaboração de Pedidos de Compra, Controle Orçamentário e Nova Guia "Central de Compras"
- **Arquivo**: `backend/services/compras-pedidos.service.js`
- **Funcionalidades**:
  1. **Espelho Formal de Pedido de Compra**:
     - Cria espelho com numeração única: distribuidora, representante, código de barras/EAN, descrição, quantidade, preço unitário, bonificação, prazo de pagamento e previsão de entrega.
  2. **Trava Orçamentária e Projeção de Caixa**:
     - Consulta o limite mensal de compras em `monthly_limits`.
     - Soma pedidos já realizados no mês (`orders` e `accounts_payable`) + boletos a vencer (`boletos`).
     - Alerta se o novo pedido ultrapassar o teto orçamentário configurado para o mês.
     - Registra os vencimentos projetados no contas a pagar.
  3. **Central de Compras Unificada na Interface Web**:
     - Nova guia dedicada no menu lateral do frontend (`Sidebar.tsx`) agrupando as 7 subseções operacionais exigidas pelo requisito.

---

## 5. Modelo de Dados SQLite Proposto (`backend/database.js`)

Para suportar todas as operações sem afetar as tabelas legadas existentes, serão adicionadas as seguintes tabelas estruturadas no SQLite:

```sql
-- 1. Metadados estendidos e histórico de fornecedores/distribuidoras
CREATE TABLE IF NOT EXISTS compras_fornecedores_meta (
  id TEXT PRIMARY KEY,
  digifarma_id INTEGER UNIQUE,
  distribuidora TEXT NOT NULL,
  representante TEXT,
  telefone TEXT NOT NULL,
  prazos_pagamento TEXT,         -- JSON array: ["28/35/42", "30 dias"]
  pedido_minimo_valor REAL DEFAULT 0,
  pedido_minimo_condicoes TEXT,
  taxa_quebra_percent REAL DEFAULT 0, -- Taxa histórica de falta na entrega
  pontualidade_score REAL DEFAULT 100,
  categorias_fornecidas TEXT,     -- JSON array
  ultima_varredura_at TEXT,
  created_at TEXT NOT NULL
);

-- 2. Histórico de produtos e oportunidades mineradas do WhatsApp
CREATE TABLE IF NOT EXISTS compras_oportunidades_mineradas (
  id TEXT PRIMARY KEY,
  fornecedor_id TEXT,
  distribuidora TEXT,
  telefone TEXT,
  mensagem_raw TEXT,
  produto_nome TEXT NOT NULL,
  ean TEXT,
  preco_ofertado REAL NOT NULL,
  preco_ult_compra_digifarma REAL,
  percentual_desconto REAL,
  condicoes_pagamento TEXT,
  status TEXT DEFAULT 'Disponivel', -- 'Disponivel', 'Aproveitada', 'Expirada', 'Ignorada'
  data_oferta TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (fornecedor_id) REFERENCES compras_fornecedores_meta(id)
);

-- 3. Sessões e listas de cotação inteligentes
CREATE TABLE IF NOT EXISTS compras_cotacoes (
  id TEXT PRIMARY KEY,
  numero_cotacao TEXT NOT NULL UNIQUE,
  titulo TEXT NOT NULL,
  status TEXT DEFAULT 'Aberta',    -- 'Aberta', 'Em_Analise', 'Finalizada', 'Cancelada'
  itens_solicitados TEXT NOT NULL, -- JSON array de itens [{ produto_id, nome, ean, qtd_sugerida }]
  criterios_score TEXT,            -- JSON de pesos { pesoPreco: 0.60, pesoPrazo: 0.25, pesoHistorico: 0.15 }
  created_at TEXT NOT NULL,
  finalizada_at TEXT
);

-- 4. Respostas de cotações por fornecedor
CREATE TABLE IF NOT EXISTS compras_cotacoes_respostas (
  id TEXT PRIMARY KEY,
  cotacao_id TEXT NOT NULL,
  fornecedor_id TEXT,
  distribuidora TEXT NOT NULL,
  telefone TEXT NOT NULL,
  status TEXT DEFAULT 'Pendente',  -- 'Pendente', 'Respondida', 'Timeout', 'Recusada'
  solicitada_em TEXT NOT NULL,
  respondida_em TEXT,
  resposta_raw TEXT,
  itens_cotados_json TEXT,         -- JSON array [{ produto_id, preco_bruto, desconto, preco_liquido, bonificacao }]
  score_preco REAL DEFAULT 0,
  score_prazo REAL DEFAULT 0,
  score_historico REAL DEFAULT 0,
  score_total REAL DEFAULT 0,
  vencedora INTEGER DEFAULT 0,
  FOREIGN KEY (cotacao_id) REFERENCES compras_cotacoes(id) ON DELETE CASCADE
);

-- 5. FILA DE APROVAÇÃO OBRIGATÓRIA (Human-in-the-Loop)
CREATE TABLE IF NOT EXISTS compras_approval_queue (
  id TEXT PRIMARY KEY,
  tipo TEXT NOT NULL,              -- 'solicitacao_cotacao', 'pedido_compra', 'negociacao'
  destinatario_telefone TEXT NOT NULL,
  destinatario_nome TEXT NOT NULL,
  distribuidora TEXT,
  mensagem_texto TEXT NOT NULL,
  itens_detalhes_json TEXT,        -- JSON com lista de produtos/valores para revisão visual
  referencia_id TEXT,             -- ID da cotação ou pedido
  status TEXT DEFAULT 'Pendente',  -- 'Pendente', 'Aprovado', 'Rejeitado', 'Enviado', 'Falha'
  motivo_rejeicao TEXT,
  notificacao_admin_enviada INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  reviewed_at TEXT,
  reviewed_by TEXT,
  sent_at TEXT
);

-- 6. Pedidos formais de compra e espelhos
CREATE TABLE IF NOT EXISTS compras_pedidos (
  id TEXT PRIMARY KEY,
  numero_pedido TEXT NOT NULL UNIQUE,
  cotacao_id TEXT,
  fornecedor_id TEXT,
  distribuidora TEXT NOT NULL,
  representante TEXT,
  telefone TEXT,
  itens_json TEXT NOT NULL,        -- JSON [{ codigo, ean, descricao, qtd, preco_unit, bonificacao, total }]
  valor_total REAL NOT NULL,
  condicao_pagamento TEXT NOT NULL,
  previsao_entrega TEXT,
  status TEXT DEFAULT 'Pendente_Aprovacao', -- 'Pendente_Aprovacao', 'Aprovado', 'Enviado', 'Faturado', 'Entregue', 'Cancelado'
  integrado_contas_pagar INTEGER DEFAULT 0,
  order_legado_id TEXT,
  created_at TEXT NOT NULL,
  enviado_at TEXT
);

-- 7. Configurações gerais da Central de Compras
CREATE TABLE IF NOT EXISTS compras_configuracoes (
  chave TEXT PRIMARY KEY,
  valor TEXT NOT NULL,
  descricao TEXT,
  updated_at TEXT
);
```

---

## 6. Mapeamento de Endpoints da API (`/api/central-compras/*`)

| Método | Rota | Descrição |
|---|---|---|
| **GET** | `/api/central-compras/dashboard` | Resumo geral: produtos em ruptura, estoque baixo, oportunidades ativas, cotações abertas e fila de aprovação. |
| **GET** | `/api/central-compras/stock/suggestions` | Lista de sugestões com cálculo de estoque mínimo para 30 dias (CMV + 15%), estoque atual e status de ruptura. |
| **POST** | `/api/central-compras/stock/sync-digifarma` | Executa gravação transacional do estoque mínimo calculado na tabela `PRODUTOS` do Digifarma Firebird. |
| **GET** | `/api/central-compras/whatsapp/status` | Status da instância comercial Baileys (`baileys-compras-service.js`). |
| **GET** | `/api/central-compras/whatsapp/qrcode` | Obtém QR Code base64 para pareamento do WhatsApp de compras. |
| **POST** | `/api/central-compras/whatsapp/reconnect` | Reseta sessão e força nova conexão Baileys de Compras. |
| **POST** | `/api/central-compras/whatsapp/mine-history` | Dispara varredura profunda no histórico de conversas da instância de compras para catalogar representantes e pedidos mínimos. |
| **GET** | `/api/central-compras/opportunities` | Lista oportunidades de compra ativas identificadas nas mensagens do WhatsApp. |
| **POST** | `/api/central-compras/quotes/create` | Cria nova sessão de cotação para lista de faltas selecionadas. |
| **POST** | `/api/central-compras/quotes/:id/request-all` | Gera textos de cotação por fornecedor e enfileira na **Fila de Aprovação (R4)**. |
| **POST** | `/api/central-compras/quotes/:id/parse-response` | Recebe texto/imagem da resposta do fornecedor e extrai preços/bonificações via IA. |
| **GET** | `/api/central-compras/quotes/:id/ranking` | Retorna comparativo com Score Ponderado (60/25/15) e otimização de pedido mínimo. |
| **GET** | `/api/central-compras/approval/queue` | Lista mensagens pendentes de aprovação humana. |
| **POST** | `/api/central-compras/approval/:id/approve` | Aprova e envia a mensagem imediatamente via WhatsApp de compras. |
| **POST** | `/api/central-compras/approval/:id/reject` | Rejeita a mensagem pendente com justificativa. |
| **PUT** | `/api/central-compras/approval/:id/edit` | Permite ao administrador editar texto ou valores da mensagem antes do envio. |
| **POST** | `/api/central-compras/orders/generate` | Gera espelho formal de pedido de compra por distribuidora vencedora. |
| **GET** | `/api/central-compras/orders` | Lista pedidos de compra emitidos, status e integração orçamentária. |
| **GET** | `/api/central-compras/suppliers` | Gestão completa de representantes, distribuidoras, prazos e pedido mínimo. |
| **POST** | `/api/central-compras/suppliers/save` | Cadastro e edição de dados de fornecedores. |
| **GET** | `/api/central-compras/settings` | Obtém configurações de margem de segurança, pesos de score e alertas. |
| **PUT** | `/api/central-compras/settings` | Atualiza parâmetros operacionais da Central de Compras. |

---

## 7. Estratégia de Testes Automatizados

Para garantir robustez e validação completa:
1. **Testes Unitários**:
   - Algoritmo de cálculo de CMV diário e Estoque Mínimo com margem de 15%.
   - Algoritmo de Score Ponderado (60% preço, 25% prazo, 15% histórico).
   - Otimizador de Pedido Mínimo com simulação de preenchimento e realocação.
2. **Testes de Integração com Banco**:
   - Transação Firebird (commit e rollback) de atualização de `PROD_ESTMINIMO`.
   - Persistência e consultas em `compras_approval_queue`, `compras_pedidos` e `compras_oportunidades_mineradas`.
3. **Testes de Fluxo End-to-End (Human-in-the-Loop)**:
   - Validação de que nenhuma mensagem é enviada sem status `Aprovado` na fila.
   - Disparo de notificação para administradores em `ADMIN_WHATSAPP`.

---
*Relatório concluído com sucesso e pronto para a fase de planejamento e execução pelo time de implementação.*
