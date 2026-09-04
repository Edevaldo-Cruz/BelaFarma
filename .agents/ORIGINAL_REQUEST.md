# Original User Request

## Initial Request — 2026-08-29T17:05:56Z

Você é o Orquestrador Geral (Project Orchestrator) responsável por planejar, coordenar especialistas e implementar o módulo completo "Central de Compras" na plataforma BelaFarma.

## Localização e Contexto
- Diretório de Trabalho do Orquestrador: f:\Documentos\Desenvolvimento\BelaFarma\.agents\orchestrator_3
- Diretório do Projeto: f:\Documentos\Desenvolvimento\BelaFarma
- Arquivo de Requisitos Original: f:\Documentos\Desenvolvimento\BelaFarma\.agents\ORIGINAL_REQUEST.md

## Missão
Construir o módulo autônomo e unificado "Central de Compras" na plataforma BelaFarma, integrando inteligência de estoque para 30 dias sem ruptura (com gravação no Digifarma), gestão de instância isolada Baileys para o WhatsApp Comercial de compras, mineração de ofertas e histórico de representantes, algoritmo ponderado de ranking/cotações com bonificações e pedido mínimo, gestão de quebras, controle orçamentário e fluxo estrito de aprovação humana prévia para comunicações externas via WhatsApp.

## Requisitos Detalhados

### R1. Controle de Estoque, Estoque Mínimo para 30 Dias e Sincronização Digifarma
- Calcular o estoque mínimo necessário para 30 dias de operação sem ruptura para cada produto ativo, utilizando a média ponderada de vendas dos últimos 30 a 60 dias (CMV diário × 30 dias) acrescida de margem de segurança configurável (padrão +15%).
- Gravar o valor calculado de estoque mínimo diretamente no banco de dados Firebird do Digifarma (campo de estoque mínimo da tabela `PRODUTOS`) com transações seguras e tratamento de rollback em caso de falha.
- Monitorar e sinalizar em tempo real produtos com ruptura (estoque zero) e produtos com estoque abaixo do mínimo calculado.

### R2. Instância Isolada Baileys WhatsApp Comercial de Compras e Mineração Histórica
- Implementar serviço de WhatsApp isolado (`baileys-compras-service.js` ou equivalente) com diretório de sessão próprio (`baileys-session-compras`), pareamento via QR Code na interface e reconexão automática resiliente.
- Varrer histórico de conversas antigas da instância comercial para extrair e cadastrar automaticamente:
  1. Representantes e suas respectivas distribuidoras/laboratórios;
  2. Prazos médios e formas de pagamento negociadas (ex: 28/35/42 dias, à vista, etc.);
  3. Valores e condições de Pedido Mínimo de cada distribuidora;
  4. Histórico e catálogo de categorias/produtos fornecidos por cada vendedor.
- Indexar continuamente novas oportunidades e ofertas recebidas nas conversas do WhatsApp comercial, cruzando-as com a lista de faltas e produtos abaixo do mínimo, garantindo que o preço ofertado seja inferior ao preço da última compra registrada no Digifarma.

### R3. Motor de Cotações Inteligentes, Ranking Ponderado e Otimização de Pedido Mínimo
- Reconhecer automaticamente quais fornecedores atendem determinado produto faltante ou com estoque baixo.
- Redigir mensagens contextualizadas e profissionais de solicitação de cotação para os fornecedores adequados, respeitando o histórico de produtos de cada um.
- Comparar respostas de cotação recebidas (texto, tabelas ou imagens) aplicando algoritmo de Score Ponderado:
  - Menor Preço Líquido (descontando bonificações e descontos adicionais): peso 60%;
  - Prazo de Pagamento e compatibilidade com o Orçamento Mensal: peso 25%;
  - Histórico de pontualidade e baixa taxa de quebra: peso 15%.
