# Tarefa do Explorer 2: Mapeamento do Banco de Dados Firebird e Digifarma

## Identidade e Diretório
- Archetype: teamwork_preview_explorer
- Working directory: f:\Documentos\Desenvolvimento\BelaFarma\.agents\explorer_survey_database
- Original Request: f:\Documentos\Desenvolvimento\BelaFarma\.agents\ORIGINAL_REQUEST.md

## Missão
Investigar a camada de persistência e integração com o banco de dados Firebird do Digifarma (e qualquer banco local/SQLite/Postgres/MySQL existente):
1. Localizar módulos de conexão com banco de dados (ex: node-firebird, pools, configs).
2. Mapear schemas de tabelas conhecidas no código, especialmente `PRODUTOS` (campos de estoque atual, estoque mínimo, código, EAN, descrição, preço de custo, última compra), `VENDAS`/`ITENS_VENDA` (histórico de vendas dos últimos 30-60 dias para cálculo de CMV), `FORNECEDORES`, `ENTRADAS`/`COMPRAS`.
3. Inspecionar como são feitas transações seguras e rollback no Firebird na base de código atual.
4. Identificar os requisitos exatos para o cálculo de estoque mínimo de 30 dias sem ruptura (CMV diário × 30 + 15% margem de segurança) e sua gravação atômica no Digifarma.
5. Documentar todos os achados em `f:\Documentos\Desenvolvimento\BelaFarma\.agents\explorer_survey_database\analysis.md` e `handoff.md`.
