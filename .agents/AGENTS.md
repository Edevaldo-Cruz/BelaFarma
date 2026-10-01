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
