# Metodologia e Infraestrutura de Testes E2E Opaque-Box: Central de Compras BelaFarma

**Documento**: `TEST_INFRA.md`  
**Versão**: 1.0.0  
**Data**: 2026-08-29  
**Autor**: Test Writer E2E Track (teamwork_preview_test_writer)  
**Projeto**: BelaFarma — Central de Compras Autônoma e Integrada  
**Status**: APROVADO E PRONTO PARA EXECUÇÃO

---

## 1. Filosofia de Teste Opaque-Box e Garantia de Integridade

A suíte de testes da Central de Compras BelaFarma é regida pelo princípio de **Opaque-Box E2E Testing** (Testes de Caixa Opaca de Ponta a Ponta):
1. **Verificação Comportamental vs. Detalhe Interno**: Os testes exercitam a interface pública e os contratos de entrada e saída, validando resultados matemáticos, estados de persistência, regras de governança e restrições de negócio sem se acoplar a implementações voláteis.
2. **Oráculos Autorizados**: Cada assertiva possui um oráculo formal derivado explicitamente de `ORIGINAL_REQUEST.md` e `PROJECT.md`.
3. **Determinismo e Isolamento**: Cada caso de teste é autocontido, inicializa seu próprio estado em memória ou sandbox isolada e não gera efeitos colaterais em ambientes de produção.
4. **Tolerância Zero a Facades**: É terminantemente proibido o uso de testes vazios ou de passagem trivial. Toda asserção deve checar valores exatos, limites, condições de erro e transformações de estado.

---

## 2. Arquitetura em 4 Tiers

A matriz de testes está organizada em 4 Tiers concêntricos com contagem estrita de casos:

