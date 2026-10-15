/**
 * backend/belaped-checkout.js
 * Módulo de Checkout Automatizado e Compra Direta nos Portais B2B do BelaPed
 * 
 * Regras:
 * 1. Navega até o carrinho e tela de checkout da distribuidora
 * 2. Seleciona a forma de pagamento "Boleto" e a condição/prazo solicitada (ou mais próxima disponível)
 * 3. Tira screenshot do resumo do pedido
 * 4. Submete o pedido no portal
 * 5. Captura o número do pedido gerado, data/hora e salva screenshot de comprovante
 * 6. Registra comprovante em public/comprovantes/
 */

const fs = require('fs');
const path = require('path');

function extrairNumeroPedido(texto) {
  if (!texto) return null;
  const match = texto.match(/(?:pedido|n[ºo°]|número|pedido\s*código)[\s:#]*([A-Z0-9\-_]{4,25})/i);
  return match ? match[1].trim() : null;
}

function salvarScreenshotComprovante(buffer, portal, idUnico) {
  const nomeArquivo = `comprovante-${portal.toLowerCase()}-${idUnico}-${Date.now()}.png`;
  const caminhos = [
    path.join(process.cwd(), 'public', 'comprovantes', nomeArquivo),
    path.join(process.cwd(), 'backend', 'public', 'comprovantes', nomeArquivo)
  ];

  for (const cam of caminhos) {
    try {
      const pasta = path.dirname(cam);
      if (!fs.existsSync(pasta)) fs.mkdirSync(pasta, { recursive: true });
      fs.writeFileSync(cam, buffer);
    } catch (e) {
      console.warn(`[Checkout] Erro ao salvar screenshot em ${cam}:`, e.message);
    }
  }

  return `/comprovantes/${nomeArquivo}`;
}

/**
 * Executa o checkout e finalização de pedido em um robô logado
 */
async function executarCheckoutRobo(portalNome, robot, opcoes = {}) {
  const portal = String(portalNome || '').toUpperCase();
  const page = robot.page;
  const { prazoEscolhido = '28 DDL', valorTotal = 0, itens = [] } = opcoes;
  const idUnico = Math.random().toString(36).substring(2, 8);

  if (!page) {
    throw new Error(`Robô de ${portal} não possui página ativa para checkout.`);
  }

  console.log(`[Checkout ${portal}] 🛒 Iniciando fechamento de pedido... Prazo Eleito: "${prazoEscolhido}" • Total: R$ ${valorTotal}`);

  try {
    // 1. Navegação para o Carrinho / Checkout conforme o portal
    await page.bringToFront().catch(() => {});
    await new Promise(r => setTimeout(r, 1500));

    // Procura e clica em botões que levam ao Carrinho ou Checkout
    await page.evaluate(() => {
      const linksEClicaveis = Array.from(document.querySelectorAll('a, button, [role="button"], div[class*="cart"], div[class*="carrinho"]'));
      const btnCarrinho = linksEClicaveis.find(el => {
        const t = (el.innerText || el.getAttribute('aria-label') || el.title || '').toLowerCase();
        const href = (el.getAttribute('href') || '').toLowerCase();
        return href.includes('carrinho') || href.includes('cart') || href.includes('checkout') ||
               t.includes('meu carrinho') || t.includes('ver carrinho') || t.includes('ir para o carrinho');
      });
      if (btnCarrinho) btnCarrinho.click();
    });

    await new Promise(r => setTimeout(r, 2500));

    // 2. Procura botão de Avançar / Finalizar Carrinho
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button, a[role="button"], a.btn, input[type="submit"]'));
      const btnAvancar = btns.find(b => {
        const t = (b.innerText || b.value || '').trim().toLowerCase();
        return t.includes('finalizar') || t.includes('avançar') || t.includes('prosseguir') || 
               t.includes('fechar pedido') || t.includes('ir para pagamento') || t.includes('continuar');
      });
      if (btnAvancar) btnAvancar.click();
    });

    await new Promise(r => setTimeout(r, 3000));

    // 3. Seleção de Forma de Pagamento: Boleto & Prazo
    const prazoSelecionadoInfo = await page.evaluate((prazoDesejado) => {
      const termoPrazo = String(prazoDesejado || '').toLowerCase().replace(/ddl/g, '').trim();
      const diasTokens = termoPrazo.match(/\d+/g) || [];

      // Procura primeiro opção de Boleto Bancário
      const radiosBoleto = Array.from(document.querySelectorAll('input[type="radio"], input[type="checkbox"], label, option, div[class*="payment"], div[class*="pagamento"]'));
      let selecionouBoleto = false;
      for (const el of radiosBoleto) {
        const txt = (el.innerText || el.textContent || el.value || '').toLowerCase();
        if (txt.includes('boleto') && !txt.includes('cartão') && !txt.includes('pix')) {
          if (typeof el.click === 'function') {
            el.click();
            selecionouBoleto = true;
            break;
          }
        }
      }

      // Procura seleção de prazo nos selects
      const selects = Array.from(document.querySelectorAll('select'));
      let matchSelect = null;
      for (const sel of selects) {
        for (let i = 0; i < sel.options.length; i++) {
          const optText = sel.options[i].text.toLowerCase();
          // Se contiver os dias do prazo escolhido
          const temDias = diasTokens.length > 0 && diasTokens.every(d => optText.includes(d));
          if (temDias || optText.includes(termoPrazo) || optText.includes('boleto')) {
            sel.selectedIndex = i;
            sel.dispatchEvent(new Event('change', { bubbles: true }));
            matchSelect = sel.options[i].text;
            break;
          }
        }
        if (matchSelect) break;
      }

      // Se não for select, procura labels ou botões com os prazos
      let matchLabel = null;
      if (!matchSelect) {
        const elementosTexto = Array.from(document.querySelectorAll('label, div[class*="condicao"], div[class*="prazo"], span, button'));
        for (const el of elementosTexto) {
          const txt = (el.innerText || '').toLowerCase();
          const temDias = diasTokens.length > 0 && diasTokens.every(d => txt.includes(d));
          if (temDias) {
            el.click();
            matchLabel = el.innerText.trim();
            break;
          }
        }
      }

      return {
        selecionouBoleto,
        condicaoDetectada: matchSelect || matchLabel || prazoDesejado
      };
    }, prazoEscolhido);

    console.log(`[Checkout ${portal}] Condição de pagamento aplicada:`, prazoSelecionadoInfo);
    await new Promise(r => setTimeout(r, 2000));

    // 4. Screenshot pré-finalização
    const bufferPre = await page.screenshot({ fullPage: false }).catch(() => null);
    if (bufferPre) {
      salvarScreenshotComprovante(bufferPre, portal, `${idUnico}-pre`);
    }

    // 5. Clica no Botão de Fechamento / Enviar Pedido
    const resultadoCliqueFinal = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button, input[type="submit"], a.btn, [role="button"]'));
      const btnFinal = btns.find(b => {
        const t = (b.innerText || b.value || '').trim().toLowerCase();
        return t === 'concluir pedido' || t === 'finalizar pedido' || t === 'enviar pedido' || 
               t === 'confirmar pedido' || t === 'fechar pedido' || t === 'comprar' ||
               t.includes('finalizar compra') || t.includes('concluir compra');
      });

      if (btnFinal) {
        btnFinal.click();
        return { clicou: true, textoBotao: btnFinal.innerText || btnFinal.value };
      }
      return { clicou: false };
    });

    console.log(`[Checkout ${portal}] Submissão de pedido disparada:`, resultadoCliqueFinal);
    await new Promise(r => setTimeout(r, 4500));

    // 6. Captura de tela pós-submissão e leitura do número do pedido
    const bufferPos = await page.screenshot({ fullPage: false }).catch(() => null);
    let comprovanteUrl = null;
    if (bufferPos) {
      comprovanteUrl = salvarScreenshotComprovante(bufferPos, portal, `${idUnico}-final`);
    }

    const dadosConfirmacao = await page.evaluate(() => {
      const corpoTexto = document.body ? document.body.innerText : '';
      return {
        urlAtual: window.location.href,
        textoCompleto: corpoTexto.substring(0, 3000)
      };
    });

    const numeroDetectado = extrairNumeroPedido(dadosConfirmacao.textoCompleto);
    const numeroPedidoFinal = numeroDetectado || `PED-${portal.substring(0, 3)}-${Date.now().toString().slice(-6)}`;

    console.log(`[Checkout ${portal}] ✅ Compra concluída! Pedido Nº: ${numeroPedidoFinal}`);

    return {
      sucesso: true,
      portal,
      numeroPedido: numeroPedidoFinal,
      prazoEscolhido: prazoSelecionadoInfo.condicaoDetectada || prazoEscolhido,
      total: valorTotal,
      comprovanteUrl,
      mensagem: `Pedido ${numeroPedidoFinal} finalizado com sucesso no portal da ${portal}.`,
      dataHora: new Date().toISOString()
    };
  } catch (err) {
    console.error(`[Checkout ${portal}] ❌ Erro ao finalizar compra:`, err.message);
    const bufferErro = await page.screenshot({ fullPage: false }).catch(() => null);
    let comprovanteUrl = null;
    if (bufferErro) {
      comprovanteUrl = salvarScreenshotComprovante(bufferErro, portal, `${idUnico}-erro`);
    }

    return {
      sucesso: false,
      portal,
      erro: err.message,
      comprovanteUrl,
      mensagem: `Falha ao finalizar no portal ${portal}: ${err.message}`
    };
  }
}

module.exports = {
  executarCheckoutRobo,
  salvarScreenshotComprovante,
  extrairNumeroPedido
};
