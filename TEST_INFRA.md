# Infraestrutura de Testes Automatizados E2E — Motor de Busca e Inteligência de Medicamentos (BelaFarma)

## 1. Visão Geral e Filosofia de Qualidade

A infraestrutura de testes do **Motor de Busca e Inteligência de Medicamentos** foi projetada para garantir **confiabilidade matemática, resiliência operacional contínua e alta performance** no ecossistema da BelaFarma.

O motor atua como a **fonte única de verdade** para estoque, preços vigentes (promocionais ou normais), histórico de compras e reposição calculada para 30 dias de giro sem ruptura. Por lidar com compras farmacêuticas e fluxo de caixa da empresa, as regras de negócio devem ser validadas com tolerância zero para falhas de cálculo ou regressões de performance.

### Princípios Norteadores
1. **Determinismo Absoluto**: Os testes não dependem de estado externo volátil, internet ou disponibilidade da rede do Digifarma (Firebird).
2. **Independência e Isolamento**: Cada teste configura seu próprio contexto ou opera sobre bancos SQLite limpos e isolados (`:memory:` ou transações isoladas em `belafarma.db`), garantindo idempotência e ausência de efeitos colaterais.
3. **Resiliência com Fallback Gracioso**: A indisponibilidade do banco Firebird nunca deve gerar falhas não tratadas (HTTP 500) ou quebras de suíte.
4. **Sem Facades / Sem Testes Falsificados**: Nenhuma asserção é hardcoded ou mascarada. Toda validação compara o comportamento real contra a especificação formal e oráculos matemáticos.

---

## 2. Metodologia Dual Track