- Implementar Otimização Automática de Pedido Mínimo: se a seleção dos itens mais baratos de um fornecedor não atingir o valor mínimo de faturamento, o bot deve simular preenchimento com outros itens necessários daquele fornecedor ou realocar para o 2º melhor colocado global, calculando e exibindo o custo-benefício total.
- Gerenciar quebras e ausência de resposta: caso o fornecedor vencedor não responda no tempo limite ou informe falta de estoque, passar a vez automaticamente para o segundo colocado.

### R4. Fila de Aprovação Obrigatória com Alerta Duplo (Web & WhatsApp ADM)
- Nenhuma mensagem pode ser enviada a destinatários externos no WhatsApp sem aprovação humana expressa.
- Disponibilizar na interface web uma "Fila de Mensagens Pendentes de Aprovação" onde o administrador pode revisar o texto, os itens da cotação/pedido, editar valores se necessário e clicar em "Aprovar e Enviar" ou "Rejeitar".
- Disparar notificação imediata no WhatsApp dos Administradores com o resumo do que o bot preparou e link de ação rápida para autorizar a operação.

### R5. Elaboração de Pedidos de Compra, Controle Orçamentário e Interface Unificada "Central de Compras"
- Elaborar espelhos formais de Pedidos de Compra organizados por distribuidora vencedora, contendo código do produto, EAN, descrição, quantidade sugerida, preço unitário acordado, bonificações aplicadas, condição de pagamento e previsão de entrega.
- Integrar a projeção de gastos dos pedidos com o teto do Orçamento Mensal da farmácia e datas de vencimento dos boletos no fluxo de Contas a Pagar.
- Criar a nova guia "Central de Compras" no menu lateral do sistema web, unificando:
  1. Visão Geral / Dashboard de Estoque Mínimo e Faltas;
  2. Mineração de Oportunidades & Histórico de Conversas;
  3. Central de Cotações, Comparador e Ranking de Fornecedores;
  4. Fila de Aprovação de Mensagens e Notificações;
  5. Painel de Pedidos de Compra e Controle Orçamentário;
  6. Cadastro e Gestão de Representantes e Distribuidoras;
  7. Conexão do WhatsApp Comercial (QR Code e Status).

## Regras Importantes do Projeto
- Não usar alert() em produção (usar toast ou modal).
- Servidor de produção é Raspberry Pi 4 (VPS local 192.168.1.70), com banco Firebird Digifarma e backend Node.js / frontend React.
- Mantenha `plan.md` e `progress.md` atualizados no seu diretório de trabalho.
- Crie suíte abrangente de testes automatizados e execute todos os testes para validar o funcionamento antes de declarar vitória.

## Follow-up — 2026-09-03T22:59:08Z

This is a single self-contained fix; keep it small and focused.

Correção definitiva da coleta e cálculo da informação de "Última Compra" na guia Mineração (Central de Compras), eliminando qualquer divergência com o banco de dados do Digifarma (Firebird).

Working directory: f:\Documentos\Desenvolvimento\BelaFarma
Integrity mode: development

## Requirements

### R1. Extração Fiel da Última Compra via Notas Fiscais de Entrada (Firebird)
- A fonte primária da verdade para o preço e data da última compra de qualquer produto deve ser a **última nota fiscal de entrada emitida** nas tabelas do Digifarma (`CAB_NOTAS` + `ITEM_NOTAS` + `FORNECEDORES`), onde `C.ENTRADA_SAIDA = 'E'` e `C.CANCELAMENTO = 'N'`, ordenada por `C.DATA_EMISSAO DESC`.
- O valor unitário da última compra deve considerar o preço unitário real:
  - Se `ITEM_NOTAS_EMBALAGEM > 1`, calcular o preço unitário dividindo `ITEM_NOTAS_PRCOMPRA` por `ITEM_NOTAS_EMBALAGEM` (ou utilizar `ITEM_NOTAS_ULT_COMPRA` quando este refletir o valor unitário fracionado).
  - Capturar também os metadados da compra: `DATA_EMISSAO`, `NOTA_FISCAL`, `FORNECEDOR` e `ITEM_NOTAS_EMBALAGEM`.
