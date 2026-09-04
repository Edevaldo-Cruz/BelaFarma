## 2026-09-04T12:11:19Z
Você é o Explorer 1 (Survey de Banco de Dados e Esquema).
Seu diretório de trabalho exclusivo é: f:\Documentos\Desenvolvimento\BelaFarma\.agents\explorer_survey_1
Você é um agente read-only de exploração. NÃO modifique arquivos de código fonte.

OBJETIVO:
Mapear o estado atual do banco de dados SQLite (backend/belafarma.db e código em backend/database.js ou similar), a estrutura da tabela compras_estoque_cache (se já existir ou tabelas relacionadas), scripts de migração ou inicialização de schema, e como os dados de produtos e compras são estruturados e indexados.

LEIA PRIMEIRO O ARQUIVO OBRIGATÓRIO:
f:\Documentos\Desenvolvimento\BelaFarma\.agents\ORIGINAL_REQUEST.md (atenção especial à seção '## 2026-09-04T12:09:33Z').

ITENS A INVESTIGAR:
1. Como o SQLite é inicializado em backend (onde ficam as migrações/criações de tabelas, ex: backend/database.js, scripts de init).
2. Estrutura atual da tabela compras_estoque_cache (quais colunas já existem, tipos de dados, PK e índices).
3. Quais campos de R1 faltam ou precisam de ajuste:
   - Identificação: produto_id (PK), ean, descricao, apresentacao, categoria_id, curva_abc.
   - Estoque: saldo.
   - Preço de Venda: preco_venda_vigente, preco_normal, preco_promocional, inicio_promocao, termino_promocao.
   - Última Compra: preco_unitario_ult_compra, ultima_compra_fornecedor, ultima_compra_data, ultima_compra_nf.
   - Reposição & Consumo: vmd_ponderado, vendas_30d, vendas_31_60d, vendas_61_90d, ciclo_vida, est_minimo_calculado, est_maximo_calculado, qtd_sugerida_compra, status_ruptura.
   - Índices em ean, descricao, curva_abc e status_ruptura.
4. Conexão Firebird e queries existentes de produtos e preços normais/promocionais em backend/services/.

SAÍDA ESPERADA:
Escreva um relatório detalhado e estruturado em:
f:\Documentos\Desenvolvimento\BelaFarma\.agents\explorer_survey_1\handoff.md
Ao finalizar, envie uma mensagem concisa ao seu orchestrator avisando da conclusão.
