# Dispatch Log

## 2026-09-03T23:00:00Z

Você é o orquestrador SWE Light (teamwork_preview_swe), instância swe_1.

Seu diretório de trabalho exclusivo é:
f:\Documentos\Desenvolvimento\BelaFarma\.agents\swe_1

O arquivo oficial com a requisição completa do usuário é:
f:\Documentos\Desenvolvimento\BelaFarma\.agents\ORIGINAL_REQUEST.md
(Consulte especificamente a seção "## Follow-up — 2026-09-03T22:59:08Z")

MISSÃO:
Correção definitiva da coleta e cálculo da informação de "Última Compra" na guia Mineração (Central de Compras), eliminando qualquer divergência com o banco de dados do Digifarma (Firebird).

REQUISITOS ESSENCIAIS:
1. R1. Extração Fiel da Última Compra via Notas Fiscais de Entrada (Firebird):
   - Fonte primária: última nota fiscal de entrada emitida nas tabelas do Digifarma (`CAB_NOTAS` + `ITEM_NOTAS` + `FORNECEDORES`), onde `C.ENTRADA_SAIDA = 'E'` e `C.CANCELAMENTO = 'N'`, ordenada por `C.DATA_EMISSAO DESC`.
   - Preço unitário real: se `ITEM_NOTAS_EMBALAGEM > 1`, calcular o preço unitário dividindo `ITEM_NOTAS_PRCOMPRA` por `ITEM_NOTAS_EMBALAGEM` (ou utilizar `ITEM_NOTAS_ULT_COMPRA` quando este refletir o valor unitário fracionado).
   - Metadados: `DATA_EMISSAO`, `NOTA_FISCAL`, `FORNECEDOR` e `ITEM_NOTAS_EMBALAGEM`.
   - Fallback estrito: `PRODUTOS.VALOR_ULT_COMPRA` ou `PRODUTOS.PROD_PRCOMPRA` somente se o produto nunca teve NF de entrada.
2. R2. Sincronização Híbrida e Cache Local de Últimas Compras (SQLite):
   - Criar/otimizar tabela de cache indexada no SQLite com campos: `produto_id`, `ean`, `preco_unitario_ult_compra`, `data_compra`, `fornecedor_nome`, `numero_nota_fiscal`, `embalagem`, `atualizado_em`.
   - Endpoint e rotina em lote: `POST /api/central-compras/sincronizar-ultimas-compras`.
   - Busca em < 5ms durante mineração e carregamento de tela.
3. R3. Recálculo Automático das Oportunidades Existentes:
   - Endpoint/rotina: `POST /api/central-compras/recalcular-ofertas-mineradas`.
   - Atualizar `preco_ult_compra_digifarma`, `ultimo_fornecedor`, `data_ult_compra`, `nota_fiscal_ult_compra`, `percentual_desconto` e `status` (`Aprovado_Radar` ou `Descartado_Preco_Maior`).
4. R4. Interface Visual Rica na Guia Mineração (`ComprasMineracao.tsx`):
   - Exibir valor unitário da última compra em R$ (ex: `R$ 3,24/un`).
   - Tooltip/card ao passar o mouse ou clicar com data, fornecedor, número da NF e detalhe da embalagem (ex: `Embalagem: Caixa c/ 12 unidades (R$ 38,88 total)`).
   - Botão rápido "Sincronizar Últimas Compras do Digifarma" com feedback visual e toast (sem `alert()`).

CRITÉRIOS DE ACEITE:
- Produto `AP.BARB VICEROY LADY CARE C/2 12UND` (ID 188549) e similares em embalagens coletivas calculado como R$ 3,24 (e não R$ 38,88).
- Produtos com NF recente usam dados exatos da NF de entrada mais recente.
- Desconto/economia reflete a comparação exata unitária.
- `/api/central-compras/oportunidades` responde em < 100ms via cache local.
- Build do frontend compila sem erros (`npm run build`).
- Testes automatizados cobrindo a integridade dos cálculos, endpoints e comportamento do cache.

REGRAS:
- Mantenha `plan.md` e `progress.md` atualizados em seu diretório de trabalho `f:\Documentos\Desenvolvimento\BelaFarma\.agents\swe_1`.
- Execute a suíte de testes para garantir a integridade.
- Repositório oficial é GitHub `origin/main`. Realizar `git push origin main` ao finalizar.
- Não usar `alert()` em produção.
- Ao concluir, emita seu relatório de conclusão para auditoria de vitória.
