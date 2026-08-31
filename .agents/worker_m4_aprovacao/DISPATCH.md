# Tarefa: Worker M4 - Fila de Aprovação Obrigatória Human-in-the-Loop & Alerta Duplo

## 2026-08-29T17:21:00Z
- Archetype: teamwork_preview_worker
- Roles: implementer, qa, specialist
- Working directory: f:\Documentos\Desenvolvimento\BelaFarma\.agents\worker_m4_aprovacao
- Original Request: f:\Documentos\Desenvolvimento\BelaFarma\.agents\ORIGINAL_REQUEST.md
- Project Scope: f:\Documentos\Desenvolvimento\BelaFarma\.agents\PROJECT.md

## MANDATORY INTEGRITY WARNING
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Missão
Implementar o serviço de Fila de Aprovação Obrigatória em `backend/services/compras-aprovacao.service.js`:
1. **Requisitos de M4 (R4 / F11, F12)**:
   - Regra estrita de segurança: NENHUMA mensagem pode ser enviada a destinatários externos no WhatsApp sem aprovação humana expressa.
   - Gerenciamento completo da tabela `compras_fila_aprovacao` no SQLite (`backend/database.js`):
     * Enfileiramento de solicitações de cotação, respostas de cotação, pedidos de compra formais ou mensagens avulsas aos fornecedores com status inicial `pendente`.
     * Operação de Aprovação (`aprovarMensagem(approvalId, usuarioAprovador, textoModificado?)`): valida permissões, atualiza status para `aprovado` (ou `editado_enviado`) e invoca `enviarMensagemAprovada` do `baileys-compras-service.js`.
     * Operação de Rejeição (`rejeitarMensagem(approvalId, motivo, usuarioRejeitador)`): atualiza status para `rejeitado` e cancela qualquer envio.
     * Edição prévia de texto, produtos, quantidades e valores antes de autorizar o envio.
   - **Sistema de Alerta Duplo**:
     * 1. Badge e atualização em tempo real para a interface Web (notificações push / SSE ou polling na Central de Compras).
     * 2. Disparo de mensagem de notificação imediata no WhatsApp dos Administradores (`ADMIN_PHONE` / contatos com cargo admin) contendo o resumo da ação gerada pelo bot e um link de ação rápida para autorizar a operação diretamente pelo navegador.
2. **Propriedade de Arquivos**:
   - `backend/services/compras-aprovacao.service.js`
   - Integração com `backend/baileys-compras-service.js` e `backend/database.js`
3. **Verificação**:
   - Criar suíte de testes automatizados `backend/test_compras_m4.js` cobrindo o fluxo de enfileiramento, bloqueio de envios não autorizados, aprovação com edição, rejeição com motivo e simulação do alerta duplo.
   - Executar os testes e gravar relatório em `handoff.md`.
