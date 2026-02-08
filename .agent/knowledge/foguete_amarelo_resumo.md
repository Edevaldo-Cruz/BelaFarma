# 🚀 Sistema Foguete Amarelo - Resumo Executivo

## 📋 O que foi entregue?

Criei uma **solução completa** para implementar a regra de negócio do **Foguete Amarelo da Cimed** no seu sistema de gestão da farmácia. A solução inclui:

### 📁 Documentos Criados

1. **`foguete_amarelo_implementation.md`** - Documentação técnica completa
2. **`foguete_amarelo_flowchart.txt`** - Diagrama visual do fluxo
3. **`foguete_amarelo_database.sql`** - Script SQL pronto para uso
4. **`foguete_amarelo_resumo.md`** - Este resumo executivo

---

## 🎯 Como Funciona?

### Regra de Negócio
- **Prazo normal**: 120 dias para pagar a nota fiscal completa
- **Regra especial**: Quando você vende um produto dessa nota, o custo dele é cobrado no dia seguinte (D+1)
- **Amortização**: O valor cobrado em D+1 é descontado do total que você pagaria em 120 dias

### Exemplo Prático

```
┌─────────────────────────────────────────────────────────┐
│ DIA 1 - Você recebe a nota fiscal                      │
├─────────────────────────────────────────────────────────┤
│ Valor total: R$ 10.000,00                              │
│ Vencimento: Daqui a 120 dias                           │
│ Saldo devedor: R$ 10.000,00                            │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ DIA 7 - Você vende 5 caixas de Dipirona                │
├─────────────────────────────────────────────────────────┤
│ Custo das 5 caixas: R$ 40,00                           │
│ Sistema cria pagamento para amanhã (D+1): R$ 40,00     │
│ Novo saldo devedor: R$ 9.960,00                        │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ DIA 30 - Após várias vendas                            │
├─────────────────────────────────────────────────────────┤
│ Total já vendido: R$ 3.500,00                          │
│ Saldo devedor: R$ 6.500,00                             │
│ Você economizou R$ 3.500,00 que não precisa pagar!     │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ DIA 120 - Vencimento da nota                           │
├─────────────────────────────────────────────────────────┤
│ Você paga apenas: R$ 6.500,00                          │
│ (em vez de R$ 10.000,00)                               │
└─────────────────────────────────────────────────────────┘
```

---

## 🗄️ Estrutura do Banco de Dados

### Novas Tabelas Necessárias

1. **`invoices`** - Notas fiscais de entrada
   - Armazena informações da nota
   - Flag `is_foguete_amarelo` para identificar

2. **`invoice_items`** - Produtos da nota
   - Cada produto com seu custo
   - Controla quantidade vendida vs. estoque

3. **`sales`** - Vendas realizadas (PDV)
   - Registro de cada venda

4. **`sale_items`** - Produtos vendidos
   - Liga a venda ao lote da nota fiscal

5. **`foguete_amarelo_payments`** - Pagamentos antecipados
   - Cada venda gera um pagamento D+1

6. **`accounts_payable`** - Contas a pagar (atualização)
   - Controla o saldo devedor
   - Mostra quanto já foi amortizado

---

## 💻 Implementação Técnica

### Backend (Node.js + SQLite)

**Principais Endpoints:**

```javascript
POST   /api/invoices              // Cadastrar nota fiscal
POST   /api/sales                 // Registrar venda (com lógica FA)
GET    /api/foguete-amarelo/dashboard  // Dashboard de monitoramento
GET    /api/foguete-amarelo/:id/details // Detalhes de uma nota
```

**Lógica Principal (Pseudocódigo):**

```javascript
// Ao finalizar uma venda:
for (cada produto vendido) {
  // 1. Buscar de qual lote veio (FIFO)
  lote = buscarLoteMaisAntigo(produto);
  
  // 2. Verificar se é Foguete Amarelo
  if (lote.is_foguete_amarelo) {
    custo = quantidade * lote.custo_unitario;
    
    // 3. Criar pagamento D+1
    criarPagamentoAntecipado({
      data: amanha,
      valor: custo
    });
    
    // 4. Abater do saldo
    atualizarSaldo({
      amortizado: +custo,
      restante: -custo
    });
  }
}
```

### Frontend (React + TypeScript)

**Novos Componentes:**

1. **`InvoiceForm.tsx`** - Formulário de entrada de nota
   - Checkbox "É Foguete Amarelo?"
   - Cálculo automático de vencimento (120 dias)

2. **`FogueteAmareloMonitor.tsx`** - Dashboard de monitoramento
   - Cards com cada nota FA
   - Barra de progresso de amortização
   - Histórico de pagamentos

3. **Atualização em `ContasAPagar.tsx`**
   - Badge visual para notas FA
   - Exibição de saldo amortizado

---

## 📊 Dashboard Visual

O sistema mostrará cards como este:

