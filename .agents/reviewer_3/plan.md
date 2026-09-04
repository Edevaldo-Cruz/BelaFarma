# Plano de Revisão Adversarial — Round 3 (teamwork_preview_reviewer)

## 1. Missão e Requisitos
Revisão adversarial rigorosa e independente da missão de cálculo e coleta de Última Compra do Digifarma (Firebird -> SQLite) na guia Mineração da Central de Compras (R1, R2, R3, R4).

## 2. Hipóteses Adversariais Testadas
- [x] H1: Escopo de variáveis em `recalcularOfertasMineradas` quando produto não está em `digifarma_ultimas_compras_cache` e cai em `compras_estoque_cache`.
- [x] H2: Comportamento de `calcularPrecoUnitarioReal` com compras bonificadas ou amostras (`prCompra <= 0` e `ultFrac > 0`).
- [x] H3: Consistência do `status` retornado por `listarOportunidades` após sobreposição pelo cache unitário.
- [x] H4: Renderização de embalagem no modal de detalhes da guia Mineração (duplicação de texto "Embalagem: Embalagem:").
- [x] H5: Resolução no cache por descrição em `buscarUltimaCompraProduto` quando ID passado é inexistente/desatualizado.

## 3. Plano de Correção e Validação
1. Corrigir escopo de `estItem` em `recalcularOfertasMineradas` (`compras-mineracao.service.js`).
2. Ajustar `calcularPrecoUnitarioReal` para considerar `ultFrac` quando `prCompra <= 0` e preservar cálculo do total.
3. Atualizar `status` dinâmico em `listarOportunidades` para refletir `Aprovado_Radar` vs `Descartado_Preco_Maior` após sobreposição pelo cache.
4. Normalizar prefixo de embalagem no modal de detalhes em `ComprasMineracao.tsx`.
5. Permitir busca por descrição exata no cache em `buscarUltimaCompraProduto` caso `pId`/`pEan` não encontre item.
6. Expandir a suíte de testes em `backend/test_ultimas_compras_mineracao.js` para cobrir todos os 5 cenários identificados.
7. Executar suítes de teste completas e rebuild do Vite (`npm run build`).
8. Commit e push para `origin/main`.