- O campo `PRODUTOS.VALOR_ULT_COMPRA` ou `PRODUTOS.PROD_PRCOMPRA` deve ser utilizado estritamente como fallback se o produto nunca tiver tido nenhuma nota fiscal de entrada no sistema.

### R2. Sincronização Híbrida e Cache Local de Últimas Compras (SQLite)
- Criar/otimizar tabela de cache indexada no SQLite (ex: `digifarma_ultimas_compras_cache` ou colunas correspondentes em `compras_estoque_cache`) contendo `produto_id`, `ean`, `preco_unitario_ult_compra`, `data_compra`, `fornecedor_nome`, `numero_nota_fiscal`, `embalagem` e `atualizado_em`.
- Implementar rotina de sincronização em lote de alta performance das últimas entradas, além de endpoint para sincronização instantânea sob demanda via botão na interface (`POST /api/central-compras/sincronizar-ultimas-compras`).
- Garantir que a busca de última compra durante a mineração e na abertura da tela execute em `< 5ms`, com tolerância a quedas ou oscilações de rede com o Firebird.

### R3. Recálculo Automático das Oportunidades Existentes
- Disponibilizar rotina/endpoint (`POST /api/central-compras/recalcular-ofertas-mineradas`) que varre todas as oportunidades gravadas na tabela `compras_oportunidades_mineradas` e atualiza seus campos de última compra com os dados exatos do Digifarma:
  - `preco_ult_compra_digifarma`
  - `ultimo_fornecedor`
  - `data_ult_compra`
  - `nota_fiscal_ult_compra`
  - `percentual_desconto` recalculado: `((preco_ult_compra - preco_ofertado) / preco_ult_compra) * 100`
  - `status`: marcar `Aprovado_Radar` quando o preço ofertado for inferior ao histórico do Digifarma, ou `Descartado_Preco_Maior` quando não compensar.

### R4. Interface Visual Rica na Guia Mineração (`ComprasMineracao.tsx`)
- Na tabela de Mineração, exibir em destaque o valor unitário da última compra em R$ (ex: `R$ 3,24/un`).
- Ao passar o mouse ou clicar (tooltip/card de auditoria), exibir os metadados completos da compra no Digifarma:
  - Data da compra formatada (ex: `02/09/2026`)
  - Fornecedor / Distribuidora da nota (ex: `SOTON FARMA LTDA`)
  - Número da Nota Fiscal (ex: `NF 594906`)
  - Detalhe da embalagem de compra (ex: `Embalagem: Caixa c/ 12 unidades (R$ 38,88 total)`)
- Adicionar botão de ação rápida no topo: `Sincronizar Últimas Compras do Digifarma` com feedback visual de progresso e toast.

## Acceptance Criteria

### Integridade do Cálculo
- [ ] O valor de última compra do produto `AP.BARB VICEROY LADY CARE C/2 12UND` (ID 188549) e similares em embalagens coletivas é calculado como R$ 3,24 (e não R$ 38,88).
- [ ] Produtos com nota fiscal recente utilizam os dados exatos da NF de entrada mais recente em vez de valores defasados da tabela `PRODUTOS`.
- [ ] O percentual de desconto e economia das ofertas na Guia Mineração reflete a comparação exata entre o preço ofertado por unidade e o valor unitário da última nota fiscal.

### Performance e Disponibilidade
- [ ] A consulta de oportunidades na rota `/api/central-compras/oportunidades` responde em menos de 100ms utilizando o cache local sincronizado.
- [ ] A rotina de sincronização manual atualiza os registros do cache SQLite e recalcula as ofertas mineradas com sucesso.

### Interface do Usuário
- [ ] O tooltip/popover na coluna "Última Compra" exibe data, fornecedor, número da NF e embalagem quando disponíveis.
- [ ] A tela de Mineração compila sem erros no Vite (`npm run build`).

