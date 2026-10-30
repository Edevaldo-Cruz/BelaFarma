# REGRAS DO PROJETO BELAFARMA

## ⚠️ IMPORTANTE: DEPLOY E SERVIDOR
- **Repositório Principal**: O repositório oficial é o GitHub (`origin/main`).
- **Atualizações**: Ao finalizar tarefas e commits, realizar o `git push origin main` para manter o GitHub sempre atualizado.
- O servidor de deploy foi alterado; portanto, não sugerir nem executar deploys automáticos no servidor anterior, apenas garantir o envio das atualizações para o GitHub.

## 📐 DIRETRIZES DE DESIGN & TABELAS DE ALTA DENSIDADE (UI/UX)
- **Prevenção de Colisão em Cabeçalhos**: Todos os cabeçalhos (`<th>`) de tabelas de gestão devem conter `whitespace-nowrap` e larguras controladas, impedindo sobreposição e quebras desordenadas de texto em telas de farmácia/caixa.
- **Densidade Vertical (1 Linha Compacta)**: Evitar empilhamento vertical excessivo na mesma célula. Metadados complementares (como EAN, dias parado e laboratório/categoria) devem ser organizados em linha única sutil (`inline-flex` ou flex com separadores), mantendo a altura da linha compacta.
- **Ações Enxutas por Ícone**: Em listagens densas com dezenas ou centenas de produtos, as ações devem priorizar botões compactos de ícones (`Pencil`, `RotateCcw`, `Printer`) com tooltips nativos explicativos, liberando espaço horizontal para os dados críticos de produto e preço.
- **Hierarquia Visual de Preços**: As colunas financeiras (Custo, De, Por e Desconto) devem ser organizadas de forma harmônica, com alinhamento numérico impecável à direita, sem poluição visual.

## 🤖 BELAPED: PARIDADE ENTRE PORTAIS (DISTRIBUIDORAS)
- **Todo portal novo deve nascer com TODAS as funções dos portais existentes.** Contrato obrigatório de cada robô (`backend/belaped-robot-<portal>.js`):
  - `iniciar()` / `fechar()` (login e encerramento; sessão persistente quando houver 2FA)
  - `cotarEAN(ean, descricao)` com **validação estrita de EAN** (nunca aceitar item cujo EAN não corresponda)
  - `adicionarAoCarrinho(ean, quantidade, descricao)` (ou `importarCarrinhoArquivo` quando o portal só aceita arquivo)
  - `contarItensCarrinho()` e `limparCarrinho()` (retornam/confirmam carrinho com 0 itens)
- **Regra do carrinho limpo**: antes de qualquer montagem de carrinho, todos os portais devem ter o carrinho esvaziado e confirmado com 0 itens (tentar até 2 retentativas; se falhar, abortar tudo). Usar `garantirCarrinhosVazios()` em `belaped-endpoints.js`.
- Todo portal novo também deve ser incluído em: `belaped_portais` (pedido mínimo/UF), cotação `TODOS`, monitor de robôs (`BelaPedRobotMonitor.tsx`), `recotar-produto`, link do produto, Melhor Dia e `minimosPadrao` do `BelaPedPortal.tsx`.
- **Nunca executar `limparCarrinho()` em teste contra portal real sem autorização explícita do usuário** (os carrinhos podem conter compras reais em andamento).
