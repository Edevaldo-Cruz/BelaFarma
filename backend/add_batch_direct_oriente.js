const puppeteer = require('puppeteer');
const path = require('path');
const os = require('os');

const itemsToAdd = [
  // --- MEDICAMENTOS (RUPTURA & ALTO GIRO) ---
  { ean: '7896004749730', qtd: 20, desc: 'TADALAFILA 20MG 4CPR' },
  { ean: '7896112181729', qtd: 15, desc: 'OMEPRAZOL 20MG 56CPS' },
  { ean: '7891721027468', qtd: 10, desc: 'METFORMINA 500MG XR 30CPR' },
  { ean: '7894916146012', qtd: 6, desc: 'ROSUVASTATINA 20MG 30CPR' },
  { ean: '7898216368730', qtd: 6, desc: 'ESCITALOPRAM 10MG 30CPR' },
  { ean: '7896112127437', qtd: 6, desc: 'DEXCLORFENIRAMINA + BETAMETASONA 120ML' },
  { ean: '7896714212104', qtd: 8, desc: 'PREDNISONA 20MG 10CPR' },
  { ean: '7899620911956', qtd: 10, desc: 'FLUCONAZOL 150MG 2CPR' },
  { ean: '7896862918583', qtd: 10, desc: 'HIDROCLOROTIAZIDA 25MG 30CPR' },

  // --- PERFUMARIA, HIGIENE & BARBA ---
  { ean: '7896049528512', qtd: 12, desc: 'DESOD HERBISSIMO CREME 55G' },
  { ean: '7891800649529', qtd: 10, desc: 'ALGODAO MULTIUSO TOPZ 25G' },
  { ean: '7891150059917', qtd: 12, desc: 'SABONETE LUX 85G' },
  { ean: '7898422746759', qtd: 8, desc: 'SABONETE DOVE ORIGINAL 90G' },
  { ean: '7896004814162', qtd: 10, desc: 'HASTES FLEXIVEIS TOPZ 75UN' },
  { ean: '7896902211063', qtd: 6, desc: 'OLEO AMENDOAS FARMAX 100ML' },
  { ean: '7896902210479', qtd: 10, desc: 'ALCOOL 70% FARMAX 50ML' },
  { ean: '7891350011043', qtd: 6, desc: 'BOZZANO CREME DE BARBEAR ALOE VERA 65G' },
  { ean: '7891350011623', qtd: 6, desc: 'BOZZANO CREME DE BARBEAR PELE SENSIVEL 65G' }
];