## Regras Obrigatórias do Repositório BelaFarma
- Repositório Principal: O repositório oficial é o GitHub (`origin/main`).
- Ao finalizar tarefas e commits, realizar o `git push origin main` para manter o GitHub sempre atualizado.
- O servidor de deploy foi alterado; portanto, não sugerir nem executar deploys automáticos no servidor anterior, apenas garantir o envio das atualizações para o GitHub.
- Não utilizar `alert()` em produção. O uso de `alert()` é permitido somente para fins de teste e deve ser substituído pelos componentes de toast ou modal antes de um deploy.

## 2026-09-04T12:09:33Z

Criar um motor de busca e inteligência de estoque de medicamentos para a BelaFarma com foco em backend de alta performance, unificando na tabela compras_estoque_cache (SQLite) todos os dados de estoque atual, preço de venda vigente (promocional ativo ou preço normal), histórico e detalhes de última compra, cálculo de reposição para 30 dias de cobertura sem ruptura (Estoque Mínimo) e Estoque Máximo igual ao dobro do mínimo (2x mínimo). O motor deve sincronizar de forma agendada com o Digifarma (2 vezes ao dia: início da manhã e fim de tarde), operar com resiliência total via cache local quando o Firebird estiver indisponível, e atuar como a fonte única de verdade para alimentar e notificar o Agente Horácio (proativamente em rupturas e reativamente na análise de cotações).

Working directory: f:\Documentos\Desenvolvimento\BelaFarma
Integrity mode: development

## Requirements

### R1. Modelo de Dados Consolidado (compras_estoque_cache)
- Consolidar na tabela compras_estoque_cache do banco SQLite (backend/belafarma.db) todos os campos essenciais por produto em uma única linha indexada:
  - Identificação: produto_id (PK), ean, descricao, apresentacao, categoria_id, curva_abc.
  - Estoque: saldo (estoque atual disponível em loja).
  - Preço de Venda: preco_venda_vigente (resolvido automaticamente: preço promocional se estiver dentro do período de vigência ativo, caso contrário preço de venda normal), preco_normal, preco_promocional, inicio_promocao, termino_promocao.
  - Última Compra: preco_unitario_ult_compra (ultima_compra_valor), ultima_compra_fornecedor, ultima_compra_data, ultima_compra_nf.
  - Reposição & Consumo: vmd_ponderado, vendas_30d, vendas_31_60d, vendas_61_90d, ciclo_vida, est_minimo_calculado (30 dias sem ruptura), est_maximo_calculado (2x mínimo), qtd_sugerida_compra (defasagem para 30 dias), status_ruptura (RUPTURA, ABAIXO_MINIMO, NORMAL, EXCESSO).
  - Índices em ean, descricao, curva_abc e status_ruptura garantindo buscas ultrarrápidas (< 10ms).

### R2. Regras de Inteligência de Estoque (30 Dias Sem Ruptura & Dobro no Máximo)
- Calcular a Venda Média Diária Ponderada (VMD_P) a partir do histórico de vendas recente (30d, 60d, 90d) acrescida de margem de segurança configurável (padrão 15%).
- Estoque Mínimo (est_minimo_calculado): quantidade necessária para suprir 30 dias de giro da loja sem rupturas (Math.ceil(VMD_P * 30 * (1 + margem/100))).
- Estoque Máximo (est_maximo_calculado): calculado rigorosamente como exatamente o dobro do estoque mínimo (est_minimo_calculado * 2).
- Quantidade Sugerida de Compra: Math.max(0, est_minimo_calculado - saldo).
- Classificação do Status: RUPTURA (saldo <= 0), ABAIXO_MINIMO (0 < saldo < mínimo), NORMAL (mínimo <= saldo <= máximo), EXCESSO (saldo > máximo).

### R3. Sincronização Agendada (2x ao Dia) e Resiliência Local
- Serviço de sincronização configurado para rodar 2 vezes ao dia de forma agendada (ex: 07h30 e 17h30), além de expor endpoint manual /api/medicamentos/sincronizar para disparo sob demanda.
- Extrair em lote do Digifarma (Firebird): catálogo de produtos ativos, vendas dos períodos, preços promocionais e normais vigentes, e dados das últimas notas de entrada.
- Operação resiliente com fallback total: se o Firebird/Digifarma estiver inacessível, offline ou com timeout, o motor e a busca continuam operando 100% via SQLite local sem degradação ou interrupção.

