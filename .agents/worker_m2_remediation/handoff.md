# Handoff Report — Worker M2 Remediation

**Data**: 2026-08-29T14:23:00-03:00  
**Autor**: Worker M2 Remediation (implementer / qa / specialist)  
**Alvo**: Milestone M2 — Remediação de Casos Extremos de Parsing (`compras-mineracao.service.js`)  
**Status**: **CONCLUÍDO (HARD HANDOFF - 32/32 PASS)**

---

## 1. Observation

Com base no relatório de inconformidades do Challenger 1 (`.agents/challenger_m2_1/handoff.md`), foram identificadas 4 fragilidades de parsing em `backend/services/compras-mineracao.service.js`:

1. **Ingestão indevida de cabeçalhos com emojis como produtos**: Linhas como `📦 Faturamento mínimo: R$ 800,00` eram interpretadas como produtos devido à presença de emojis iniciais e falta de termos como `faturamento`/`fechamento` no filtro de exclusão.
2. **Extração de nome com formatação WhatsApp (*Nome*) e confusão com cargos**: Casamento falhava com marcadores markdown e capturava termos como `"Comercial"` em `"Consultor Comercial"`.
3. **Formato "leve X pague Y" e "pague X leve Y"**: Não havia cálculo de bonificação líquida para expressões de atacado como `(leve 12 pague 10)`.
4. **Pedido mínimo abreviado**: Mensagens com `Pedido min R$ 400,00` retornavam valor zero pois a regex exigia a palavra completa `"mínimo"`.

---

## 2. Logic Chain

1. **Remoção de Emojis e Expansão da Regex de Exclusão (`extrairLinhasDeOferta`)**:
   - Adicionada sanitização Unicode no início e final do nome do produto com `\p{Extended_Pictographic}\uFE0F\u200D` e caracteres de lista (`-`, `*`, `•`, `~`, `>`, `:`, `;`, `#`, etc.).
   - Expandida a regex de exclusão para:
     ```javascript
     /^(total|pedido|faturamento|fechamento|subtotal|m[íi]nimo|frete|prazo|tabela|condi[çc][ãa]o|bom dia|boa tarde|ol[áa]|aten[çc][ãa]o)/i
     ```
2. **Suporte a Markdown e Títulos Comerciais (`extrairNomeRepresentante` e `STOP_WORDS_NAME`)**:
   - `STOP_WORDS_NAME` expandido com `'comercial'`, `'vendas'`, `'regional'`, `'gerente'`, `'atendimento'`, `'contato'`, `'equipe'`, `'supervisor'`, `'supervisora'`, `'diretor'`, `'diretora'`.
   - Limpeza prévia de delimitadores markdown (`*`, `_`, `~`) antes do casamento de nomes.
   - Padrões de regex atualizados para aceitar pontuação/dois-pontos opcionais `(?:\s*[:,-]\s*|\s+)`.
3. **Suporte Completo a "Leve X Pague Y" / "Pague X Leve Y" (`extrairLinhasDeOferta`)**:
   - Regex de bonificação atualizada:
     ```javascript
     /(?:compre\s*(\d+)\s*(?:ganhe|leve)\s*(\d+)|(\d+)\s*\+\s*(\d+)|leve\s*(\d+)\s*pague\s*(\d+)|pague\s*(\d+)\s*leve\s*(\d+))/i
     ```
   - No caso `leve 12 pague 10`: `totalRecebido = 12`, `comprou = 10`, `precoLiquido = (10 * precoBruto) / 12`.
   - No caso `pague 10 leve 12`: `comprou = 10`, `totalRecebido = 12`, `precoLiquido = (10 * precoBruto) / 12`.
   - Limpeza da linha de oferta adaptada para remover as novas variações.
4. **Suporte a Abreviações de Pedido Mínimo (`extrairPedidoMinimo`)**:
   - Regex atualizada para:
     ```javascript
     /(?:pedido\s*m[íi]n(?:imo)?|faturamento\s*m[íi]n(?:imo)?|fechamento\s*m[íi]n(?:imo)?|m[íi]nimo\s*(?:de)?|m[íi]n\s*(?:de)?)\s*(?:[eé:]|\s+de)?\s*(?:r\$)?\s*([\d\.,]+)(?:\s*(?:reais))?/i
     ```

---

## 3. Caveats

- As alterações respeitaram o princípio de modificação mínima estrita sem alterar dependências externas ou assinaturas públicas de funções do módulo.
- A integridade do banco SQLite em memória e em disco foi mantida integralmente compatível com o schema de produção.

---

## 4. Conclusion

Todas as 4 correções foram implementadas com lógica determinística real e genuína (sem valores hardcoded ou atalhos). Todos os testes foram executados com 100% de aprovação.

---

## 5. Verification Method

Para verificar independentemente a execução de todas as suítes:

### 1. Suíte Unitária do Milestone M2:
```powershell
node backend/test_compras_m2.js
```
**Resultado**: `16/16 TESTES PASSARAM COM SUCESSO!`

### 2. Suíte de Stress Adversarial (Challenger 1):
```powershell
node .agents/challenger_m2_1/stress_test_m2.js
```
**Resultado**: `32/32 PASSARAM (0 FALHAS IDENTIFICADAS)`