async function addBatchDirect() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', `--user-data-dir=${path.join(os.tmpdir(), 'batch_or_' + Date.now())}`]
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  console.log('[Oriente] Autenticando...');
  await page.goto('https://pedidoweb.orientefarma.com.br/auth/login', { waitUntil: 'networkidle2' });
  await page.waitForSelector('input#email', { timeout: 15000 });
  await page.type('input#email', 'belafarmasul@gmail.com');
  await page.type('input#senha', 'Bfs@882494');
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => (b.innerText || '').trim() === 'Entrar');
    if (btn) btn.click();
  });

  await new Promise(r => setTimeout(r, 4000));
  console.log('[Oriente] Confirmando loja...');
  await page.evaluate(() => {
    const sel = document.querySelector('select[name="codigoLoja"]');
    if (sel && sel.options[1]) {
      sel.value = sel.options[1].value;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }
    const btnConf = Array.from(document.querySelectorAll('button')).find(b => (b.innerText || '').toLowerCase().includes('confirmar'));
    if (btnConf) btnConf.click();
  });

  await new Promise(r => setTimeout(r, 3000));
  await page.evaluate(() => {
    const allEls = Array.from(document.querySelectorAll('div, td, span, button'));
    const opt = allEls.find(d => (d.innerText || '').includes('PE ORIENTE FARMA') && (d.innerText || '').includes('96'));
    if (opt) opt.click();
    const btn = Array.from(document.querySelectorAll('button')).find(b => (b.innerText || '').toLowerCase().includes('confirmar'));
    if (btn) btn.click();
  });

  await new Promise(r => setTimeout(r, 4000));

  console.log('[Oriente] Inserindo lote no carrinho...');
  const res = await page.evaluate(async (lista) => {
    const log = [];
    const condicao = 96;
    let codCliente = 299103;

    // Obtém idCarrinho ativo
    let idCarrinho = 74881;
    try {
      const rCart = await fetch(`/api/carrinho/cliente/${codCliente}?codigoCondicaoComercial=${condicao}`, { credentials: 'include' });
      if (rCart.ok) {
        const dCart = await rCart.json();
        const found = dCart.codigoCarrinho || dCart.id || (dCart.carrinho && (dCart.carrinho.codigoCarrinho || dCart.carrinho.id));
        if (found) idCarrinho = found;
      }
    } catch (_) {}

    for (const item of lista) {
      try {
        const urlProd = `/api/produtos/condicao/${condicao}?codigoCliente=${codCliente}&termo=${encodeURIComponent(item.ean)}&pagina=1&tamanhoPagina=10&apenasComEstoque=true&ordenarPor=5&diasRetroativos=100`;
        const rProd = await fetch(urlProd, { credentials: 'include' });
        if (!rProd.ok) {
          log.push({ item: item.desc, ean: item.ean, ok: false, motivo: 'HTTP ' + rProd.status });
          continue;
        }
        const dProd = await rProd.json();
        const prods = dProd.produtos || [];
        const prod = prods.find(p => String(p.codigoBarras || '').trim() === item.ean) || prods[0];

        if (!prod || !prod.codigoProduto) {
          log.push({ item: item.desc, ean: item.ean, ok: false, motivo: 'Produto indisponivel' });
          continue;
        }

        const rPost = await fetch(`/api/carrinho/${idCarrinho}/itens`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            codigoProduto: Number(prod.codigoProduto),
            codigoCondicaoComercial: Number(condicao),
            quantidade: Number(item.qtd)
          })
        });

        if (rPost.ok) {
          log.push({
            item: item.desc,
            descricaoPortal: prod.descricao,
            ean: prod.codigoBarras,
            qtd: item.qtd,
            preco: prod.precoLiquido || prod.preco,
            ok: true
          });
        } else {
          log.push({ item: item.desc, ean: item.ean, ok: false, status: rPost.status });
        }
      } catch (e) {
        log.push({ item: item.desc, ean: item.ean, ok: false, erro: e.message });
      }
    }

    // Valida separação e status das cotas/mínimos do carrinho
    let statusSeparacao = null;
    try {
      const rVal = await fetch(`/api/carrinho/${idCarrinho}/validar-separacao`, { credentials: 'include' });
      if (rVal.ok) statusSeparacao = await rVal.json();
    } catch (_) {}

    // Pega o resumo do carrinho
    let resumoCarrinho = null;
    try {
      const rTot = await fetch(`/api/carrinho/${idCarrinho}`, { credentials: 'include' });
      if (rTot.ok) resumoCarrinho = await rTot.json();
    } catch (_) {}

    return { idCarrinho, log, statusSeparacao, resumoCarrinho };
  }, itemsToAdd);

  console.log('=== PROCESSAMENTO FINALIZADO ===');
  console.log('Carrinho ID:', res.idCarrinho);
  console.log('\n--- ITENS PROCESSADOS ---');
  res.log.forEach(l => {
    if (l.ok) {
      console.log(`✅ [OK] ${l.item} | Qtd: ${l.qtd} | Preço: R$ ${l.preco} | Portal: ${l.descricaoPortal}`);
    } else {
      console.log(`❌ [FALHA] ${l.item} (${l.ean}) -> ${l.motivo || l.status || l.erro}`);
    }
  });

  if (res.statusSeparacao) {
    console.log('\n--- STATUS SEPARAÇÃO / MÍNIMOS ---');
    console.log(JSON.stringify(res.statusSeparacao, null, 2));
  }
  if (res.resumoCarrinho) {
    console.log('\n--- RESUMO DO CARRINHO ---');
    const c = res.resumoCarrinho;
    console.log(`Valor Total: R$ ${c.valorTotal || c.total || '-'}`);
    console.log(`Total de Itens: ${c.quantidadeItens || (c.itens || []).length}`);
  }

  await browser.close();
}

addBatchDirect().catch(console.error);
