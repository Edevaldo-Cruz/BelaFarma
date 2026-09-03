# Plan — SWE Light (swe_1)

## Objective
Correção definitiva da coleta e cálculo da informação de "Última Compra" na guia Mineração (Central de Compras), eliminando qualquer divergência com o banco de dados do Digifarma (Firebird).

## Strategy (SWE Light Sequential Refinement)
1. **Dispatch Primary Implementer (teamwork_preview_implementer)**:
   - Pass verbatim user request.
   - Implementer explores, implements, tests R1, R2, R3, R4, and verifies with test suite.
   - Reports verification record.
2. **Review Round 1 (teamwork_preview_reviewer)**:
   - Receives verbatim task + implementer report.
   - Re-derives requirements, stress-tests, breaks and repairs diff, runs test suite.
3. **Review Round 2 (teamwork_preview_reviewer)**:
   - Receives verbatim task + prior reviewer report + open issues ledger.
   - Further adversarial stress testing and verification.
4. **Review Round 3 (teamwork_preview_reviewer)**:
   - Receives verbatim task + prior reviewer report + open issues ledger.
   - Satisfies the 3-round review floor requirement.
5. **Orchestrator Independent Verification**:
   - Inspect diff.
   - Re-run test suite and frontend build.
6. **Victory Audit (teamwork_preview_victory_auditor)**:
   - Independent verification and audit report.
7. **Finalization**:
   - `git push origin main`
   - Completion report to user and parent.