```
╔═══════════════════════════════════════════════════════════╗
║  🚀 NF 12345 - Cimed                                      ║
║  Emissão: 01/02/2026  │  Vencimento: 01/06/2026          ║
╟───────────────────────────────────────────────────────────╢
║  💰 Valor Original:     R$ 10.000,00                      ║
║  ✅ Já Amortizado:      R$  3.500,00  (35%)               ║
║  ⏳ Saldo Restante:     R$  6.500,00                      ║
║                                                           ║
║  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░░  35%         ║
║                                                           ║
║  📦 47 pagamentos antecipados                             ║
║  [Ver Detalhes]  [Histórico]                             ║
╚═══════════════════════════════════════════════════════════╝
```

---

## ✅ Próximos Passos para Implementação

### Fase 1: Banco de Dados (1-2 horas)
- [ ] Adicionar as novas tabelas ao `database.js`
- [ ] Executar migrations
- [ ] Testar com dados de exemplo

### Fase 2: Backend (3-4 horas)
- [ ] Criar endpoints de API
- [ ] Implementar lógica de venda com gatilho FA
- [ ] Implementar dashboard de consulta
- [ ] Testes de integração

### Fase 3: Frontend (4-6 horas)
- [ ] Criar formulário de entrada de nota
- [ ] Criar dashboard de monitoramento
- [ ] Atualizar "Contas a Pagar"
- [ ] Adicionar ao menu principal
- [ ] Testes de interface

### Fase 4: Testes e Ajustes (2-3 horas)
- [ ] Testar fluxo completo
- [ ] Validar cálculos
- [ ] Ajustar UX
- [ ] Documentar para usuários

**Tempo total estimado: 10-15 horas**

---

## 🎓 Conceitos Importantes

### FIFO (First In, First Out)
Quando você tem o mesmo produto em várias notas, o sistema vende primeiro o produto da nota mais antiga. Isso garante que você não tenha produtos vencidos no estoque.

### Amortização
É o processo de ir "pagando aos poucos" a dívida. Cada venda reduz o valor total que você deve.

### D+1 (Dia + 1)
Significa "no dia seguinte". Se você vende hoje, o pagamento é cobrado amanhã.

### Rastreamento de Lote
O sistema precisa saber de qual nota fiscal cada produto vendido veio. Isso é essencial para calcular corretamente o custo.

---

## ⚠️ Pontos de Atenção

### 1. Controle de Estoque
- O sistema precisa rastrear cada produto até sua nota de origem
- Implementar FIFO para consumir produtos mais antigos primeiro

### 2. Cancelamento de Vendas
- Se uma venda for cancelada, é preciso:
  - Reverter a quantidade no estoque
  - Cancelar o pagamento antecipado
  - Restaurar o saldo devedor

### 3. Múltiplas Notas do Mesmo Produto
- Se você tem Dipirona em 3 notas diferentes, o sistema precisa escolher de qual vender
- Critério: Nota mais antiga (FIFO)

### 4. Produtos sem Rastreamento
- Definir o que fazer com produtos que não têm lote identificado
- Opção: Criar lote "genérico" ou não permitir venda

### 5. Notificações
- Alertar quando nota estiver próxima do vencimento
- Notificar quando saldo restante for muito baixo

---

## 📈 Benefícios do Sistema

✅ **Automação Total** - Não precisa calcular manualmente  
✅ **Visibilidade em Tempo Real** - Sabe exatamente quanto deve  
✅ **Controle de Fluxo de Caixa** - Prevê pagamentos futuros  
✅ **Rastreabilidade** - Sabe qual venda gerou qual pagamento  
✅ **Integração** - Funciona junto com "Contas a Pagar"  
✅ **Relatórios** - Histórico completo de amortizações  

---

## 🤝 Suporte à Implementação

Estou à disposição para:
- Esclarecer dúvidas sobre a arquitetura
- Ajudar na implementação do código
- Revisar o código implementado
- Sugerir melhorias e otimizações
- Criar testes automatizados

---

## 📞 Dúvidas Frequentes

**P: E se eu vender mais do que tenho em estoque?**  
R: O sistema deve bloquear a venda ou alertar que não há estoque suficiente.

**P: Posso ter várias notas Foguete Amarelo ao mesmo tempo?**  
R: Sim! O sistema gerencia quantas notas você quiser simultaneamente.

**P: E se eu cancelar uma venda?**  
R: O sistema precisa reverter a amortização e cancelar o pagamento D+1.

**P: Como sei qual produto veio de qual nota?**  
R: O sistema rastreia automaticamente através da tabela `sale_items` que referencia `invoice_items`.

**P: Posso usar isso para outros fornecedores?**  
R: Sim! Basta marcar o checkbox "É Foguete Amarelo?" em qualquer nota.

---

**Documentação criada em:** 08/02/2026  
**Versão:** 1.0  
**Status:** Pronto para implementação