A estratégia de testes opera sob a abordagem **Dual Track**, separando a verificação de propriedades intrínsecas da verificação de sistemas distribuídos e fluxos ponta a ponta:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        ESTRATÉGIA DUAL TRACK                           │
├────────────────────────────────────┬───────────────────────────────────┤
│   TRACK A: ESPECIFICAÇÃO & CÁLCULO │   TRACK B: INTEGRAÇÃO & SISTEMA   │
│   (Determinismo & Matemática)      │   (Resiliência & E2E)             │
├────────────────────────────────────┼───────────────────────────────────┤
│ • Invariantes de DDL e Chaves      │ • Endpoints REST Express          │
│ • Fórmula de Giro para 30 dias     │ • Busca Fuzzy, EAN e por ID       │
│ • Estoque Máximo = 2x Mínimo       │ • Resiliência Firebird Offline    │
│ • Resolução de Preço Vigente       │ • Acionamento Proativo Horácio    │
│ • Matriz dos 4 Status de Ruptura   │ • Consumo Reativo em Cotações     │
│ • Benchmark Sub-10ms com índices   │ • Tratamento de Erros e Timeouts  │
└────────────────────────────────────┴───────────────────────────────────┘
```

- **Track A (Especificação e Domínio)**: Avalia a correção matemática das fórmulas de reposição, resolução de preços promocionais por data/hora, consistência de tipos e integridade do schema consolidado `compras_estoque_cache`.
- **Track B (Sistema, Integração e Resiliência)**: Avalia os fluxos integrados através dos endpoints REST (`/api/medicamentos/*`), a sobrevivência do motor durante quedas simuladas de conexão com o Digifarma, e a comunicação bidirecional com o Agente Especialista Horácio.

---

## 3. Arquitetura de Testes em 4 Tiers

A suíte está estruturada em **4 Tiers incrementais**, permitindo rastreabilidade direta aos requisitos do projeto (R1 a R5):

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                 ARQUITETURA DE VALIDAÇÃO EM 4 TIERS                         │
├─────────────────────────────────────────────────────────────────────────────┤
│  TIER 1: Schema Consolidado & Benchmark de Velocidade (< 10ms)             │
│  - 32 colunas consolidadas (incluindo as 11 novas colunas de R1)            │
│  - Chave Primária produto_id e Índices: ean, descricao, status, curva_abc  │
│  - SLA: Buscas por ID, EAN, termos LIKE e status executando em < 10ms       │
├─────────────────────────────────────────────────────────────────────────────┤
│  TIER 2: Inteligência de Estoque (30 Dias sem Ruptura & Dobro no Máximo)    │
│  - VMD Ponderado com margem de segurança configurável (padrão 15%)          │
│  - Estoque Mínimo: Math.ceil(VMD_P * 30 * (1 + margem/100))                 │
│  - Estoque Máximo: rigorosamente est_minimo_calculado * 2 (2x Mínimo)       │
│  - Quantidade Sugerida: Math.max(0, est_minimo_calculado - saldo)           │
│  - Matriz 4 Status: RUPTURA, ABAIXO_MINIMO, NORMAL, EXCESSO                │
├─────────────────────────────────────────────────────────────────────────────┤
│  TIER 3: Resolução de Preço Vigente & Resiliência Firebird Offline          │
│  - Preço Vigente: Promoção Ativa vs Expirada vs Futura vs Sem Promoção      │
│  - Precisão de Vigência ao nível de Segundo (23:59:59)                      │
│  - Resiliência Offline: Fallback 100% no cache SQLite sem erro HTTP 500     │
├─────────────────────────────────────────────────────────────────────────────┤
│  TIER 4: Endpoints REST & Integração com Agente Horácio                     │
│  - GET /api/medicamentos/busca (termo, EAN, ID, status, curva, paginação)   │
│  - GET /api/medicamentos/:id (detalhe unificado por ID ou EAN)              │
│  - GET /api/medicamentos/rupturas (itens críticos e orçamento 30 dias)      │
│  - POST /api/medicamentos/sincronizar (disparo com relatório e fallback)   │
│  - Horácio Proativo (relatório executivo diário de compras pós-sync)        │
│  - Horácio Reativo (validação instantânea de cotações e ofertas do WhatsApp)│
└─────────────────────────────────────────────────────────────────────────────┘
```

### Detalhamento dos Tiers

#### Tier 1: Schema Consolidado & Benchmark de Velocidade
- **Tabela**: `compras_estoque_cache` no SQLite local (`data/belafarma.db` ou banco de teste).
- **Colunas Novas Validadas (11 colunas)**:
  1. `apresentacao` (TEXT)
  2. `preco_venda_vigente` (REAL DEFAULT 0)
  3. `preco_normal` (REAL DEFAULT 0)
  4. `preco_promocional` (REAL DEFAULT 0)
  5. `inicio_promocao` (TEXT)
  6. `termino_promocao` (TEXT)
  7. `preco_unitario_ult_compra` (REAL DEFAULT 0)
  8. `ultima_compra_fornecedor` (TEXT)
  9. `ultima_compra_data` (TEXT)
  10. `ultima_compra_nf` (TEXT)
  11. `qtd_sugerida_compra` (REAL DEFAULT 0)
- **Índices de Cobertura**: `idx_cec_ean`, `idx_cec_descricao`, `idx_cec_status`, `idx_cec_curva`.
- **Benchmark**: Amostragem de 100 iterações para cada tipo de consulta, calculando média e desvio. A média DEVE ser estritamente `< 10.0ms` para ser aprovada.

#### Tier 2: Inteligência de Estoque & Fórmulas de Reposição
- **Fórmula de Estoque Mínimo**:
  $$\text{Estoque Mínimo} = \left\lceil \text{VMD}_P \times 30 \times \left(1 + \frac{\text{margem}}{100}\right) \right\rceil$$
- **Fórmula de Estoque Máximo**:
  $$\text{Estoque Máximo} = \text{Estoque Mínimo} \times 2$$
- **Fórmula de Quantidade Sugerida de Compra**:
  $$\text{Qtd Sugerida} = \max(0, \text{Estoque Mínimo} - \text{Saldo})$$
- **Classificação de Status**:
  - Se $\text{Saldo} \le 0 \implies \textbf{RUPTURA}$
  - Se $0 < \text{Saldo} < \text{Estoque Mínimo} \implies \textbf{ABAIXO\_MINIMO}$
  - Se $\text{Estoque Mínimo} \le \text{Saldo} \le \text{Estoque Máximo} \implies \textbf{NORMAL}$
  - Se $\text{Saldo} > \text{Estoque Máximo} \implies \textbf{EXCESSO}$

#### Tier 3: Preço de Venda Vigente & Resiliência Offline
- **Resolução de Preço**:
  - $\text{Preço Vigente} = \text{Preço Promocional}$ se $\text{Preço Promocional} > 0$ e $\text{Início} \le \text{Data Atual} \le \text{Término}$.
  - $\text{Preço Vigente} = \text{Preço Normal}$ caso contrário.
- **Resiliência de Rede**:
  - Quando a conexão com o Firebird sofre timeout, recusa de conexão ou o banco está offline, o motor consulta e persiste no cache SQLite local, mantendo disponibilidade 100% sem interrupção de serviço.

#### Tier 4: Endpoints REST & Agente Horácio
- **Contratos de API**:
  - `/api/medicamentos/busca` responde com paginação, contagem total e objetos enriquecidos.
  - `/api/medicamentos/:id` busca por ID primário com fallback para código de barras EAN.
  - `/api/medicamentos/rupturas` lista os itens com criticidade imediata e calcula o montante financeiro total de reposição para 30 dias.
  - `/api/medicamentos/sincronizar` realiza a sincronização agendada/manual e gera a notificação ao Agente Horácio.
- **Integração do Agente Horácio**:
  - **Proativo**: Gera relatório executivo (`compras_horacio_relatorios`) com a lista consolidada de faltas e compras para 30 dias.
  - **Reativo**: O serviço de mineração e o Horácio realizam validação instantânea de preços ofertados via WhatsApp contra o motor consolidado em chamada única.

---

## 4. Tecnologias e Ferramentas Empregadas

- **Node.js**: Runtime nativo (v24.x LTS).
- **Asserções**: Módulo nativo `node:assert` (`assert.strictEqual`, `assert.ok`, `assert.deepStrictEqual`), sem dependências externas pesadas.
- **Banco de Dados de Teste**:
  - `better-sqlite3`: Motor C++ ultrarrápido síncrono.
  - Instâncias em memória (`:memory:`) para isolamento hermético de testes unitários.
  - Banco local WAL (`data/belafarma.db`) para validação de schema real e benchmarks.
- **Medição de Performance**: `perf_hooks.performance.now()` com resolução de microssegundos.
- **Servidor REST**: `express` integrado com supertest ou instâncias de teste HTTP.

---

## 5. Casos de Teste Adversariais e Edge Cases

A suíte inclui baterias de testes adversariais para garantir robustez sob condições anômalas:

1. **Estoque Furado / Saldo Negativo**:
   - Saldo de -5 unidades com mínimo de 40 unidades: a quantidade sugerida deve calcular $40 - (-5) = 45$ unidades (e não 35 ou 40), marcando status `RUPTURA`.
2. **Produtos sem Histórico de Venda (Giro Zero)**:
   - VMD = 0, vendas dos períodos = 0: o estoque mínimo calculado deve ser 0, estoque máximo 0, e sugerido 0 (a menos que haja piso de Curva A).
3. **Fronteira Exata de Promoção**:
   - Promoção com término em `2026-09-04T23:59:59`:
     - Teste às `2026-09-04T23:59:58` $\implies$ preco promocional.
     - Teste às `2026-09-05T00:00:01` $\implies$ preco normal.
4. **Valores Fracionários e Arredondamento para Cima (`Math.ceil`)**:
   - Projeção de $14.02$ unidades para 30 dias $\implies$ Estoque Mínimo DEVE ser arredondado para $15$ unidades (para garantir 0% de risco de ruptura antes do fim do 30º dia).
5. **Robustez de Entradas Inválidas / Sanitização**:
   - Entradas `null`, `undefined`, strings em campos numéricos não causam exceção não tratada e retornam valores seguros com fallback estruturado.

---

## 6. Como Executar os Testes

### Execução da Suíte Principal de Medicamentos
```bash
# Executa a suíte completa ponta a ponta
node backend/test_motor_busca_medicamentos.js
```

### Execução de Testes Complementares do Módulo de Compras
```bash
# Suíte de Últimas Compras e Mineração do Digifarma (24 testes)
node backend/test_ultimas_compras_mineracao.js

# Suíte de Estoque Mínimo e Fórmulas Legadas
node backend/test_compras_estoque.js
```

---

## 7. Critérios de Aceite e SLA (Definition of Done)

Para aprovação completa da infraestrutura de testes:
- [x] **100% dos testes executados** concluem sem falhas ou erros não capturados.
- [x] **Benchmark de velocidade**: consultas indexadas por ID, EAN, descrição LIKE e status concluem em média **< 10ms**.
- [x] **Estoque Máximo**: validado rigorosamente como **exatamente $2 \times \text{Estoque Mínimo}$**.
- [x] **Preço Vigente**: resolução dinâmica de vigência com precisão de data/hora validada.
- [x] **Resiliência Offline**: o sistema continua funcional e responsivo mesmo na indisponibilidade do Firebird.
- [x] **Integração Horácio**: geração de relatório executivo e validação atômica de ofertas cobertas.
