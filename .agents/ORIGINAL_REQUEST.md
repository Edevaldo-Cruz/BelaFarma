# Original User Request

## Initial Request — 2026-08-12T13:47:18Z

# Teamwork Project Prompt

Implementar um sistema de auditoria interativa de WhatsApp onde conversas ociosas entram numa fila de "Revisão Pendente" no Painel (Dashboard). O atendente responderá a um questionário (pré-preenchido pela IA) para justificar se a conversa gerou venda ou os motivos da recusa de produtos, gerando métricas de crescimento e rejeição.

Working directory: f:\Documentos\Desenvolvimento\BelaFarma
Integrity mode: development

## Requirements

### R1. Fila de Revisão Automática (Backend/IA)
O serviço de plano de fundo (cron/IA) deve identificar quando uma conversa esfria/encerra. Em vez de apenas salvar ou descartar silenciosamente as vendas não fechadas, ele deve adicionar essas conversas a um status de "Revisão Pendente". A IA deve extrair automaticamente métricas da conversa: se é um cliente novo (com base no histórico do banco), a duração/frequência do chat e quais produtos foram discutidos.

### R2. Alerta e Fila no Painel (Frontend)
O Painel Web (Dashboard) deve exibir um alerta visual e uma lista de "Revisões Pendentes" (como uma caixa de entrada) para os atendentes. 

### R3. Questionário do Atendente (Frontend/Backend)
Ao clicar em uma revisão pendente, o atendente verá um modal perguntando "Gerou entrega?". 
- Se **Sim**, pode preencher/confirmar os dados da entrega. 
- Se **Não**, um questionário é exibido. O questionário já virá pré-preenchido pela IA com os produtos discutidos, e o atendente deverá confirmar quais produtos foram rejeitados e o motivo (ex: Preço, Falta de Estoque, Apenas Dúvida). O preenchimento remove o item da fila e salva os dados estruturados no banco de dados.

## Acceptance Criteria

### Backend & AI
- [ ] A IA do `whatsapp-delivery-service.js` consegue classificar um chat como pendente de revisão manual e extrai as métricas preliminares (novo cliente, tempo, produtos).
- [ ] O banco de dados SQLite é atualizado (novas tabelas ou colunas) para suportar o armazenamento de métricas de rejeição de produtos e status de revisão.

### Frontend
- [ ] O Painel possui uma área visível de notificações/pendências.
- [ ] O formulário/modal de revisão funciona corretamente e envia os dados para a API.
- [ ] Após a submissão, a conversa some da fila de pendências do painel.
