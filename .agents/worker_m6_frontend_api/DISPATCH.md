## 2026-08-29T17:25:43Z
Missão recebida:
Implementar a Interface Web React unificada "Central de Compras" (com as 7 subseções) e a camada de Endpoints REST no backend.

1. Implementar backend/compras-endpoints.js e plugar no backend/server.js cobrindo todos os endpoints REST de /api/central-compras.
2. Atualizar types.ts (adicionar 'central-compras' ao tipo View), components/Sidebar.tsx e App.tsx.
3. Implementar components/CentralCompras.tsx e os 7 subcomponentes sob components/compras/:
   - ComprasDashboard.tsx
   - ComprasMineracao.tsx
   - ComprasCotacoes.tsx
   - ComprasAprovacaoFila.tsx
   - ComprasPedidosPainel.tsx
   - ComprasRepresentantes.tsx
   - ComprasWhatsAppConexao.tsx
4. Garantir ZERO uso de alert() (usar useToast() ou modais) e aderência ao layout mobile do cabeçalho.
5. Executar npm run build e validar que não há erros de tipagem ou compilação.
6. Gravar f:\Documentos\Desenvolvimento\BelaFarma\.agents\worker_m6_frontend_api\handoff.md e enviar mensagem de conclusão.
