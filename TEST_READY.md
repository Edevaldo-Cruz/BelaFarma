# TEST READY: Belinha Compras Automated Test Suite

## Executive Summary
The automated test suite and pharmaceutical market fixtures for the **Belinha Compras** autonomous procurement specialist have been authored and verified per `TEST_INFRA.md`, `PROJECT.md`, and `ORIGINAL_REQUEST.md`.

- **Test Runner**: `backend/test_belinha_compras_suite.js`
- **Fixtures**: `backend/fixtures/belinha_compras_fixtures.json`
- **Execution Command**: `node backend/test_belinha_compras_suite.js`
- **Total Test Cases**: 70 tests (exceeding minimum requirement of ≥ 66 tests)
- **Status**: Ready for verification & remediation by `worker_impl_1`.

---

## Coverage Tier Breakdown

| Tier | Category | Minimum Required | Implemented Tests | Passed | Current Status |
| :--- | :--- | :---: | :---: | :---: | :--- |
| **Tier 1** | Feature Coverage (Happy Path) | ≥ 25 | 27 | 22 | 5 tests blocked by implementation bugs (EMS/Cimed/Neo/Euro as suppliers, min order regex) |
| **Tier 2** | Boundary & Corner Cases | ≥ 20 | 22 | 20 | 2 tests blocked by implementation bugs (thousand dot separator, negative price rejection) |
| **Tier 3** | Cross-Feature Combinations | ≥ 15 | 15 | 11 | 4 tests blocked by implementation bugs (industry supplier in combos, rep name parser, textual validity) |
| **Tier 4** | Real-World Application Scenarios | ≥ 6 | 6 | 6 | **100% PASS** (Panpharma 10-item list, Vision OCR, 10+2 bonification, noise rejection, tiered volume, SQLite & BelaPed upsert) |
| **Total** | **Full E2E Battery** | **≥ 66** | **70** | **59** | **59/70 (84.3% passing)** |

---

## Detailed Test Architecture

### 1. Fixtures (`backend/fixtures/belinha_compras_fixtures.json`)
- **Happy-path commercial offers**: Formal lists and distributor broadcasts from Panpharma, Santa Cruz, Profarma, EMS, Cimed, Neo Química, and Eurofarma.
- **Commercial conditions**: Compound payment terms (`28/42 dias`, `30/60/90`), cash/PIX terms (`À vista`), minimum orders (`R$ 300,00`, `R$ 500,00`), and ISO validity dates (`YYYY-MM-DD`).
- **Product specifications**: Dosages, pharmaceutical presentations (`cx`, `un`, `frasco`, `ampola`), 13-digit EANs with validated GS1 Modulo-10 check digits, laboratory detection, and bonifications (`10+2`, `Compre 5 Ganhe 1`).
- **Anti-noise samples**: Casual greetings (`"Bom dia!"`, `"Como vai?"`), operational notices, delivery status, PIX payment receipts, customer queries without prices, and stickers/emojis.
- **Boundary & stress cases**: Comma dosages (`CLONAZEPAM 2,00 GOTAS`, `DIPIRONA 500,00`), invalid EANs (11 digits, 14 digits, corrupted checksums, non-numeric characters), Brazilian currency formats (`R$ 1.250,50`, `R$ 0,85`), zero/negative prices, and corrupted/empty image buffers.

### 2. Test Runner (`backend/test_belinha_compras_suite.js`)
- **Strict Schema Enforcement**: Programmatic Draft-07 JSON Schema validation asserting `sucesso: boolean`, `ehOfertaComercial: boolean`, non-null `fornecedor` object (`distribuidora`, `representante`, `condicaoPagamento`, `pedidoMinimo`, `validadeOferta`), and `produtosOfertados` array.
- **Checksum Verification**: GS1 Modulo-10 algorithm validation on all 13-digit EAN codes.
- **Terminal Reporting**: Colorized ANSI terminal output (`PASS`/`FAIL` per test), per-tier metrics breakdown, execution timer, and failure stack traces.
- **Deterministic Exit Code**: Returns code `0` on 100% pass, and code `1` on any failure.

---

## Implementation Defects Discovered & Escalated to `worker_impl_1`

The following 6 defect categories were discovered in `backend/services/belinha-compras.service.js` (and `backend/services/compras-mineracao.service.js`) during the test run and are escalated for remediation:

