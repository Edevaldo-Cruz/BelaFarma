# Tarefa: Worker M1 - Estoque Mínimo 30 Dias & Sincronização Firebird Digifarma

## 2026-08-29T17:11:18Z

## Identidade e Diretório
- Archetype: teamwork_preview_worker
- Working directory: f:\Documentos\Desenvolvimento\BelaFarma\.agents\worker_m1_estoque
- Original Request: f:\Documentos\Desenvolvimento\BelaFarma\.agents\ORIGINAL_REQUEST.md
- Project Scope: f:\Documentos\Desenvolvimento\BelaFarma\.agents\PROJECT.md
- Analysis Report: f:\Documentos\Desenvolvimento\BelaFarma\.agents\explorer_survey_database\analysis.md

## MANDATORY INTEGRITY WARNING
> DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Missão
Implementar de forma completa, robusta e genuína o módulo de Estoque Mínimo e Sincronização Firebird:
1. **Propriedade de Arquivos**:
   - `backend/services/compras-estoque.service.js` (Novo serviço dedicado)
   - `backend/database.js` (Tabela SQLite `compras_estoque_cache` para persistência local e resposta ultrarrápida)
   - Adicionar métodos de cálculo e sincronização com Firebird em `backend/services/compras-estoque.service.js` integrando com `digifarma.service.js`.
2. **Requisitos Específicos (R1, F1, F2, F3)**:
   - Calcular média ponderada de vendas dos últimos 30 a 60 dias (peso 0.65 para últimos 30 dias e 0.35 para 31-60 dias).
   - Aplicar margem de segurança configurável (padrão +15%): `estoqueMinimo = Math.ceil(vmdPonderado * 30 * (1 + margem/100))`.
   - Implementar função de gravação direta e atômica no campo `PROD_ESTMINIMO` da tabela `PRODUTOS` no Firebird Digifarma usando transação `READ_COMMITTED` com rollback garantido em caso de erro.
   - Fornecer listagem em tempo real de produtos com ruptura (saldo zero) e produtos com saldo abaixo do estoque mínimo.
   - Fornecer fallback gracioso para cache local SQLite quando o Firebird estiver inacessível.
3. **Verificação**:
   - Criar e rodar testes automatizados para validar todos os cálculos, casos com histórico zerado, margens customizadas e simulações de sincronização.
   - Gravar relatório em `f:\Documentos\Desenvolvimento\BelaFarma\.agents\worker_m1_estoque\handoff.md`.