```
┌────────────────────────────────────────────────────────────────────────┐
│  Tier 4: Cenários Reais de Aplicação (5 fluxos operacionais completos) │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  Tier 3: Combinações Cross-Feature (Interações entre módulos)     │  │
│  │  ┌────────────────────────────────────────────────────────────┐  │  │
│  │  │  Tier 2: Casos de Borda e Corner Cases (≥5 por feature)    │  │  │
│  │  │  ┌──────────────────────────────────────────────────────┐  │  │  │
│  │  │  │  Tier 1: Cobertura Funcional (≥5 por feature F1-F15) │  │  │  │
│  │  │  └──────────────────────────────────────────────────────┘  │  │  │
│  │  └────────────────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Tier 1: Cobertura Funcional de Features (Category-Partition)
*Mínimo exigido: ≥5 testes por feature (F1 a F15) = 75 testes no Tier 1.*

### F1: Cálculo Ponderado de Estoque Mínimo (30 dias)
- **T1.F1.1**: Cálculo com histórico padrão 30d e 60d com pesos 0.65 e 0.35 e margem padrão de +15%.
- **T1.F1.2**: Aplicação de margens de segurança customizadas (ex: +10%, +20%, +0%).
- **T1.F1.3**: Produto com vendas apenas nos últimos 30 dias (período P2 zerado).
- **T1.F1.4**: Produto com vendas apenas nos dias 31-60 (período P1 zerado, queda brusca de demanda).
- **T1.F1.5**: Arredondamento superior obrigatório (`Math.ceil`) para garantir unidade inteira de venda sem fracionamento.

### F2: Gravação Atômica no Firebird Digifarma
- **T1.F2.1**: Gravação com sucesso de `PROD_ESTMINIMO` em lote dentro de transação `READ_COMMITTED`.
- **T1.F2.2**: Rollback automático e garantia de atomicidade quando ocorre erro em um item do lote.
- **T1.F2.3**: Gravação unitária de estoque mínimo para um produto específico.
- **T1.F2.4**: Detecção de lock/timeout no Firebird com disparo de retry seguro.
- **T1.F2.5**: Atualização idempotente (gravar o mesmo valor duas vezes não gera inconsistência).

### F3: Monitoramento de Ruptura e Faltas
- **T1.F3.1**: Identificação de produto em Ruptura Crítica (`PROD_SALDO <= 0` com demanda ativa).
- **T1.F3.2**: Identificação de produto Abaixo do Mínimo (`PROD_SALDO < PROD_ESTMINIMO`).
- **T1.F3.3**: Classificação de produto em Estoque Confortável (`PROD_SALDO >= PROD_ESTMINIMO`).
- **T1.F3.4**: Fallback automático para cache SQLite local quando Firebird estiver indisponível.
- **T1.F3.5**: Cálculo do valor financeiro total de reposição de faltas em estoque.

### F4: Instância Isolada Baileys WhatsApp Compras
- **T1.F4.1**: Inicialização isolada apontando para pasta de sessão `baileys-session-compras`.
- **T1.F4.2**: Geração e disponibilização de QR Code base64 quando em estado `qr_ready`.
- **T1.F4.3**: Reconexão resiliente com backoff exponencial após perda de conexão.
- **T1.F4.4**: Isolamento estrito: mensagens recebidas não disparam fluxo de chatbot de vendas/balcão.
- **T1.F4.5**: Limpeza de credenciais inválidas em erro 401 (loggedOut) para permitir novo pareamento.

### F5: Mineração de Histórico de Conversas de Representantes
- **T1.F5.1**: Extração de nome de representante e distribuidora a partir do texto/pushName.
- **T1.F5.2**: Identificação de prazos e condições de pagamento (ex: "28/35/42 dias", "30 dias boleto").
- **T1.F5.3**: Extração do valor de Pedido Mínimo de faturamento da distribuidora.
- **T1.F5.4**: Mapeamento de catálogo de categorias/produtos atendidos pelo vendedor.
- **T1.F5.5**: Persistência estruturada dos dados minerados em `compras_fornecedores_meta`.

### F6: Indexador Contínuo de Oportunidades & Ofertas
- **T1.F6.1**: Detecção de oferta com preço inferior à última compra registrada no Digifarma.
- **T1.F6.2**: Rejeição/Ignorar oferta com preço igual ou superior ao preço histórico do Digifarma.
- **T1.F6.3**: Extração de bonificação promocional em texto ("Compre 10 Ganhe 2").
- **T1.F6.4**: Cálculo da economia percentual obtida na oportunidade identificada.
- **T1.F6.5**: Cruzamento automático da oportunidade com a lista de faltas ativas da farmácia.

### F7: Geração Contextual de Solicitações de Cotação
- **T1.F7.1**: Agrupamento e roteamento de produtos faltantes para os fornecedores corretos.
- **T1.F7.2**: Redação profissional da mensagem de solicitação contendo descrição, apresentação e quantidade.
- **T1.F7.3**: Inserção direta na Fila de Aprovação Obrigatória (sem disparo direto ao WhatsApp).
- **T1.F7.4**: Respeito às categorias e histórico de atendimento de cada distribuidora.
- **T1.F7.5**: Suporte a cotação multi-itens com formatação legível para leitura rápida no WhatsApp.

### F8: Motor de Ranking Ponderado de Cotações
- **T1.F8.1**: Cálculo do Score Ponderado padrão (60% Preço Líquido, 25% Prazo, 15% Histórico).
- **T1.F8.2**: Normalização do Score de Preço pelo menor preço líquido concorrente.
- **T1.F8.3**: Pontuação progressiva de Prazo de Pagamento (42 dias > 28 dias > 14 dias > à vista).
- **T1.F8.4**: Penalização por taxa de quebra histórica (fornecedor com 20% de falta perde pontuação).
- **T1.F8.5**: Ordenação decrescente precisa do ranking (1º, 2º e 3º colocados).

### F9: Otimização Automática de Pedido Mínimo
- **T1.F9.1**: Detecção de subfaturamento (soma de itens vencedores < Pedido Mínimo da distribuidora).
- **T1.F9.2**: Simulação de preenchimento inteligente com outros itens faltantes da mesma distribuidora.
- **T1.F9.3**: Simulação de realocação para o 2º melhor colocado global que já atingiu o mínimo.
- **T1.F9.4**: Comparativo de custo total: custo adicional de preenchimento vs. custo do 2º colocado.
- **T1.F9.5**: Seleção da estratégia de menor desembolso e maior custo-benefício.

### F10: Gestão de Quebras e Fallback de Cotação
- **T1.F10.1**: Registro de quebra por falta de estoque informada pelo fornecedor vencedor.
- **T1.F10.2**: Passagem automática da cotação para o 2º colocado no ranking ponderado.
- **T1.F10.3**: Atualização da taxa histórica de quebra do fornecedor desistente.
- **T1.F10.4**: Tratamento de timeout de resposta: passagem de vez após tempo limite expirado.
- **T1.F10.5**: Fallback em cascata para 3º colocado caso o 2º também apresente quebra.

### F11: Fila de Aprovação Obrigatória de Mensagens
- **T1.F11.1**: Interceptação absoluta: nenhuma mensagem externa é enviada sem status `Aprovado`.
- **T1.F11.2**: Listagem de mensagens com status `Pendente` com payload visual para auditoria.
- **T1.F11.3**: Aprovação humana com disparo imediato via Baileys Compras e registro de auditoria.
- **T1.F11.4**: Rejeição humana com registro obrigatório de justificativa/motivo.
- **T1.F11.5**: Edição humana de texto, produtos ou quantidades antes da autorização de envio.

### F12: Sistema de Alerta Duplo (Web & WhatsApp ADM)
- **T1.F12.1**: Disparo simultâneo de notificação web (badge/toast) ao enfileirar mensagem.
- **T1.F12.2**: Disparo de mensagem de alerta para os números cadastrados em `ADMIN_WHATSAPP`.
- **T1.F12.3**: Formatação do resumo do alerta com fornecedor, valor estimado e link de ação rápida.
- **T1.F12.4**: Marcação de flag `notificado_admin = 1` evitando disparos duplicados em loop.
- **T1.F12.5**: Tratamento gracioso caso o WhatsApp ADM esteja temporariamente desconectado.

### F13: Elaboração de Espelhos de Pedidos de Compra
- **T1.F13.1**: Geração de espelho com numeração única, data e identificação da distribuidora.
- **T1.F13.2**: Grade detalhada de produtos contendo código Firebird, EAN, descrição, qtd e preço unitário.
- **T1.F13.3**: Discriminação de bonificações negociadas e valor líquido total do pedido.
- **T1.F13.4**: Inclusão de condições de pagamento acordadas e previsão estimada de entrega.
- **T1.F13.5**: Exportação de texto formatado pronto para cópia e envio comercial.

### F14: Controle Orçamentário e Integração Financeira
- **T1.F14.1**: Consulta ao teto orçamentário mensal definido em `monthly_limits`.
- **T1.F14.2**: Bloqueio/alerta de pedido que excede o limite mensal disponível.
- **T1.F14.3**: Cálculo de saldo remanescente disponível no mês: $Limite - (Comprometido + NovoPedido)$.
- **T1.F14.4**: Agendamento projetado das datas de vencimento dos boletos no fluxo de Contas a Pagar.
- **T1.F14.5**: Atualização do total comprometido no mês após confirmação do pedido.

### F15: Interface Web Unificada "Central de Compras"
- **T1.F15.1**: Proibição estrita de `alert()` e `confirm()` nativos no frontend (uso de Toasts/Modais).
- **T1.F15.2**: Layout responsivo do cabeçalho mobile: logo no topo e barra de busca/hamburger na 2ª linha.
- **T1.F15.3**: Navegação completa entre as 7 sub-abas da Central de Compras.
- **T1.F15.4**: Exibição de badge com contador em tempo real de aprovações pendentes no menu lateral.
- **T1.F15.5**: Alternância consistente de temas Claro/Escuro (`belinha_theme`) em todos os componentes.

---

## 4. Tier 2: Casos de Borda e Corner Cases (Boundary Value Analysis)
*Mínimo exigido: ≥5 testes de borda por feature (F1 a F15) = 75 testes no Tier 2.*

### F1 (Estoque Mínimo): Corner Cases
- **T2.F1.1**: Produto sem nenhuma venda nos últimos 90 dias ($Qtd = 0$) $\rightarrow$ Estoque Mínimo = 0.
- **T2.F1.2**: Produto Curva A com giro baixíssimo (ex: 0.1 un/dia) $\rightarrow$ Aplicação do piso de 2 unidades.
- **T2.F1.3**: Produto inativo (`PROD_ATIVO = 'N'`) $\rightarrow$ Cálculo ignorado / retorna 0.
- **T2.F1.4**: Vendas massivas em um único dia (outlier) $\rightarrow$ Amortização pela média ponderada.
- **T2.F1.5**: Margem de segurança zero ($\alpha = 0$) ou negativa $\rightarrow$ Tratamento correto sem NaN.

### F2 (Firebird Sync): Corner Cases
- **T2.F2.1**: Queda abrupta de socket durante o meio de uma transação multi-itens $\rightarrow$ Rollback completo.
- **T2.F2.2**: Tentativa de gravar produto com `PRODUTO_ID` inexistente $\rightarrow$ Erro capturado sem crash.
- **T2.F2.3**: Concorrência de escrita simultânea no Firebird $\rightarrow$ Fila de transação serializada.
- **T2.F2.4**: Valor de estoque mínimo nulo ou negativo passado $\rightarrow$ Sanitização para 0.
- **T2.F2.5**: Lote vazio de produtos para sincronização $\rightarrow$ Retorno imediato `{ success: true, count: 0 }`.

### F3 (Monitoramento Faltas): Corner Cases
- **T2.F3.1**: Estoque negativo no Firebird (ex: -3 por inconsistência de balcão) $\rightarrow$ Tratar como Ruptura Crítica.
- **T2.F3.2**: Produto com estoque exatamente igual ao mínimo ($Saldo = Minimo$) $\rightarrow$ Não está abaixo.
- **T2.F3.3**: Catálogo massivo com 10.000 itens $\rightarrow$ Filtragem de faltas em menos de 100ms.
- **T2.F3.4**: Cache SQLite corrompido ou inacessível $\rightarrow$ Retorno gracioso com array vazio e log de erro.
- **T2.F3.5**: Produto com código de barras (EAN) ausente ou em formato inválido $\rightarrow$ Fallback para descrição.

### F4 (Baileys Compras): Corner Cases
- **T2.F4.1**: Conexão com internet cortada no meio do envio $\rightarrow$ Enfileira erro e não marca como enviado.
- **T2.F4.2**: Número de telefone do representante com formatação exótica (sem 9º dígito, com traços ou espaços).
- **T2.F4.3**: Tentativa de disparo de mensagem com socket desconectado $\rightarrow$ Lança erro explícito.
- **T2.F4.4**: Pasta de sessão corrompida por queda de energia $\rightarrow$ Reset seguro e regeneração de QR Code.
- **T2.F4.5**: Envio de mensagem gigante (>4096 caracteres) $\rightarrow$ Segmentação ou formatação adequada.

### F5 (Mineração Histórico): Corner Cases
- **T2.F5.1**: Conversa com representante sem menção a valores $\rightarrow$ Cadastra contato sem pedido mínimo.
- **T2.F5.2**: Mensagem com múltiplos prazos conflitantes $\rightarrow$ Normaliza para lista única sem duplicatas.
- **T2.F5.3**: Conversa em grupo do WhatsApp $\rightarrow$ Ignora mensagens de não representantes.
- **T2.F5.4**: Texto com emojis excessivos e gírias de vendas $\rightarrow$ Extração resiliente via regex e PLN.
- **T2.F5.5**: Representante que atende duas distribuidoras diferentes no mesmo número $\rightarrow$ Mapeamento multi-distribuidora.

### F6 (Oportunidades & Ofertas): Corner Cases
- **T2.F6.1**: Produto ofertado sem histórico de compra prévia no Digifarma $\rightarrow$ Registra sem percentual de economia.
- **T2.F6.2**: Preço ofertado R$ 0,00 (erro de digitação do vendedor) $\rightarrow$ Rejeita oportunidade inválida.
- **T2.F6.3**: Oferta com dízima periódica de bonificação ("Compre 7 ganhe 3") $\rightarrow$ Cálculo exato do preço líquido.
- **T2.F6.4**: Oferta vencida / prazo de validade expirado $\rightarrow$ Marca como `Expirada`.
- **T2.F6.5**: Mensagem de texto com dezenas de ofertas tabuladas $\rightarrow$ Processamento individualizado de cada item.

### F7 (Geração de Cotações): Corner Cases
- **T2.F7.1**: Produto faltante sem nenhum fornecedor mapeado $\rightarrow$ Alerta de "Fornecedor Não Encontrado".
- **T2.F7.2**: Lista de cotação com 100 itens simultâneos $\rightarrow$ Divisão automática por distribuidora.
- **T2.F7.3**: Caracteres especiais e aspas no nome do medicamento $\rightarrow$ Escapamento correto na mensagem.
- **T2.F7.4**: Cotação para produto com quantidade sugerida zero $\rightarrow$ Bloqueia inclusão do item.
- **T2.F7.5**: Distribuidora desativada cadastrada no banco $\rightarrow$ Não gerar cotação para ela.

### F8 (Ranking Ponderado): Corner Cases
- **T2.F8.1**: Empate exato no Score Total entre dois fornecedores $\rightarrow$ Desempate pelo menor preço líquido.
- **T2.F8.2**: Fornecedor com preço 90% abaixo do mercado (possível erro) $\rightarrow$ Alerta de discrepância.
- **T2.F8.3**: Fornecedor com prazo de pagamento de 90 dias vs à vista $\rightarrow$ Aplicação do teto máximo de score de prazo.
- **T2.F8.4**: Fornecedor novo sem histórico de pontualidade $\rightarrow$ Score neutro padrão (75 pontos).
- **T2.F8.5**: Resposta com preço cotado em moeda diferente ou com taxa extra embutida $\rightarrow$ Tratamento correto.

### F9 (Pedido Mínimo): Corner Cases
- **T2.F9.1**: Nenhum fornecedor atinge o pedido mínimo mesmo somando todos os itens $\rightarrow$ Alerta consolidado.
- **T2.F9.2**: Pedido Mínimo de valor zero (distribuidora sem restrição) $\rightarrow$ Validação direta sem realocação.
- **T2.F9.3**: Valor faltante para o mínimo irrisório (ex: faltam R$ 2,00) $\rightarrow$ Sugestão de adicionar 1 unidade do item de maior giro.
- **T2.F9.4**: Realocação para 2º colocado aumenta o custo total em mais de 50% $\rightarrow$ Alerta de custo excessivo.
- **T2.F9.5**: Multi-distribuidoras com restrições cruzadas de pedido mínimo simultâneas.

### F10 (Quebras e Fallbacks): Corner Cases
- **T2.F10.1**: Todos os fornecedores cotados informam falta de estoque $\rightarrow$ Alerta de ruptura de mercado.
- **T2.F10.2**: Fornecedor informa quebra parcial (tem 5 das 10 unidades pedidas) $\rightarrow$ Faturamento parcial + cotação do restante.
- **T2.F10.3**: Fornecedor responde após o timeout ter sido acionado $\rightarrow$ Notificação de resposta tardia.
- **T2.F10.4**: Queda no ranking do fornecedor após sucessivas quebras $\rightarrow$ Redução de pontuação em tempo real.
- **T2.F10.5**: Fallback acionado durante horário não comercial $\rightarrow$ Enfileiramento correto na fila de aprovação.

### F11 (Fila de Aprovação): Corner Cases
- **T2.F11.1**: Tentativa de injeção de SQL ou script malicioso no texto da mensagem $\rightarrow$ Sanitização estrita.
- **T2.F11.2**: Clique duplo simultâneo em "Aprovar e Enviar" $\rightarrow$ Bloqueio de envio duplicado via lock de status.
- **T2.F11.3**: Aprovação de mensagem já rejeitada previamente $\rightarrow$ Bloqueio de transição de estado inválida.
- **T2.F11.4**: Edição de mensagem esvaziando todo o texto $\rightarrow$ Rejeita edição vazia.
- **T2.F11.5**: Rejeição de mensagem sem informar motivo $\rightarrow$ Exige preenchimento de justificativa.

### F12 (Alerta Duplo): Corner Cases
- **T2.F12.1**: Variável `ADMIN_WHATSAPP` vazia ou não configurada no `.env` $\rightarrow$ Alerta apenas na Web sem crash.
- **T2.F12.2**: Lista de múltiplos números de administradores separados por vírgula $\rightarrow$ Disparo para todos os números válidos.
- **T2.F12.3**: Falha de rede durante o envio do alerta para o WhatsApp ADM $\rightarrow$ Não impede o enfileiramento na web.
- **T2.F12.4**: Disparo de 50 aprovações em massa $\rightarrow$ Rate limiting para não bloquear a conta do WhatsApp ADM.
- **T2.F12.5**: Formatação de link de ação rápida com parâmetros de URL seguros e válidos.

### F13 (Espelhos de Pedido): Corner Cases
- **T2.F13.1**: Pedido contendo produtos com preço unitário de frações de centavos $\rightarrow$ Arredondamento contábil (2 casas decimais).
- **T2.F13.2**: Pedido com desconto financeiro global aplicado além dos descontos por item $\rightarrow$ Cálculo correto do valor final.
- **T2.F13.3**: Previsão de entrega em feriado ou fim de semana $\rightarrow$ Alerta de dia não útil.
- **T2.F13.4**: Distribuidora sem CNPJ ou telefone cadastrado $\rightarrow$ Exibe aviso no espelho sem impedir geração.
- **T2.F13.5**: Cancelamento de espelho de pedido já emitido $\rightarrow$ Reversão de status e estorno do orçamento.

### F14 (Controle Orçamentário): Corner Cases
- **T2.F14.1**: Teto orçamentário mensal definido como 0 (sem orçamento liberado) $\rightarrow$ Bloqueia todos os pedidos.
- **T2.F14.2**: Pedido com valor exatamente igual ao saldo disponível ($Valor = Saldo$) $\rightarrow$ Aprovado, saldo zera.
- **T2.F14.3**: Virada de mês (novo mês fiscal) $\rightarrow$ Reset automático do limite disponível para o novo período.
- **T2.F14.4**: Parcelamento em múltiplos boletos com datas variáveis (ex: 30/60/90 dias) $\rightarrow$ Distribuição nos meses corretos.
- **T2.F14.5**: Pedido cancelado após integração $\rightarrow$ Descomprometimento imediato do valor no orçamento mensal.

### F15 (Interface Web UI): Corner Cases
- **T2.F15.1**: Interceptação estrita: chamada de `window.alert` deve falhar ou ser capturada em testes de UI.
- **T2.F15.2**: Renderização em tela ultra-estreita (mobile 320px) $\rightarrow$ Header responsivo sem quebra visual.
- **T2.F15.3**: Renderização de lista de 500 produtos na tabela $\rightarrow$ Virtualização ou paginação fluida.
- **T2.F15.4**: Sessão web expirada durante a revisão de uma aprovação $\rightarrow$ Redirecionamento seguro para login.
- **T2.F15.5**: Toast de erro exibido com mensagem longa $\rightarrow$ Não ultrapassa limites da tela e fecha com auto-dismiss.

---

## 5. Tier 3: Combinações Cross-Feature (Interações de Integração)

### XF1: Estoque Mínimo $\rightarrow$ Faltas $\rightarrow$ Cotação $\rightarrow$ Fila de Aprovação
- **Cenário**: Cálculo do estoque mínimo identifica 3 produtos em ruptura. O sistema gera automaticamente as solicitações de cotação segmentadas por distribuidora e as deposita na Fila de Aprovação com status `Pendente`, disparando alerta web e WhatsApp ADM.

### XF2: Mineração WhatsApp $\rightarrow$ Oportunidade $\rightarrow$ Ranking Ponderado $\rightarrow$ Espelho de Pedido
- **Cenário**: Representante envia oferta no WhatsApp de Compras. O radar extrai os itens, compara com a última compra do Digifarma (preço 12% menor), roda o Ranking Ponderado (Score = 94.5) e gera o espelho formal de pedido de compra pronto para aprovação.

### XF3: Cotação $\rightarrow$ Pedido Mínimo Não Atingido $\rightarrow$ Otimização $\rightarrow$ Fallback para 2º Colocado
- **Cenário**: Fornecedor 1 é o mais barato, mas soma apenas R$ 280,00 contra um pedido mínimo de R$ 500,00. O otimizador simula preenchimento com outros itens da farmácia; ao detectar inviabilidade, transfere os itens para o Fornecedor 2 (que atinge o mínimo de R$ 600,00 com menor desembolso global).

### XF4: Fila de Aprovação $\rightarrow$ Edição Humana $\rightarrow$ Envio Baileys $\rightarrow$ Trava Orçamentária $\rightarrow$ Contas a Pagar
- **Cenário**: Administrador recebe alerta duplo de pedido de R$ 1.500,00. Ele edita a quantidade de um item para economizar R$ 200,00, clica em "Aprovar e Enviar", o Baileys Compras dispara a mensagem formatada para o representante, o sistema compromete R$ 1.300,00 no orçamento mensal e agenda os boletos (28/35/42 dias) no Contas a Pagar.

### XF5: Sync Firebird $\rightarrow$ Falha de Rede $\rightarrow$ Rollback $\rightarrow$ Fallback para SQLite $\rightarrow$ Notificação UI
- **Cenário**: Gravação em lote de 50 produtos no Firebird sofre queda de conexão no 23º item. A transação `READ_COMMITTED` executa rollback total, o sistema preserva os valores no cache SQLite local e envia Toast de aviso para o operador na interface web.

---

## 6. Tier 4: Cenários Reais de Aplicação (Workloads Operacionais de Farmácia)

### SC1: Reposição Mensal Completa da Farmácia (Giro Alto & Curva A)
- **Workload**: Farmácia processa fechamento mensal. O motor avalia 200 produtos de Curva A, calcula demanda de 30 dias com margem de +15%, detecta 35 itens abaixo do mínimo, divide entre 3 distribuidoras líderes (Santa Cruz, Profarma, Panpharma), atinge pedidos mínimos em todas, valida contra o orçamento mensal de R$ 40.000,00 e enfileira as 3 mensagens para aprovação do gestor.

### SC2: Ruptura Crítica de Medicamentos de Uso Contínuo e Antibióticos
- **Workload**: Frente de caixa (PDV) zera o estoque de Amoxicilina e Losartana. O sistema sinaliza Ruptura Crítica em tempo real, prioriza cotação relâmpago entre representantes minerados, seleciona a distribuidora com entrega mais rápida (previsão 24h) e dispara alerta de alta prioridade no WhatsApp dos administradores para aprovação expressa.

### SC3: Mineração de Encarte Promocional e Compra de Oportunidade com Bonificação
- **Workload**: Representante da Medley envia encarte de "Compre 10 Dipirona 500mg e Ganhe 2". O parser extrai a regra, calcula o preço líquido real unitário (R$ 2,50 vs R$ 3,10 da última compra), cruza com o giro de vendas (60 un/mês), calcula economia total de R$ 36,00 e prepara sugestão de compra de 50 caixas (+10 bonificadas).

### SC4: Quebra de Fornecedor Vencedor e Fallback Automático sem Retrabalho
- **Workload**: Pedido aprovado de R$ 2.400,00 é enviado para Distribuidora A. Duas horas depois, o vendedor informa falta de estoque de 40% dos itens. O gestor clica em "Registrar Quebra", o sistema reatribui automaticamente os itens faltantes para a Distribuidora B (2ª colocada no ranking), reavalia o pedido mínimo e gera novo espelho sem retrabalho manual.

### SC5: Tentativa de Envio Não Autorizado Bloqueada com Auditoria de Segurança
- **Workload**: Rotina de background tenta disparar mensagem direta para representante contornando a Fila de Aprovação. A camada de isolamento do `baileys-compras-service.js` intercepta a tentativa, rejeita o envio com `Error: Unauthorized direct dispatch - message must be approved in queue`, registra log de incidente e envia alerta duplo para os donos da farmácia.

---

## 7. Oráculos Matemáticos e Algorítmicos

| Conceito | Fórmula / Regra Formal | Oráculo de Validação |
|---|---|---|
| **VMD Ponderada ($VMD_P$)** | $\frac{(V_{30d} \times 0.65) + (V_{31-60d} \times 0.35)}{30}$ | Precisão de 4 casas decimais |
| **Estoque Mínimo ($EstMin$)** | $\lceil (VMD_P \times 30) \times (1 + \frac{\alpha}{100}) \rceil$ | Arredondamento superior (`Math.ceil`) |
| **Piso de Segurança Curva A** | Se $Ativo = 'S'$ e $Curva = 'A'$ e $EstMin < 2 \implies EstMin = 2$ | Valor mínimo 2 |
| **Preço Líquido com Bonificação** | $\frac{QtdPaga \times PrecoUnit}{QtdPaga + QtdBonus} \times (1 - Desconto)$ | Preço unitário real faturado |
| **Score Ponderado** | $(0.60 \times S_{Preco}) + (0.25 \times S_{Prazo}) + (0.15 \times S_{Historico})$ | Faixa 0 a 100 |
| **Score Preço Líquido ($S_{Preco}$)** | $\frac{MenorPrecoLiquido}{PrecoFornecedor} \times 100$ | Normalizado em 100% |
| **Score Prazo ($S_{Prazo}$)** | $\min(100, \frac{DiasPrazo}{42} \times 100)$ | Escala progressiva até 42d |
| **Score Histórico ($S_{Hist}$)** | $Pontualidade \times (1 - \frac{TaxaQuebra}{100})$ | Desconto por falta de entrega |
| **Validação Orçamentária** | $Comprometido + PedidoAtual \le LimiteMensal$ | `permitido: boolean` |

---

## 8. Comandos de Execução e Verificação

Para executar a suíte completa de testes no terminal:

```bash
# Execução direta com Node.js
node test_compras_e2e.js
```

Critério de aceitação: **100% dos testes devem passar (0 falhas)**.
