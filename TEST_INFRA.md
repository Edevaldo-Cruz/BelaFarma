# E2E Test Infra: Belinha Compras

## Test Philosophy
- Opaque-box, requirement-driven.
- Cobertura de ponta a ponta dos Requisitos R1, R2, R3 e R4 de `ORIGINAL_REQUEST.md`.
- Verificação determinística e sem falsos positivos: validação de conformidade estrita com JSON Schema, precisão numérica decimal em reais (R$), validação de checksum EAN-13, filtro de ruídos e persistência atômica no SQLite.

## Feature Inventory
| # | Feature | Source (Requirement) | Tier 1 | Tier 2 | Tier 3 |
|---|---------|---------------------|:------:|:------:|:------:|
| 1 | Classificação Comercial (`ehOfertaComercial`) | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 2 | Identificação de Fornecedor & Distribuidora | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 3 | Identificação de Representante e Vendedor | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 4 | Condições e Prazos Comerciais de Pagamento | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 5 | Pedido e Faturamento Mínimo em R$ | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 6 | Validade e Vigência da Promoção | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 7 | Extração de Nome Comercial Completo | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 8 | Validação Estrita de EAN (13 Dígitos) | ORIGINAL_REQUEST §R1/R4 | 5 | 5 | ✓ |
| 9 | Laboratório Fabricante & Prefixo GS1 | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 10 | Preço Ofertado Líquido (R$) | ORIGINAL_REQUEST §R1/R4 | 5 | 5 | ✓ |
| 11 | Unidade e Embalagem de Faturamento | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 12 | Diluição Matemática de Bonificações | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 13 | Descontos Progressivos e Escalonados | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 14 | Ingestão Baileys ImageMessage | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| 15 | Buffer Download & Fallback | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| 16 | Multimodal Vision Gemini | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| 17 | Score de Confiança OCR (0.0 a 1.0) | ORIGINAL_REQUEST §R2/R4 | 5 | 5 | ✓ |
| 18 | Persistência em Banco de Dados SQLite | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ |
| 19 | Histórico de Mensagens WhatsApp | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ |
| 20 | Waterfall com Catálogo Digifarma | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ |
| 21 | Upsert em belaped_cotacoes_reais | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ |

## Test Architecture
- **Runner**: Node.js script `node backend/test_belinha_compras_suite.js`.
- **Fixtures**: `backend/fixtures/belinha_compras_fixtures.json`.
- **Exit Code**: 0 em caso de 100% de sucesso em todos os testes, código 1 em qualquer falha.
- **Coverage Tiers**:
  - **Tier 1 (Feature Coverage)**: Testes unitários para cada feature isolada em happy-path.
  - **Tier 2 (Boundary & Corner Cases)**: Mensagens casuais ("bom dia"), EANs inválidos, dosagens com vírgula (CLONAZEPAM 2,00 vs R$ 2,00), bonificações progressivas, buffers vazios/corrompidos.
  - **Tier 3 (Cross-Feature Combinations)**: Mensagens contendo mix de ofertas com bonificação, prazos compostos, combos e faturamento mínimo simultâneos.
  - **Tier 4 (Real-World Application Scenarios)**: Encartes fotográficos reais, tabelas de distribuição com 20+ produtos, listas de transmissão WhatsApp com ruídos periféricos e integração ponta a ponta com o radar do BelaPed.

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Features Exercised | Complexity |
|---|----------|--------------------|------------|
| 1 | Lista de Transmissão Panpharma com 10 Medicamentos | F1-F13, F18-F21 | Alta |
| 2 | Encarte Fotográfico Santa Cruz (Multimodal Vision) | F1-F17, F18-F21 | Alta |
| 3 | Mensagem Informal de Representante com Bonificação 10+2 | F1-F13, F18, F21 | Média |
| 4 | Fluxo de Conversa Casual Sem Ofertas ("Bom dia doutor") | F1, F15, F18 | Média |
| 5 | Tabela Promocional com Faixas Escalonadas de Volume | F1-F13, F18, F21 | Alta |
| 6 | Ingestão Ponta a Ponta via Baileys com Upsert no BelaPed | F1-F21 | Crítica |

## Coverage Thresholds
- Tier 1: ≥ 25 casos de teste cobrindo todas as features essenciais
- Tier 2: ≥ 20 casos de borda e corner cases
- Tier 3: ≥ 15 combinações cross-feature
- Tier 4: ≥ 6 cenários reais de aplicação de mercado farmacêutico
- **Total Mínimo Exigido: ≥ 66 casos de teste**
