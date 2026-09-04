# Progress - Explorer 1 (Survey de Banco de Dados e Esquema)

- Status: Mapeamento concluído com sucesso; gerando handoff.md
- Last visited: 2026-09-04T12:14:30Z
- Etapa atual: Redação do relatório handoff.md e atualização do BRIEFING.md
- Principais Descobertas:
  1. SQLite ativo em `data/belafarma.db` gerenciado por `backend/database.js` com WAL ativado.
  2. `compras_estoque_cache` possui 64.537 registros no banco.
  3. Faltam 10 campos em `compras_estoque_cache` para conformidade total com R1 (`apresentacao`, `preco_venda_vigente`, `preco_normal`, `preco_promocional`, `inicio_promocao`, `termino_promocao`, `preco_unitario_ult_compra`, `ultima_compra_fornecedor`, `ultima_compra_data`, `ultima_compra_nf`, `qtd_sugerida_compra`).
  4. Índices em `ean`, `descricao`, `curva_abc` e `status_ruptura` já existem e entregam tempos < 2.5ms em base de 64k registros.
  5. Firebird mapeado via `digifarma.service.js` com pool de 10 conexões e circuit breaker de 20s.
  6. Regras de preço vigente mapeadas em `stock.service.js` e `digifarma-sync.service.js` com suporte a `INICIO_PROMOCAO` e `TERMINO_PROMOCAO`.
  7. Dados de última compra já mapeados em `digifarma_ultimas_compras_cache` (30.987 registros existentes) e queries de `CAB_NOTAS`/`ITEM_NOTAS` em `compras-mineracao.service.js`.
