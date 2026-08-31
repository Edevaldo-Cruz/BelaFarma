# Handoff Report: Mapeamento de Frontend Web UI e WhatsApp Baileys (Central de Compras)

## 1. Observation
1. **Frontend Architecture & Navigation**:
   - `App.tsx:64` e `types.ts:491`: As visões do aplicativo são gerenciadas pelo tipo de união `View` e armazenadas no estado `const [currentView, setCurrentView] = useState<View>('dashboard')`.
   - `components/Sidebar.tsx:208-250`: O menu lateral possui a lista `menuItems`, filtrando itens administrativos via `adminOnly` e ordenando alfabeticamente com exceção de `Dashboard` (fixo no topo) e `Settings` (fixo no final).
   - `components/MobileHeader.tsx:14-50`: O cabeçalho mobile segue estritamente a regra do projeto: logo centralizado no topo na primeira linha (`py-3 border-b`), e menu hamburger + busca na segunda linha (`px-4 py-2`).
   - `components/ToastContext.tsx:22-68`: Notificações usam `useToast()` com auto-dismiss de 5 segundos. O projeto possui regra estrita de proibir `alert()` nativo.
2. **Componentes Existentes de Compras & Cotações**:
   - `components/Quotations.tsx:18-121`: Exibe tabela de cotações consumindo `GET /api/purchasing/quotes`.
   - `components/QuotationComparator.tsx:66-150`: Parser inteligente de cotações com regex e índice de similaridade Jaccard (`productSimilarity`).
   - `components/SuppliersManager.tsx:30-65`: Gerenciador de fornecedores consumindo `GET /api/purchasing/suppliers` e salvando em `POST /api/purchasing/suppliers/update`.
   - `components/ProductShortages.tsx:1-200`: Gestão de faltas de produtos.
   - `components/PurchaseCalendar.tsx:1-150`: Calendário de compras com curva ABC e giro diário.
3. **Serviços Existentes de Baileys WhatsApp no Backend**:
   - `backend/baileys-service.js:12-15`: Instância principal do WhatsApp com sessão salva em `backend/baileys-session` (ou `data/baileys-session`), utilizada para conferência de PIX e chat de vendas.
   - `backend/baileys-secondary-service.js:12-15`: Instância secundária com sessão em `backend/baileys-session-secondary`, utilizada para impressão de etiquetas e disparos em grupos.
   - `backend/server.js:4364-4530`: Registra endpoints REST para status, QR code, reconexão e disparos das duas instâncias existentes.
   - `backend/purchasing-endpoints.js:376-408`: Atualmente usa `baileysSecondaryService.sendTextToGroup()` para envio direto de cotações sem fila prévia de aprovação obrigatória.

---

## 2. Logic Chain
1. **Unificação na Interface Web**: Como a aplicação já possui componentes isolados de faltas, cotações, fornecedores e histórico, a criação de uma visão única `'central-compras'` (`CentralCompras.tsx`) no `Sidebar.tsx` e `App.tsx` organizará todas as 7 subseções em um painel coeso com navegação por abas (*pills*), atendendo integralmente ao requisito R5.
2. **Garantia de Não Bloqueio e Segurança no WhatsApp**: Os serviços existentes (`baileys-service` e `baileys-secondary-service`) atendem ao fluxo de clientes de balcão e robôs promocionais. O atendimento comercial a distribuidoras e representantes envolve cotações de preços sensíveis e listas de produtos em massa. Portanto, a criação do módulo isolado `baileys-compras-service.js` com pasta `baileys-session-compras` garante que nenhuma mensagem de compras interfira no chatbot de atendimento aos clientes de varejo e vice-versa (requisito R2).
3. **Fila de Aprovação com Alerta Duplo**: A regra estrita de não enviar mensagens a destinatários externos sem consentimento humano prévio (R4) requer que o botão de gerar cotação/pedido não invoque o Baileys diretamente, mas sim grave um registro na tabela `compras_fila_aprovacao` com status `pendente`, disparando simultaneamente um badge no painel web e um alerta resumido com link de autorização rápida no WhatsApp dos administradores.

---

## 3. Caveats
- O emparelhamento do QR Code do WhatsApp Comercial de Compras depende de um número/chip de WhatsApp exclusivo dedicado às compras e representantes da farmácia.
- Para a varredura e extração de catálogos e ofertas a partir de imagens/PDFs recebidos no WhatsApp Comercial, é necessária a integração com o serviço de IA (`callAI` via Gemini ou OpenAI) para conversão em dados estruturados.

---

## 4. Conclusion
A arquitetura do Frontend Web e dos serviços Baileys está totalmente mapeada e estruturada para receber a **Central de Compras**:
1. **Frontend**: Criação do componente `components/CentralCompras.tsx` unificando as 7 subseções com sub-abas, integrado à `Sidebar.tsx` e `App.tsx`.
2. **Backend WhatsApp**: Criação de `backend/baileys-compras-service.js` com pasta de sessão `baileys-session-compras` e isolamento total.
3. **Fila de Aprovação**: Criação da tabela `compras_fila_aprovacao` e endpoints de controle humano com alerta duplo no painel e no WhatsApp ADM.

---

## 5. Verification Method
1. **Frontend Build & Tipos**:
   - Executar `npm run build` na raiz do projeto para validar que as novas tipagens `View`, componentes e rotas compilam sem erros no Vite/TypeScript.
2. **Inspeção de Código e Layout**:
   - Verificar se `Sidebar.tsx` contém o item `'central-compras'` e badge de pendências.
   - Verificar conformidade com a regra de layout mobile em `MobileHeader.tsx`.
   - Garantir que nenhum `alert()` nativo foi introduzido.
3. **Testes de Endpoints Baileys**:
   - Testar chamadas HTTP `GET /api/purchasing/whatsapp/status` e `GET /api/purchasing/whatsapp/qrcode`.
   - Testar o ciclo de vida de aprovação via `GET /api/purchasing/approval/pending` e `POST /api/purchasing/approval/approve/:id`.