### Defect 1: Pharmaceutical Industries Not Recognized as Suppliers
- **Impacted Tests**: `T1_06_SUPP_EMS`, `T1_07_SUPP_CIMED`, `T1_08_SUPP_NEOQUIMICA`, `T1_09_SUPP_EUROFARMA`, `T3_03_PROG_TIERS_SUPPLIER`, `T3_05_COMBO_BUNDLE`
- **Observed**: `fornecedor.distribuidora` returns `null` when messages originate directly from pharmaceutical manufacturing industries (`EMS`, `Cimed`, `Neo Química`, `Eurofarma`).
- **Root Cause**: `extrairDistribuidoraELaboratorios` only maps entries in `DISTRIBUIDORAS_CONHECIDAS`. Direct industry manufacturers are categorized solely as laboratories, leaving `fornecedor.distribuidora` null.
- **Recommended Fix**: In `extrairDistribuidora` or `belinha-compras.service.js`, check if the sender/header specifies direct industry manufacturers (`EMS`, `Cimed`, `Neo Química`, `Eurofarma`) and set `fornecedor.distribuidora`.

### Defect 2: Brazilian Currency Thousand Separator Parsing
- **Impacted Test**: `T2_16_BRL_THOUSAND_SEPARATOR`
- **Observed**: `parsePriceValue("1.250,50")` returns `1.25` instead of `1250.50`.
- **Root Cause**: The thousand separator regex prematurely matched the dot before removing it or failed to distinguish `1.250,50` from decimal dots.
- **Recommended Fix**: Ensure thousand dots are stripped before replacing comma with dot: `str.replace(/\.(?=\d{3}(?:,|$))/g, '').replace(',', '.')`.

### Defect 3: Negative Price Rejection
- **Impacted Test**: `T2_19_PRICE_NEGATIVE_REJECTED`
- **Observed**: Negative price string `"-R$ 15,00"` is parsed as `15.00` and admitted into `produtosOfertados`.
- **Root Cause**: The price regex does not verify that preceding characters do not contain a minus sign (`-`).
- **Recommended Fix**: Reject lines where the matched currency value is preceded by `-` or where `preco <= 0`.

### Defect 4: Representative Name Parsing in Messy Multi-Line Messages
- **Impacted Test**: `T3_10_MULTILINE_MESSY_WHATSAPP`
- **Observed**: In `"Fala pessoal da BelaFarma! Marcos aqui."`, `fornecedor.representante` was extracted as `"pessoal"`.
- **Root Cause**: The regex `/(?:fala|olá)\s+([A-Z][a-z]+)/i` captured the greeting collective `"pessoal"`.
- **Recommended Fix**: Add `"pessoal"`, `"galera"`, `"turma"`, `"amigos"` to the ignore list in `extrairNomeRepresentante`, allowing subsequent patterns like `"Marcos aqui"` or `"Sou o Marcos"` to be matched.

### Defect 5: Minimum Order Regex Missing "Faturamento Mínimo Exigido"
- **Impacted Test**: `T1_16_MIN_ORDER_500`
- **Observed**: `"Faturamento mínimo exigido: R$ 500,00 para entrega em Juiz de Fora"` returns `pedidoMinimo: null`.
- **Root Cause**: The regex for minimum order only checks `"pedido mínimo"` or `"minimo"` without `"faturamento mínimo exigido"`.
- **Recommended Fix**: Expand `extrairPedidoMinimo` regex to include `/(?:faturamento\s+m[íi]nimo(?:\s+exigido)?|ped(?:ido)?\s*m[íi]n(?:imo)?)/i`.

### Defect 6: Textual Validity Extraction
- **Impacted Test**: `T3_13_VALIDITY_TEXTUAL_ORIGINAL`
- **Observed**: Textual validity `"Válido apenas hoje até as 18 horas ou fim do lote!"` returns `validadeOferta: null`.
- **Root Cause**: `extrairValidadeDaMensagem` only returns structured calendar dates and ignores textual validity statements.
- **Recommended Fix**: When no calendar date is matched, capture the raw textual sentence mentioning `"válido apenas hoje"` or `"validade:"` into `validadeOferta`.

---

## Instructions to Run
```powershell
node backend/test_belinha_compras_suite.js
```
The test suite will execute all 70 test cases and report results in color with summary statistics.
Once `worker_impl_1` applies the 6 fixes above, all 70 tests are expected to pass with exit code `0`.
