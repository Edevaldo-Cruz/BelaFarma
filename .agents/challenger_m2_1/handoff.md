# Handoff Report — Challenger 1: Milestone M2 (Offer Parsing & Edge Cases)

**Data**: 2026-08-29T17:20:00Z  
**Autor**: Challenger 1 (critic / specialist)  
**Veredito**: **REQUEST_CHANGES**  
**Alvo**: Milestone M2 — Motor de Mineração Histórica, Parsing de Ofertas e Casos de Borda (`compras-mineracao.service.js` / `baileys-compras-service.js`)

---

## 1. Observation

Durante a execução da suíte de testes de stress adversarial `f:\Documentos\Desenvolvimento\BelaFarma\.agents\challenger_m2_1\stress_test_m2.js`, foram executados **32 testes de carga e casos de borda** distribuídos em 8 suítes temáticas.

### Comando Executado:
```powershell
node f:\Documentos\Desenvolvimento\BelaFarma\.agents\challenger_m2_1\stress_test_m2.js
```

### Resultado Geral:
- **Testes Executados**: 32
- **Aprovados (PASS)**: 28
- **Falhas Encontradas (FAIL)**: 4

---

### Falhas Observadas em Detalhe:

#### Observação 1: Ingestão de Falsas Ofertas a partir de Cabeçalhos com Emojis (`[SUITE 1] 1.2`)
- **Arquivo**: `backend/services/compras-mineracao.service.js` (linhas 313–323)
- **Texto de Entrada**:
  ```text
  🔥🚨 *MEGA OFERTA PANPHARMA* 🚨🔥
  Fala Dr. Edevaldo! 👨‍⚕️💊 Aqui é o *Bruno* da *Panpharma* trazendo os melhores preços de genéricos da Eurofarma!
  📦 Faturamento mínimo: R$ 800,00
  💳 Condição: 30/60/90 dias

  🎯 *CONFIRA AS OFERTAS:* 🎯
  💥 7891058001122 Amoxicilina 500mg 21 caps por R$ 9,80
  💥 7896004701234 Losartana 50mg c/ 30 cp R$ 1,75
  💥 Omeprazol 20mg c/ 28 caps R$ 3,90
  ```
- **Comportamento Observado**: A função `extrairLinhasDeOferta` retornou **4 ofertas** em vez de 3.
- **Causa**: A linha `📦 Faturamento mínimo: R$ 800,00` foi catalogada como um produto chamado `"📦 Faturamento mínimo:"` com preço `800.00`.
- **Código Relevante**:
  ```javascript
  // compras-mineracao.service.js:313
  if (nomeProduto.length >= 3 && !/^(total|pedido|subtotal|mínimo|frete|prazo|bom dia|boa tarde|olá)/i.test(nomeProduto)) {
    ofertas.push({ produtoNome: nomeProduto, ... });
  }
  ```
  O filtro `!/^(total|pedido|...)/i` falha quando a linha possui emojis (ex: `📦 `) ou usa o termo `faturamento`/`fechamento` em vez de `pedido`.

#### Observação 2: Extração de Nome do Representante Falha com Bolding do WhatsApp e Títulos (`[SUITE 1] 1.2` e `1.3`)
- **Arquivo**: `backend/services/compras-mineracao.service.js` (linhas 200–226)
- **Caso A (Markdown `*Bruno*`)**: Em textos com formatação do WhatsApp (`Aqui é o *Bruno*`), `extrairNomeRepresentante` retornou `null` porque `[A-ZÀ-Úa-zà-ú]+` não casa com `*` ou `_`.
- **Caso B (Cargo/Função Comercial)**: No texto:
  ```text
  Atenciosamente,
  Marcio Ferreira
  Consultor Comercial - Distribuidora Profarma
  ```
  `extrairNomeRepresentante` retornou `"Comercial"` em vez de `"Marcio Ferreira"`.
- **Causa**: O regex `/(?:representante|vendedor(?:a)?|consultor(?:a)?)\s+([A-ZÀ-Úa-zà-ú]+(?:\s+[A-ZÀ-Úa-zà-ú]+)?)/i` casou com `"Consultor Comercial"`, e a palavra `"Comercial"` não estava na lista `STOP_WORDS_NAME`.

#### Observação 3: Ausência de Reconhecimento do Formato "Leve X Pague Y" / "Pague X Leve Y" (`[SUITE 3] 3.7`)
- **Arquivo**: `backend/services/compras-mineracao.service.js` (linhas 272–291)
- **Texto de Entrada**: `- Dipirona 500mg cx 100 R$ 2,40 (leve 12 pague 10)`
- **Comportamento Observado**: O preço ofertado permaneceu `2.40` e o texto do produto ficou `'Dipirona 500mg  (leve 12 pague 10'`.
- **Causa**: O regex de bonificação apenas busca `compre X ganhe Y`, `compre X leve Y` ou `X+Y`, mas ignora `leve X pague Y` ou `pague X leve Y`. O cálculo correto deveria ser `(10 * 2.40) / 12 = 2.00`.

