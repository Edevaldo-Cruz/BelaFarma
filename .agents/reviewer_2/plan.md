# Plan — Reviewer Round 2 (Auditoria Adversarial e Refinamento)

## 1. Contexto & Escopo
Auditar e testar adversariamente o código implementado para a missão de Última Compra Digifarma (Firebird) e Mineração de Ofertas (Central de Compras).

## 2. Falhas Críticas e Lacunas Identificadas
1. **Rejeição de Notas Fiscais Reais no Cache durante Sincronização (`sincronizarUltimasComprasDigifarma`):**
   - A cláusula `WHERE excluded.data_compra >= digifarma_ultimas_compras_cache.data_compra` rejeitava qualquer NF do Firebird emitida antes de hoje se o produto tivesse sido pré-carregado no cache com `fonte = 'ESTOQUE_CACHE'` (cujo `data_compra` é inicializado como hoje).
   - Correção: Permitir atualização incondicional quando `digifarma_ultimas_compras_cache.fonte != 'NOTA_FISCAL'`.
2. **Crash por Tipo (`precoOfertado.toFixed is not a function`) em `validarOfertaComDigifarma`:**
   - Se `precoOfertado` for passado como string (ex: `"2.80"` em requests HTTP/JSON), o método quebrava.
   - Correção: Coerção estrita `parseFloat(precoOfertado) || 0`.
3. **Ausência da Coluna `produto_id` em `compras_oportunidades_mineradas` e Falha de Match sem EAN:**
   - Oportunidades gravadas não salvavam `produto_id`. Em produtos sem código de barras (EAN nulo), `listarOportunidades` não conseguia consultar o cache de últimas compras por ID.
   - Correção: Adicionar coluna `produto_id`, gravar no insert de mineração, atualizar no recálculo e adicionar busca por ID e descrição exata no `listarOportunidades`.
4. **Seleção Cega de Primeiro Candidato (`pRows[0]`) em `buscarUltimaCompraProduto`:**
   - Ao buscar por descrição no Firebird, o código pegava `pRows[0]` sem ranqueamento por similaridade de termos (`pontuarCorrespondencia`).
   - Correção: Aplicar `pontuarCorrespondencia` selecionando o melhor score.
5. **Inversão de Data DD/MM/YYYY no Frontend (`formatarData`):**
   - `new Date('02/09/2026')` invertia dia e mês para 09/02/2026 no JavaScript.
   - Correção: Regex determinístico para formatos brasileiros e ISO.
6. **Duplicação de Preço de Embalagem na Interface e Fechamento no Mobile:**
   - Se `embalagemUltCompra` já contivesse `(R$ X total)`, o modal duplicava o texto.
   - O card de auditoria aberto via toque não fechava ao clicar fora.
   - Correção: Normalizar exibição de embalagem e adicionar listener de clique externo.

## 3. Plano de Ação
- [x] Analisar requisitos e diff anterior
- [x] Identificar vulnerabilidades e bugs
- [ ] Aplicar correções no backend (`database.js`, `compras-mineracao.service.js`)
- [ ] Aplicar correções no frontend (`ComprasMineracao.tsx`)
- [ ] Expandir suíte de testes automatizados (`test_ultimas_compras_mineracao.js`) para 18 testes
- [ ] Executar suíte completa de testes (`test_ultimas_compras_mineracao.js` e `test_compras_m2.js`)
- [ ] Executar build do frontend (`npm run build`)
- [ ] Atualizar documentação e progresso
- [ ] Fazer commit e push para `origin/main`
- [ ] Enviar relatório final via `send_message` ao parent