### R4. Motor de Busca de Medicamentos (Serviço & Endpoints REST)
- Criar serviço centralizado com busca instantânea retornando o objeto unificado completo do medicamento.
- Suporte a busca flexível por termo/nome, fragmento, EAN/código de barras, ou ID Digifarma.
- Endpoints REST:
  - GET /api/medicamentos/busca?q={termo}&status={status}&curva={curva}&limit={limite}: busca rápida e paginada/filtrada.
  - GET /api/medicamentos/:id: detalhe consolidado de um medicamento específico.
  - GET /api/medicamentos/rupturas: listagem direta dos itens em ruptura ou abaixo do mínimo com quantidade necessária para 30 dias.

### R5. Alimentação e Notificação do Agente Horácio
- Fluxo Proativo: Ao concluir a sincronização diária, o motor compila os itens críticos em ruptura ou abaixo do mínimo e aciona o Agente Horácio (horacio-agent.service.js) para gerar o relatório executivo de compras do dia com sugestões de compra para 30 dias.
- Fluxo Reativo: Atualizar o Agente Horácio e o serviço de mineração (compras-mineracao.service.js) para utilizar o motor de busca unificado como fonte única de verdade para validação instantânea de preços e estoque em cotações e ofertas do WhatsApp.

## Verification Resources
- Suíte de testes automatizados existente: backend/test_compras_estoque.js, backend/test_ultimas_compras_mineracao.js.
- Nova suíte de testes de ponta a ponta: backend/test_motor_busca_medicamentos.js cobrindo schema, cálculo de 30d/60d, preços vigentes, velocidade de busca e integração com o Horácio.

## Acceptance Criteria

### Schema e Dados Consolidados
- [ ] A tabela compras_estoque_cache contém todas as colunas especificadas (incluindo preco_venda_vigente, preco_promocional, preco_normal, ultima_compra_fornecedor, ultima_compra_data, ultima_compra_nf, est_minimo_calculado, est_maximo_calculado).
- [ ] Consultas por ID, EAN ou termo LIKE executam em menos de 10ms utilizando os índices SQLite.

### Inteligência e Regras de Reposição
- [ ] Para qualquer produto com giro, o Estoque Mínimo reflete exatamente a projeção de 30 dias de consumo com a margem de segurança.
- [ ] O Estoque Máximo é exatamente igual a 2x o Estoque Mínimo (est_maximo_calculado == est_minimo_calculado * 2).
- [ ] Para produto com saldo menor que o mínimo, a quantidade necessária para 30 dias é calculada como est_minimo_calculado - saldo.
- [ ] Produtos com saldo zerado ou negativo são marcados com status RUPTURA.

### Regra de Preço de Venda Vigente
- [ ] Se o produto possui promoção ativa e a data/hora atual está entre inicio_promocao e termino_promocao, preco_venda_vigente é igual ao preço promocional.
- [ ] Se a promoção estiver expirada ou inexistente, preco_venda_vigente é igual ao preço normal de venda.

### Sincronização e Resiliência
- [ ] A sincronização pode ser disparada manualmente via endpoint e está agendada para 2x ao dia.
- [ ] Quando o Firebird está desconectado/simulado como offline, o motor de busca e as rotas de API continuam respondendo com dados do cache local sem lançar erro 500.

### Integração com Agente Horácio
- [ ] O Horácio consome o motor unificado sem depender de queries diretas ao Firebird para verificar saldo ou preço de compra.
- [ ] Relatório executivo de compras é gerado com os itens identificados em ruptura/abaixo do mínimo com necessidade de 30 dias calculada.

### Testes Automatizados
- [ ] O comando node backend/test_motor_busca_medicamentos.js executa e passa 100% de todos os testes unitários e de integração sem falhas.