#### Observação 4: Variações Abreviadas de Pedido Mínimo Não Detectadas (`[SUITE 5] 5.6`)
- **Arquivo**: `backend/services/compras-mineracao.service.js` (linhas 129–152)
- **Texto de Entrada**: `Pedido min R$ 400,00 para entrega amanhã.`
- **Comportamento Observado**: `extrairPedidoMinimo` retornou `{ valor: 0, condicoes: null }`.
- **Causa**: O regex `/(?:pedido\s*m[íi]nimo|faturamento\s*m[íi]nimo...)/i` exige a palavra completa `"mínimo"` e não aceita a abreviação `"min"`.

---

## 2. Logic Chain

1. **Premissa de Negócio**: O Milestone M2 tem como missão a mineração contínua e autônoma de conversas reais de representantes de distribuidoras no WhatsApp.
2. **Impacto da Observação 1 (Falsas Ofertas)**: Representantes frequentemente informam condições de faturamento mínimo com emojis (ex: `📦 Faturamento mínimo: R$ 800,00`). Ao interpretar essa linha como um produto ofertado, o sistema:
   - Polui a tabela `compras_oportunidades_mineradas` com falsos medicamentos;
   - Distorce os alertas de oportunidade e o comparador de preços.
3. **Impacto da Observação 2 (Nome do Representante)**: No WhatsApp, o uso de negrito (`*Nome*`) é o padrão de 80%+ dos encartes comerciais. Além disso, cadastrar o representante com o nome de `"Comercial"` impede a identificação humana correta na Fila de Aprovação (M4).
4. **Impacto da Observação 3 (Bonificação Leve/Pague)**: No atacado farmacêutico, `"leve 12 pague 10"` é uma das formas mais comuns de bonificação em medicamentos similares e MIPs. Não calcular o preço líquido prejudica o ranking de cotação ponderada (M3).
5. **Impacto da Observação 4 (Pedido Mínimo Abreviado)**: Mensagens informais como `"pedido min 400"` deixam o cadastro do fornecedor com pedido mínimo R$ 0,00, afetando o algoritmo de otimização de faturamento mínimo (M3 / F9).
6. **Conclusão Lógica**: O motor de mineração está com excelente arquitetura e passou em 28 testes complexos (prazos estendidos, encartes densos, bonificações compostas com desconto percentual, detecção de ruptura, isolamento Baileys e persistência SQLite), porém necessita de ajustes pontuais de robustez de parsing antes de ser homologado.

---

## 3. Caveats

- Não foram alterados arquivos de implementação pelo Challenger (em estrita conformidade com a regra de review-only).
- Transcrição de áudio via Whisper/STT não foi avaliada diretamente pois o serviço atual opera sobre mensagens de texto, imagens com legenda e documentos.
- Todos os testes de banco foram executados em SQLite com schemas idênticos aos de produção.

---

## 4. Conclusion & Actionable Recommendations

**Veredito**: **REQUEST_CHANGES**

O Worker M2 deve aplicar as seguintes 4 correções em `backend/services/compras-mineracao.service.js`:

1. **Limpeza de Linhas de Exclusão em Ofertas**:
   - Em `extrairLinhasDeOferta`, remover emojis e caracteres de pontuação iniciais antes de verificar palavras proibidas.
   - Expandir a regex de exclusão para:
     ```javascript
     /^(total|pedido|faturamento|fechamento|subtotal|m[íi]nimo|frete|prazo|bom dia|boa tarde|ol[áa]|aten[çc][ãa]o)/i
     ```
2. **Suporte a Markdown e Títulos na Extração de Nomes**:
   - Adicionar `'comercial'`, `'vendas'`, `'regional'`, `'gerente'`, `'atendimento'` ao array `STOP_WORDS_NAME`.
   - Limpar delimitadores markdown (`*`, `_`, `~`) antes do parsing de nomes ou incluí-los opcionalmente nas regexes.
   - Permitir dois-pontos opcional em `/(?:representante|vendedor(?:a)?|consultor(?:a)?)(?:\s*:\s*|\s+)/i`.
3. **Suporte Completo ao Formato "Leve X Pague Y"**:
   - Atualizar a regex de bonificação para incluir:
     ```javascript
     /(?:compre\s*(\d+)\s*(?:ganhe|leve)\s*(\d+)|(\d+)\s*\+\s*(\d+)|leve\s*(\d+)\s*pague\s*(\d+)|pague\s*(\d+)\s*leve\s*(\d+))/i
     ```
   - No caso de `leve 12 pague 10`: `comprou = 10`, `totalRecebido = 12`, `precoLiquido = (comprou * precoBruto) / totalRecebido`.
4. **Suporte a Abreviação de Mínimo**:
   - Em `extrairPedidoMinimo`, atualizar para:
     ```javascript
     /(?:pedido\s*m[íi]n(?:imo)?|faturamento\s*m[íi]n(?:imo)?|fechamento\s*m[íi]n(?:imo)?|m[íi]nimo\s*(?:de)?)\s*(?:[eé:]|\s+de)?\s*(?:r\$)?\s*([\d\.,]+)/i
     ```

---

## 5. Verification Method

Para verificar independentemente a suíte de testes de stress:

```powershell
node f:\Documentos\Desenvolvimento\BelaFarma\.agents\challenger_m2_1\stress_test_m2.js
```

### Critério de Invalidação:
- Todas as 32 asserções passarem com status `PASS` (0 falhas).
