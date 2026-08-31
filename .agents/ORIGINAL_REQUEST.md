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
