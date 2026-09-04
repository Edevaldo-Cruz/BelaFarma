## 2026-09-04T12:24:00Z
Você é o Worker responsável pela implementação do Milestone M2: Inteligência de Estoque e Sincronização Resiliente da BelaFarma.

Seu diretório exclusivo de trabalho é:
f:\Documentos\Desenvolvimento\BelaFarma\.agents\worker_m2

Arquivos sob sua posse exclusiva de escrita:
- backend/services/medicamentos-busca.service.js (novo arquivo)
- backend/services/compras-estoque.service.js (ajuste de fórmulas de 30d/2x e retrocompatibilidade)

LEIA OS DOCUMENTOS OBRIGATÓRIOS ANTES DE QUALQUER COISA:
- f:\Documentos\Desenvolvimento\BelaFarma\.agents\ORIGINAL_REQUEST.md (seção '## 2026-09-04T12:09:33Z')
- f:\Documentos\Desenvolvimento\BelaFarma\PROJECT.md
- f:\Documentos\Desenvolvimento\BelaFarma\TEST_INFRA.md
- f:\Documentos\Desenvolvimento\BelaFarma\TEST_READY.md
- f:\Documentos\Desenvolvimento\BelaFarma\backend\test_motor_busca_medicamentos.js
- f:\Documentos\Desenvolvimento\BelaFarma\.agents\explorer_survey_2\handoff.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

OBJETIVO DA IMPLEMENTAÇÃO:
1. Criar backend/services/medicamentos-busca.service.js implementando rigorosamente os contratos:
   - calcularInteligenciaEstoque(saldo, vmd, margem = 15, curvaAbc = 'C', ativo = true):
     - vmdPonderado = Number(vmd) || 0
     - est_minimo_calculado = Math.ceil(vmdPonderado * 30 * (1 + margem / 100))
     - Se curvaAbc === 'A' e ativo e vmdPonderado > 0, garantir est_minimo_calculado = Math.max(2, est_minimo_calculado)
     - Se vmdPonderado === 0, est_minimo_calculado = 0
     - est_maximo_calculado = est_minimo_calculado * 2 (rigorosamente o dobro do mínimo)
     - qtd_sugerida_compra = Math.max(0, est_minimo_calculado - saldo)
     - Status:
       - saldo <= 0 -> RUPTURA
       - 0 < saldo < est_minimo_calculado -> ABAIXO_MINIMO
       - est_minimo_calculado <= saldo <= est_maximo_calculado -> NORMAL
       - saldo > est_maximo_calculado -> EXCESSO
   - resolverPrecoVigente(produto, dataRef = new Date()):
     - Avalia inicio_promocao e termino_promocao (fim do dia até 23:59:59.999).
     - Se dentro da vigência e preco_promocional > 0, retorna preco_promocional e flag promocaoAtiva: true.
     - Caso contrário, retorna preco_normal e promocaoAtiva: false.
   - buscarMedicamentos(db, { q, status, curva, limit = 20, offset = 0 }):
     - Consulta indexada ultrarrápida (< 10ms) em compras_estoque_cache.
     - Suporte a busca por ID (WHERE produto_id = ?), EAN (WHERE ean = ?) ou termo (WHERE descricao LIKE ?).
     - Suporte a filtros opcionais por status_ruptura e curva_abc.
     - Retorna { total, page, limit, items } onde cada item inclui todos os campos unificados de identificação, estoque, preço vigente e última compra.
   - obterMedicamentoPorId(db, id):
     - Busca indexada por ID (ou EAN como fallback se id for string/código de barras).
     - Retorna o objeto consolidado ou null.
   - obterRupturas(db, { curva, limit = 50, offset = 0 }):
     - Lista itens com status_ruptura IN ('RUPTURA', 'ABAIXO_MINIMO'), ordenados por criticidade de ruptura e maior defasagem para 30 dias.
     - Retorna { total, total_orcado_30d, items }.
   - sincronizarEstoqueMedicamentos(db, options = {}):
     - Extrai do Firebird (ou do cache local SQLite se offline/timeout/forceOffline) o catálogo de produtos ativos, vendas 30/60/90d, promoções e notas de entrada.
     - Aplica as regras de inteligência de estoque e preço vigente.
     - Realiza upsert atômico na tabela compras_estoque_cache via transação SQLite.
     - Resiliência total: Em caso de falha de rede/Firebird inacessível, processa e recalcula usando o cache SQLite local, retornando { success: true, fromCache: true, totalSincronizados, itensCriticos } sem lançar erro não tratado.

2. Em backend/services/compras-estoque.service.js:
   - Atualizar a fórmula de estoque mínimo para 30 dias de giro sem ruptura: Math.ceil(demanda30d * fatorMargem).
   - Fixar o estoque máximo como estritamente estoqueMinimo * 2.
   - Ajustar calcularDemandaPonderada para suportar retrocompatibilidade:
     - Se chamado com 3 argumentos (v30, v60, margem), calcular com os dois períodos legados e a margem informada.
     - Se chamado com 4 argumentos (v30, v60, v90, margem), calcular com os 3 períodos ponderados.
   - Ajustar quantidade sugerida de reposição para Math.max(0, est_minimo_calculado - saldo).

3. Executar e validar a conformidade:
   - node backend/test_motor_busca_medicamentos.js
   - node backend/test_compras_estoque.js
   - node backend/test_ultimas_compras_mineracao.js

4. Escrever o relatório completo em:
   f:\Documentos\Desenvolvimento\BelaFarma\.agents\worker_m2\handoff.md.
   Avise seu orchestrator via send_message ao concluir.
