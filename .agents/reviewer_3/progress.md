# Progress — Reviewer 3

Last visited: 2026-09-04T00:01:00Z
Status: All defects resolved; 24/24 tests passing; build successful; ready for push and final adversarial report.

## Summary of Fixes:
1. **Fatal Functional Bug**: Fixed variable scope of `estItem` in `recalcularOfertasMineradas` by hoisting to loop scope and preventing `ReferenceError: estItem is not defined` when fallback to `compras_estoque_cache` is triggered.
2. **Loss of Unit Price on Bonified / Sample Invoices**: Fixed `calcularPrecoUnitarioReal` to handle `prCompra <= 0` with `ultFrac > 0`, properly calculating `precoUnitario = frac` and `precoTotal = precoUnitario * emb`.
3. **Inconsistent Status in `listarOportunidades`**: Derived dynamic `statusEfetivo` (`Aprovado_Radar` vs `Descartado_Preco_Maior`) based on the newly enriched unit price from cache.
4. **Duplicate UI Text in Modal and Tooltip**: Stripped redundant `"Embalagem:"` prefix in `ComprasMineracao.tsx` preventing duplicate `📦 Embalagem: Embalagem:` text.
5. **Lookup Resolution in `buscarUltimaCompraProduto`**: Allowed exact description lookup in cache even when non-matching `produto_id` or `ean` was provided.
6. **Cross-wiring Prevention in `recalcularOfertasMineradas`**: Restricted fuzzy term matching only to unlinked opportunities without `produto_id` or `ean`.
7. **Expanded Test Suite**: Added 5 new automated adversarial tests (total 24/24 passing).
