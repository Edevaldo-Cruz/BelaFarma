
/**
 * Teste de Lógica de Fechamento de Caixa - BelaFarma
 * Este script replica a lógica exata do componente CashClosing.tsx
 * para identificar inconsistências matemáticas ou erros de arredondamento.
 */

function calculateClosing(inputs) {
    const {
        totalSales = 0,
        receivedExtra = 0,
        initialCash = 0,
        totalCreditReceipts = 0,
        totalNonRegistered = 0,
        totalExpenses = 0,
        totalIfood = 0,
        totalCrediario = 0,
        totalInDrawer = 0,
        totalSangria = 0,
        totalDigital = 0
    } = inputs;

    // Lógica do Frontend (CashClosing.tsx:243)
    const subtotalSoma = totalSales + receivedExtra + initialCash + totalCreditReceipts + totalNonRegistered - totalExpenses - totalIfood - totalCrediario;

    // Lógica do Frontend (CashClosing.tsx:246)
    const totalConferido = totalInDrawer + totalSangria + totalDigital;

    // Diferença (CashClosing.tsx:248)
    const diff = totalConferido - subtotalSoma;

    return {
        subtotalSoma,
        totalConferido,
        diff,
        // Versão com correção de arredondamento para comparação
        diffFixed: Number((totalConferido - subtotalSoma).toFixed(2))
    };
}

const scenarios = [
    {
        name: "Cenário 1: Tudo em Dinheiro (Perfeito)",
        inputs: {
            totalSales: 1000,
            initialCash: 100,
            totalInDrawer: 1100, // 1000 venda + 100 troco
        }
    },
    {
        name: "Cenário 2: Misto (Dinheiro + Digital)",
        inputs: {
            totalSales: 1000,
            initialCash: 100,
            totalInDrawer: 600, // 500 venda + 100 troco
            totalDigital: 500   // 500 cartão
        }
    },
    {
        name: "Cenário 3: Com iFood (Dinheiro + iFood)",
        inputs: {
            totalSales: 1000,
            initialCash: 100,
            totalIfood: 200,    // iFood não está na gaveta
            totalInDrawer: 900  // 800 venda física + 100 troco
        }
    },
    {
        name: "Cenário 4: Com Despesa e Sangria",
        inputs: {
            totalSales: 1000,
            initialCash: 100,
            totalExpenses: 50,  // Pago do caixa
            totalSangria: 100,   // Retirado durante o dia
            totalInDrawer: 950, // 1000 + 100 - 50 - 100 = 950
        }
    },
    {
        name: "Cenário 5: Recebimento de Convênio (Crédito)",
        inputs: {
            totalSales: 1000,
            initialCash: 100,
            totalCreditReceipts: 150, // Cliente pagou conta antiga em dinheiro
            totalInDrawer: 1250,      // 1000 + 100 + 150
        }
    },
    {
        name: "Cenário 6: Perigo de Centavos (Floating Point)",
        inputs: {
            totalSales: 100.1,
            initialCash: 50.2,
            totalInDrawer: 150.3
        }
    },
    {
        name: "Cenário 7: O Caso do iFood Não Registrado (POTENCIAL ERRO)",
        inputs: {
            totalSales: 1000,    // Venda do sistema (não inclui o iFood de fora)
            initialCash: 100,
            totalNonRegistered: 0, // Era pra ser 50, mas o código moveu pro iFood
            totalIfood: 50,      // O código subtrai o iFood
            totalInDrawer: 1100, // 1000 + 100. O iFood de 50 é digital e não está aqui.
            totalDigital: 0      // iFood não caiu ainda
        }
    }
];

console.log("=== INICIANDO TESTES DE LÓGICA DE FECHAMENTO ===\n");

scenarios.forEach(s => {
    const result = calculateClosing(s.inputs);
    const status = Math.abs(result.diff) < 0.001 ? "✅ PASSOU" : "❌ FALHOU";
    
    console.log(`[${status}] ${s.name}`);
    console.log(`   Esperado (Subtotal): ${result.subtotalSoma.toFixed(2)}`);
    console.log(`   Conferido (Total):   ${result.totalConferido.toFixed(2)}`);
    console.log(`   Diferença (Diff):    ${result.diff.toFixed(2)}`);
    if (result.diff !== 0 && Math.abs(result.diff) < 0.01) {
        console.log(`   ⚠️ ALERTA: Erro de precisão JS detectado!`);
    }
    console.log("-".repeat(30));
});

console.log("\n=== FIM DOS TESTES ===");
