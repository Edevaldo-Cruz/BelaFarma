/**
 * Testador Automatizado de Links e Auditor de Cotações do BelaPed
 * 
 * Objetivo:
 * Entra nos links gerados pelo BelaPed para 1º e 2º colocados,
 * inspeciona a página real de cada distribuidora via sessão autenticada do Puppeteer e valida:
 * 1. O link abriu a página correta?
 * 2. O produto tem estoque real disponível para compra (sem "Avise-me", "Já vendemos todo o estoque", "Sem estoque")?
 * 3. O preço exibido na tela confere com o preço cotado no BelaPed?
 * 
 * Se encontrar falhas:
 * - Salva screenshot da tela em data/auditoria_links/
 * - Se executado com --fix, invalida a cotação automaticamente no banco SQLite
 * 
 * Uso:
 *   node backend/testador-links-cotacoes.cjs [--portal=SOTON|DISTRIMED|DPC|MARTINS|TODOS] [--limite=10] [--fix]
 */

const fs = require('fs');
const path = require('path');
const db = require('./database.js');

// Importa os robôs já configurados do BelaPed
const { SotonRobot } = require('./belaped-robot-soton.js');
const { DpcRobot } = require('./belaped-robot-dpc.js');
const { MartinsRobot } = require('./belaped-robot-martins.js');
const { DistrimedRobot } = require('./belaped-robot-distrimed.js');
const { ProfarmaRobot } = require('./belaped-robot-profarma.js');
const { DivimedRobot } = require('./belaped-robot-divimed.js');

// Configurações e diretório de screenshots de auditoria
const DIR_SCREENSHOTS = path.join(__dirname, '..', 'data', 'auditoria_links');
if (!fs.existsSync(DIR_SCREENSHOTS)) {
  fs.mkdirSync(DIR_SCREENSHOTS, { recursive: true });
}

// Argumentos de linha de comando
const args = process.argv.slice(2);
const portalFiltro = (args.find(a => a.startsWith('--portal=')) || '').replace('--portal=', '').toUpperCase() || 'TODOS';
const limite = parseInt((args.find(a => a.startsWith('--limite=')) || '').replace('--limite=', ''), 10) || 5;
const deveCorrigir = args.includes('--fix');

console.log('================================================================');
console.log('🔍 AUDITOR AUTOMATIZADO DE LINKS & ESTOQUE REAL (BELAPED)');
console.log(`- Portal Alvo: ${portalFiltro}`);
console.log(`- Limite de Produtos por Portal: ${limite}`);
console.log(`- Modo Auto-Correção (--fix): ${deveCorrigir ? 'ATIVADO (invalida falsos no banco)' : 'DESATIVADO (apenas diagnóstico)'}`);
console.log(`- Diretório de Provas (Screenshots): ${DIR_SCREENSHOTS}`);
console.log('================================================================\n');

// Obter os itens do banco para auditoria (focando em 1º e 2º colocados com cotação ativa)
function buscarItensParaAuditoria(portal, maxItens) {
  let whereFornecedor = '';
  if (portal && portal !== 'TODOS') {
    if (portal.includes('SOTON')) whereFornecedor = "AND c.fornecedor LIKE '%SOTON%'";
    else if (portal.includes('DISTRIMED')) whereFornecedor = "AND c.fornecedor LIKE '%DISTRIMED%'";
    else if (portal.includes('DPC')) whereFornecedor = "AND c.fornecedor LIKE '%DPC%'";
    else if (portal.includes('MARTINS')) whereFornecedor = "AND c.fornecedor LIKE '%MARTINS%'";
    else if (portal.includes('DIVIMED')) whereFornecedor = "AND c.fornecedor LIKE '%DIVIMED%'";
    else if (portal.includes('PROFARMA')) whereFornecedor = "AND c.fornecedor LIKE '%PROFARMA%'";
  }

  const query = `
    SELECT c.id as cotacao_id, c.ean, c.fornecedor, c.preco, c.descricao as desc_cotacao,
           COALESCE(e.descricao, c.descricao, 'PRODUTO') as desc_estoque, e.custo_unitario, e.saldo
    FROM belaped_cotacoes_reais c
    LEFT JOIN compras_estoque_cache e ON e.ean = c.ean
    WHERE c.disponivel = 1
      AND c.preco > 0
      ${whereFornecedor}
    ORDER BY c.updated_at DESC, c.preco ASC
    LIMIT ?
  `;

  return db.prepare(query).all(maxItens);
}

// ==========================================
// AUDITORIA DO PORTAL: SOTON FARMA
// ==========================================
async function auditarSoton(itens) {
  if (itens.length === 0) return [];
  console.log(`\n🏢 Iniciando Auditoria dos Links na SOTON FARMA (${itens.length} itens)...`);
  const robo = new SotonRobot({ headless: true });
  await robo.iniciar();

  const resultados = [];

  try {
    for (let i = 0; i < itens.length; i++) {
      const item = itens[i];
      const linkBusca = `https://sotonfarma.meuspedidos.com.br/?busca=${encodeURIComponent(item.ean)}`;
      console.log(`\n[${i + 1}/${itens.length}] Testando Link Soton: EAN ${item.ean} - ${item.desc_estoque.slice(0, 35)}`);
      console.log(`    🔗 Link gerado: ${linkBusca}`);

      try {
        await robo.page.goto(linkBusca, { waitUntil: 'networkidle2', timeout: 30000 });
        await robo.page.waitForFunction(() => {
          const b = document.body.innerText || '';
          return b.includes('Resultados para') || b.includes('Nenhum resultado') || b.includes('Ops!') || b.includes('contato@sotonfarma');
        }, { timeout: 15000 }).catch(() => {});
        await new Promise(r => setTimeout(r, 1000));

        const analise = await robo.page.evaluate(() => {
          // Remove explicitamente qualquer ocorrência de shopping_cart e carrinho do topo
          const textoCompleto = (document.body.innerText || '')
            .replace(/shopping_cart\s*R\$\s*[\d\.,]+/gi, '')
            .replace(/shopping_cart\s*\d+/gi, '');

          const bodyTextLower = textoCompleto.toLowerCase();
          if (bodyTextLower.includes('nenhum resultado encontrado') || bodyTextLower.includes('nenhum produto encontrado')) {
            return { status: 'NAO_ENCONTRADO', motivo: 'Nenhum resultado retornado para o EAN na Soton' };
          }

          // Na Soton (MeusPedidos), os itens ficam entre "Resultados para" e "contato@sotonfarma"
          const idxInicio = textoCompleto.indexOf('Resultados para');
          const idxFim = textoCompleto.indexOf('contato@sotonfarma');
          const trechoResultados = idxInicio >= 0
            ? textoCompleto.slice(idxInicio, idxFim > idxInicio ? idxFim : undefined)
            : textoCompleto;

          // Checagem de estoque real / ruptura na Soton
          const temAvisoRuptura =
            trechoResultados.includes('já vendemos todo o estoque') ||
            trechoResultados.includes('ja vendemos todo o estoque') ||
            trechoResultados.includes('avise-me quando chegar') ||
            trechoResultados.includes('avise-me') ||
            trechoResultados.includes('sem estoque') ||
            trechoResultados.includes('indisponível') ||
            trechoResultados.includes('indisponivel') ||
            trechoResultados.includes('esgotado');

          // Procura preço no formato R$ na área do card
          const matchPreco = trechoResultados.match(/R\$\s*([\d\.]+,\d{2})/i);
          const precoNum = matchPreco ? parseFloat(matchPreco[1].replace(/\./g, '').replace(',', '.')) : null;

          if (temAvisoRuptura) {
            return {
              status: 'SEM_ESTOQUE',
              motivo: 'Produto marcado como "Ops! Já vendemos todo o estoque" ou sem estoque na Soton',
              precoEncontrado: precoNum
            };
          }

          if (!precoNum) {
            return { status: 'SEM_PRECO', motivo: 'Nenhum preço ativo de compra encontrado na página' };
          }

          return {
            status: 'OK',
            motivo: 'Produto em estoque com preço válido',
            precoEncontrado: precoNum
          };
        });

        let resultadoFinal = {
          fornecedor: 'SOTON FARMA',
          cotacao_id: item.cotacao_id,
          ean: item.ean,
          descricao: item.desc_estoque,
          precoCotado: item.preco,
          precoReal: analise.precoEncontrado || null,
          link: linkBusca,
          status: analise.status,
          motivo: analise.motivo
        };

        if (analise.status === 'OK' && analise.precoEncontrado) {
          const dif = Math.abs(analise.precoEncontrado - item.preco);
          if (dif > 0.05) {
            resultadoFinal.status = 'PRECO_DIVERGENTE';
            resultadoFinal.motivo = `Preço exibido no link (R$ ${analise.precoEncontrado.toFixed(2)}) difere do gravado (R$ ${item.preco.toFixed(2)})`;
          }
        }

        if (resultadoFinal.status !== 'OK') {
          const printPath = path.join(DIR_SCREENSHOTS, `falha_SOTON_${item.ean}.png`);
          await robo.page.screenshot({ path: printPath, fullPage: false });
          resultadoFinal.screenshot = printPath;
          console.log(`    ❌ [${resultadoFinal.status}] ${resultadoFinal.motivo}`);
        } else {
          console.log(`    ✅ [PASSOU] Produto em estoque e conferido! Preço real: R$ ${analise.precoEncontrado.toFixed(2)}`);
        }

        resultados.push(resultadoFinal);

      } catch (err) {
        console.error(`    ⚠️ Erro ao auditar link: ${err.message}`);
        resultados.push({
          fornecedor: 'SOTON FARMA',
          cotacao_id: item.cotacao_id,
          ean: item.ean,
          descricao: item.desc_estoque,
          precoCotado: item.preco,
          status: 'ERRO_NAVEGACAO',
          motivo: err.message
        });
      }
    }
  } finally {
    await robo.fechar();
  }

  return resultados;
}

// ==========================================
// AUDITORIA DO PORTAL: DPC DISTRIBUIDORA
// ==========================================
async function auditarDpc(itens) {
  if (itens.length === 0) return [];
  console.log(`\n🏢 Iniciando Auditoria dos Links na DPC DISTRIBUIDORA (${itens.length} itens)...`);
  const robo = new DpcRobot({ headless: true });
  await robo.iniciar();

  const resultados = [];

  try {
    for (let i = 0; i < itens.length; i++) {
      const item = itens[i];
      const linkBusca = `https://dpcnet.com.br/catalogo?busca=${encodeURIComponent(item.ean)}&visualizacao=bloco-1&ordenacao=ordem-0`;
      console.log(`\n[${i + 1}/${itens.length}] Testando Link DPC: EAN ${item.ean} - ${item.desc_estoque.slice(0, 35)}`);
      console.log(`    🔗 Link gerado: ${linkBusca}`);

      try {
        await robo.page.goto(linkBusca, { waitUntil: 'domcontentloaded', timeout: 25000 });
        await new Promise(r => setTimeout(r, 1200));

        // Fecha banner de cookie da DPC para desobstruir os cards
        await robo.page.evaluate(() => {
          const btnCookie = Array.from(document.querySelectorAll('button')).find(b => (b.innerText || '').includes('Aceitar e fechar'));
          if (btnCookie) btnCookie.click();
        });
        await new Promise(r => setTimeout(r, 500));

        const analise = await robo.page.evaluate(() => {
          const bodyText = document.body.innerText || '';
          const idxIni = bodyText.indexOf('Resultado da Busca:');
          const areaBusca = idxIni >= 0 ? bodyText.slice(idxIni, idxIni + 3000) : bodyText;

          if (
            areaBusca.includes('Foram encontrados 0 produtos') ||
            areaBusca.includes('Não localizamos nenhum resultado')
          ) {
            return { status: 'NAO_ENCONTRADO', motivo: 'Foram encontrados 0 produtos para este EAN na DPC' };
          }

          const temAvisoRuptura =
            areaBusca.includes('Sem estoque') ||
            areaBusca.includes('Indisponível') ||
            areaBusca.includes('indisponível') ||
            areaBusca.includes('Esgotado') ||
            areaBusca.includes('Avise-me');

          if (temAvisoRuptura) {
            return { status: 'SEM_ESTOQUE', motivo: 'Produto sem estoque / esgotado na DPC' };
          }

          // Fator de embalagem da DPC (ex: Emb.: Pacote com 12 ou Emb.: Display com 24 ou Emb.: 1 unidade)
          let fatorEmbalagem = 1;
          const matchEmb = areaBusca.match(/Emb\.:[^\d]*(\d+)/i);
          if (matchEmb) {
            const n = parseInt(matchEmb[1], 10);
            if (n > 1) fatorEmbalagem = n;
          }

          // Prioriza preço promocional "por R$ X,XX" ou preço normal "R$ X,XX"
          let precoBruto = null;
          const matchPor = areaBusca.match(/por\s+R\$\s*([\d\.]+,\d{2})/i);
          if (matchPor) {
            precoBruto = parseFloat(matchPor[1].replace(/\./g, '').replace(',', '.'));
          } else {
            const matchPreco = areaBusca.match(/R\$\s*([\d\.]+,\d{2})/i);
            precoBruto = matchPreco ? parseFloat(matchPreco[1].replace(/\./g, '').replace(',', '.')) : null;
          }

          const precoNum = (precoBruto && fatorEmbalagem > 1) ? Number((precoBruto / fatorEmbalagem).toFixed(2)) : precoBruto;

          if (!precoBruto) {
            return { status: 'SEM_PRECO', motivo: 'Nenhum preço de compra válido retornado' };
          }

          return {
            status: 'OK',
            motivo: 'Produto em estoque com preço ativo',
            precoEncontrado: precoNum,
            precoBruto,
            fatorEmbalagem
          };
        });

        let resultadoFinal = {
          fornecedor: 'DPC DISTRIBUIDORA',
          cotacao_id: item.cotacao_id,
          ean: item.ean,
          descricao: item.desc_estoque,
          precoCotado: item.preco,
          precoReal: analise.precoEncontrado || null,
          link: linkBusca,
          status: analise.status,
          motivo: analise.motivo
        };

        if (analise.status === 'OK' && analise.precoEncontrado) {
          const difUnit = Math.abs(analise.precoEncontrado - item.preco);
          const difBruto = Math.abs((analise.precoBruto || 0) - item.preco);
          // Aceita se bater com o unitário OU com o preço de caixa fechada
          if (difUnit > 0.05 && difBruto > 0.05) {
            resultadoFinal.status = 'PRECO_DIVERGENTE';
            resultadoFinal.motivo = `Preço exibido no link (R$ ${analise.precoEncontrado.toFixed(2)} un / R$ ${analise.precoBruto.toFixed(2)} cx) difere do gravado (R$ ${item.preco.toFixed(2)})`;
          }
        }

        if (resultadoFinal.status !== 'OK') {
          const printPath = path.join(DIR_SCREENSHOTS, `falha_DPC_${item.ean}.png`);
          await robo.page.screenshot({ path: printPath, fullPage: false });
          resultadoFinal.screenshot = printPath;
          console.log(`    ❌ [${resultadoFinal.status}] ${resultadoFinal.motivo}`);
        } else {
          const msgPreco = (analise.fatorEmbalagem > 1)
            ? `R$ ${analise.precoEncontrado.toFixed(2)} / un (Caixa c/ ${analise.fatorEmbalagem} un: R$ ${analise.precoBruto.toFixed(2)})`
            : `R$ ${analise.precoEncontrado.toFixed(2)}`;
          console.log(`    ✅ [PASSOU] Produto em estoque e conferido! Preço real: ${msgPreco}`);
        }

        resultados.push(resultadoFinal);

      } catch (err) {
        console.error(`    ⚠️ Erro ao auditar link: ${err.message}`);
        resultados.push({
          fornecedor: 'DPC DISTRIBUIDORA',
          cotacao_id: item.cotacao_id,
          ean: item.ean,
          descricao: item.desc_estoque,
          precoCotado: item.preco,
          status: 'ERRO_NAVEGACAO',
          motivo: err.message
        });
      }
    }
  } finally {
    await robo.fechar();
  }

  return resultados;
}

// ==========================================
// AUDITORIA DO PORTAL: DISTRIMED (SPA)
// ==========================================
async function auditarDistrimed(itens) {
  if (itens.length === 0) return [];
  console.log(`\n🏢 Iniciando Auditoria na DISTRIMED (${itens.length} itens)...`);
  const robo = new DistrimedRobot({ headless: true });
  await robo.iniciar();

  const resultados = [];

  try {
    for (let i = 0; i < itens.length; i++) {
      const item = itens[i];
      const linkBusca = 'https://inovacao.distrimed.com.br/produtos';
      console.log(`\n[${i + 1}/${itens.length}] Testando Distrimed: EAN ${item.ean} - ${item.desc_estoque.slice(0, 35)}`);
      console.log(`    🔗 Link gerado na tela: ${linkBusca} (com busca automática por EAN)`);

      try {
        const searchSelector = 'input[placeholder*="Pesquisar"], input[type="search"], input.campo-busca, input[type="text"]';
        await robo.page.waitForSelector(searchSelector, { timeout: 15000 });
        
        await robo.page.evaluate((sel) => {
          const inp = document.querySelector(sel);
          if (inp) {
            inp.value = '';
            inp.dispatchEvent(new Event('input', { bubbles: true }));
          }
        }, searchSelector);

        await robo.page.type(searchSelector, item.ean, { delay: 15 });
        await robo.page.keyboard.press('Enter');
        await new Promise(r => setTimeout(r, 2200));

        const analise = await robo.page.evaluate((eanAlvo) => {
          const bodyText = document.body.innerText || '';
          const idxImportar = bodyText.indexOf('Importar');
          const areaProdutos = idxImportar >= 0 ? bodyText.slice(idxImportar) : bodyText;

          if (
            areaProdutos.includes('Produto não encontrado') ||
            areaProdutos.includes('Nenhum produto') ||
            areaProdutos.includes('não encontramos nenhum produto')
          ) {
            return { status: 'NAO_ENCONTRADO', motivo: 'Nenhum produto encontrado na Distrimed' };
          }

          // Na Distrimed, cada card começa com "VAL. DD/MM/AAAA"
          const blocos = areaProdutos.split(/VAL\.\s*\d{2}\/\d{2}\/\d{4}/).slice(1);
          if (blocos.length === 0) {
            return { status: 'NAO_ENCONTRADO', motivo: 'Nenhum card de produto retornado na busca da Distrimed' };
          }

          const primeiroBloco = blocos[0];
          const blocoUpper = primeiroBloco.toUpperCase();

          const temAvisoRuptura =
            blocoUpper.includes('AVISE-ME') ||
            blocoUpper.includes('AVISE ME') ||
            blocoUpper.includes('SEM ESTOQUE') ||
            blocoUpper.includes('INDISPONÍVEL') ||
            blocoUpper.includes('INDISPONIVEL') ||
            blocoUpper.includes('ESGOTADO') ||
            blocoUpper.includes('PRODUTO NÃO DISPONÍVEL');

          // Descarta a linha de PMC (Preço Máximo ao Consumidor)
          const blocoSemPmc = primeiroBloco.replace(/PMC\s*:\s*R\$\s*[\d\.,]+/gi, '');

          // Preço real no card do produto (deve começar com R$)
          const linhas = blocoSemPmc.split('\n').map(l => l.trim()).filter(Boolean);
          let precoNum = null;
          for (const l of linhas) {
            if (/^R\$\s*[\d\.,]+$/.test(l)) {
              const num = parseFloat(l.replace('R$', '').trim().replace(/\./g, '').replace(',', '.'));
              if (!isNaN(num) && num > 0) {
                precoNum = num;
                break;
              }
            }
          }

          if (temAvisoRuptura) {
            return {
              status: 'SEM_ESTOQUE',
              motivo: 'Produto com botão "Avise-me quando chegar" / sem estoque na Distrimed',
              precoEncontrado: precoNum
            };
          }

          if (!precoNum) {
            return { status: 'SEM_PRECO', motivo: 'Preço não exibido ou sem estoque' };
          }

          return {
            status: 'OK',
            motivo: 'Produto em estoque com preço ativo',
            precoEncontrado: precoNum
          };
        }, item.ean);

        let resultadoFinal = {
          fornecedor: 'DISTRIMED',
          cotacao_id: item.cotacao_id,
          ean: item.ean,
          descricao: item.desc_estoque,
          precoCotado: item.preco,
          precoReal: analise.precoEncontrado || null,
          link: linkBusca,
          status: analise.status,
          motivo: analise.motivo
        };

        if (analise.status === 'OK' && analise.precoEncontrado) {
          const dif = Math.abs(analise.precoEncontrado - item.preco);
          if (dif > 0.05) {
            resultadoFinal.status = 'PRECO_DIVERGENTE';
            resultadoFinal.motivo = `Preço na Distrimed (R$ ${analise.precoEncontrado.toFixed(2)}) difere do gravado (R$ ${item.preco.toFixed(2)})`;
          }
        }

        if (resultadoFinal.status !== 'OK') {
          const printPath = path.join(DIR_SCREENSHOTS, `falha_DISTRIMED_${item.ean}.png`);
          await robo.page.screenshot({ path: printPath, fullPage: false });
          resultadoFinal.screenshot = printPath;
          console.log(`    ❌ [${resultadoFinal.status}] ${resultadoFinal.motivo}`);
        } else {
          console.log(`    ✅ [PASSOU] Produto em estoque e conferido! Preço real: R$ ${analise.precoEncontrado.toFixed(2)}`);
        }

        resultados.push(resultadoFinal);

      } catch (err) {
        console.error(`    ⚠️ Erro ao auditar Distrimed: ${err.message}`);
        resultados.push({
          fornecedor: 'DISTRIMED',
          cotacao_id: item.cotacao_id,
          ean: item.ean,
          descricao: item.desc_estoque,
          precoCotado: item.preco,
          status: 'ERRO_NAVEGACAO',
          motivo: err.message
        });
      }
    }
  } finally {
    await robo.fechar();
  }

  return resultados;
}

// ==========================================
// AUDITORIA DO PORTAL: MARTINS ATACADO
// ==========================================
async function auditarMartins(itens) {
  if (itens.length === 0) return [];
  console.log(`\n🏢 Iniciando Auditoria dos Links no MARTINS ATACADO (${itens.length} itens)...`);
  const robo = new MartinsRobot({ headless: true });
  await robo.iniciar();

  const resultados = [];

  try {
    for (let i = 0; i < itens.length; i++) {
      const item = itens[i];
      const linkBusca = `https://www.martinsatacado.com.br/busca?q=${encodeURIComponent(item.ean)}`;
      console.log(`\n[${i + 1}/${itens.length}] Testando Link Martins: EAN ${item.ean} - ${item.desc_estoque.slice(0, 35)}`);
      console.log(`    🔗 Link gerado: ${linkBusca}`);

      try {
        await robo.page.goto(linkBusca, { waitUntil: 'domcontentloaded', timeout: 25000 });
        await new Promise(r => setTimeout(r, 2000));

        const analise = await robo.page.evaluate(() => {
          const bodyText = document.body.innerText || '';
          if (
            bodyText.includes('Nenhum resultado encontrado') ||
            bodyText.includes('Não encontramos nenhum resultado') ||
            bodyText.includes('nenhum produto encontrado')
          ) {
            return { status: 'NAO_ENCONTRADO', motivo: 'Nenhum resultado no catálogo do Martins' };
          }

          const temAvisoRuptura =
            bodyText.includes('Produto indisponível') ||
            bodyText.includes('Avise-me') ||
            bodyText.includes('Sem estoque') ||
            bodyText.includes('Esgotado');

          if (temAvisoRuptura) {
            return { status: 'SEM_ESTOQUE', motivo: 'Produto marcado como indisponível no Martins' };
          }

          const matchPreco = bodyText.match(/R\$\s*([\d\.]+,\d{2})/i);
          const precoNum = matchPreco ? parseFloat(matchPreco[1].replace(/\./g, '').replace(',', '.')) : null;

          if (!precoNum) {
            return { status: 'SEM_PRECO', motivo: 'Preço não exibido (exige login de cliente)' };
          }

          return {
            status: 'OK',
            motivo: 'Produto em estoque com preço ativo',
            precoEncontrado: precoNum
          };
        });

        let resultadoFinal = {
          fornecedor: 'MARTINS ATACADO',
          cotacao_id: item.cotacao_id,
          ean: item.ean,
          descricao: item.desc_estoque,
          precoCotado: item.preco,
          precoReal: analise.precoEncontrado || null,
          link: linkBusca,
          status: analise.status,
          motivo: analise.motivo
        };

        if (resultadoFinal.status !== 'OK') {
          const printPath = path.join(DIR_SCREENSHOTS, `falha_MARTINS_${item.ean}.png`);
          await robo.page.screenshot({ path: printPath, fullPage: false });
          resultadoFinal.screenshot = printPath;
          console.log(`    ❌ [${resultadoFinal.status}] ${resultadoFinal.motivo}`);
        } else {
          console.log(`    ✅ [PASSOU] Produto em estoque e conferido! Preço real: R$ ${analise.precoEncontrado.toFixed(2)}`);
        }

        resultados.push(resultadoFinal);

      } catch (err) {
        console.error(`    ⚠️ Erro ao auditar link Martins: ${err.message}`);
        resultados.push({
          fornecedor: 'MARTINS ATACADO',
          cotacao_id: item.cotacao_id,
          ean: item.ean,
          descricao: item.desc_estoque,
          precoCotado: item.preco,
          status: 'ERRO_NAVEGACAO',
          motivo: err.message
        });
      }
    }
  } finally {
    await robo.fechar();
  }

  return resultados;
}

// ==========================================
// AUDITORIA DO PORTAL: PROFARMA
// ==========================================
async function auditarProfarma(itens) {
  if (itens.length === 0) return [];
  console.log(`\n🏢 Iniciando Auditoria na PROFARMA (${itens.length} itens)...`);
  const robo = new ProfarmaRobot({ headless: true });
  await robo.iniciar();

  const resultados = [];

  try {
    for (let i = 0; i < itens.length; i++) {
      const item = itens[i];
      const linkPortal = 'https://pedido.profarma.com.br/';
      console.log(`\n[${i + 1}/${itens.length}] Testando Profarma: EAN ${item.ean} - ${item.desc_estoque.slice(0, 35)}`);
      console.log(`    🔗 Link gerado na tela: ${linkPortal} (com busca automática por EAN)`);

      try {
        const cota = await robo.cotarEAN(item.ean, item.desc_estoque);
        
        let resultadoFinal = {
          fornecedor: 'PROFARMA',
          cotacao_id: item.cotacao_id,
          ean: item.ean,
          descricao: item.desc_estoque,
          precoCotado: item.preco,
          precoReal: cota.preco || null,
          link: linkPortal,
          status: 'OK',
          motivo: ''
        };

        if (!cota.disponivel) {
          resultadoFinal.status = 'SEM_ESTOQUE';
          resultadoFinal.motivo = cota.mensagem || 'Sem estoque na Profarma';
        } else if (cota.preco) {
          const dif = Math.abs(cota.preco - item.preco);
          if (dif > 0.05) {
            resultadoFinal.status = 'PRECO_DIVERGENTE';
            resultadoFinal.motivo = `Preço no portal (R$ ${cota.preco.toFixed(2)}) difere do gravado (R$ ${item.preco.toFixed(2)})`;
          }
        }

        if (resultadoFinal.status !== 'OK') {
          const printPath = path.join(DIR_SCREENSHOTS, `falha_PROFARMA_${item.ean}.png`);
          await robo.page.screenshot({ path: printPath, fullPage: false }).catch(() => {});
          resultadoFinal.screenshot = printPath;
          console.log(`    ❌ [${resultadoFinal.status}] ${resultadoFinal.motivo}`);
        } else {
          console.log(`    ✅ [PASSOU] Produto em estoque e conferido! Preço real: R$ ${cota.preco.toFixed(2)}`);
        }

        resultados.push(resultadoFinal);

      } catch (err) {
        console.error(`    ⚠️ Erro ao auditar Profarma: ${err.message}`);
        resultados.push({
          fornecedor: 'PROFARMA',
          cotacao_id: item.cotacao_id,
          ean: item.ean,
          descricao: item.desc_estoque,
          precoCotado: item.preco,
          status: 'ERRO_NAVEGACAO',
          motivo: err.message
        });
      }
    }
  } finally {
    await robo.fechar();
  }

  return resultados;
}

// ==========================================
// AUDITORIA DO PORTAL: DIVIMED
// ==========================================
async function auditarDivimed(itens) {
  if (itens.length === 0) return [];
  console.log(`\n🏢 Iniciando Auditoria na DIVIMED (${itens.length} itens)...`);
  const robo = new DivimedRobot({ headless: true });
  await robo.iniciar();

  const resultados = [];

  try {
    for (let i = 0; i < itens.length; i++) {
      const item = itens[i];
      const linkPortal = 'https://divimed.artpedidoweb.com.br/#/comprar';
      console.log(`\n[${i + 1}/${itens.length}] Testando Divimed: EAN ${item.ean} - ${item.desc_estoque.slice(0, 35)}`);
      console.log(`    🔗 Link gerado na tela: ${linkPortal} (com busca automática por EAN)`);

      try {
        const cota = await robo.cotarEAN(item.ean, item.desc_estoque);
        
        let resultadoFinal = {
          fornecedor: 'DIVIMED',
          cotacao_id: item.cotacao_id,
          ean: item.ean,
          descricao: item.desc_estoque,
          precoCotado: item.preco,
          precoReal: cota.preco || null,
          link: linkPortal,
          status: 'OK',
          motivo: ''
        };

        if (!cota.disponivel) {
          resultadoFinal.status = 'SEM_ESTOQUE';
          resultadoFinal.motivo = cota.mensagem || 'Sem estoque na Divimed';
        } else if (cota.preco) {
          const dif = Math.abs(cota.preco - item.preco);
          if (dif > 0.05) {
            resultadoFinal.status = 'PRECO_DIVERGENTE';
            resultadoFinal.motivo = `Preço no portal (R$ ${cota.preco.toFixed(2)}) difere do gravado (R$ ${item.preco.toFixed(2)})`;
          }
        }

        if (resultadoFinal.status !== 'OK') {
          const printPath = path.join(DIR_SCREENSHOTS, `falha_DIVIMED_${item.ean}.png`);
          await robo.page.screenshot({ path: printPath, fullPage: false }).catch(() => {});
          resultadoFinal.screenshot = printPath;
          console.log(`    ❌ [${resultadoFinal.status}] ${resultadoFinal.motivo}`);
        } else {
          console.log(`    ✅ [PASSOU] Produto em estoque e conferido! Preço real: R$ ${cota.preco.toFixed(2)}`);
        }

        resultados.push(resultadoFinal);

      } catch (err) {
        console.error(`    ⚠️ Erro ao auditar Divimed: ${err.message}`);
        resultados.push({
          fornecedor: 'DIVIMED',
          cotacao_id: item.cotacao_id,
          ean: item.ean,
          descricao: item.desc_estoque,
          precoCotado: item.preco,
          status: 'ERRO_NAVEGACAO',
          motivo: err.message
        });
      }
    }
  } finally {
    await robo.fechar();
  }

  return resultados;
}

// ==========================================
// EXECUTOR PRINCIPAL
// ==========================================
async function main() {
  const todosResultados = [];

  // 1. SOTON
  if (portalFiltro === 'TODOS' || portalFiltro.includes('SOTON')) {
    const itensSoton = buscarItensParaAuditoria('SOTON FARMA', limite);
    const res = await auditarSoton(itensSoton);
    todosResultados.push(...res);
  }

  // 2. DPC
  if (portalFiltro === 'TODOS' || portalFiltro.includes('DPC')) {
    const itensDpc = buscarItensParaAuditoria('DPC DISTRIBUIDORA', limite);
    const res = await auditarDpc(itensDpc);
    todosResultados.push(...res);
  }

  // 3. DISTRIMED
  if (portalFiltro === 'TODOS' || portalFiltro.includes('DISTRIMED')) {
    const itensDistrimed = buscarItensParaAuditoria('DISTRIMED', limite);
    const res = await auditarDistrimed(itensDistrimed);
    todosResultados.push(...res);
  }

  // 4. MARTINS
  if (portalFiltro === 'TODOS' || portalFiltro.includes('MARTINS')) {
    const itensMartins = buscarItensParaAuditoria('MARTINS ATACADO', limite);
    const res = await auditarMartins(itensMartins);
    todosResultados.push(...res);
  }

  // 5. PROFARMA
  if (portalFiltro === 'TODOS' || portalFiltro.includes('PROFARMA')) {
    const itensProfarma = buscarItensParaAuditoria('PROFARMA', limite);
    const res = await auditarProfarma(itensProfarma);
    todosResultados.push(...res);
  }

  // 6. DIVIMED
  if (portalFiltro === 'TODOS' || portalFiltro.includes('DIVIMED')) {
    const itensDivimed = buscarItensParaAuditoria('DIVIMED', limite);
    const res = await auditarDivimed(itensDivimed);
    todosResultados.push(...res);
  }

  // ==========================================
  // RELATÓRIO EXECUTIVO & AUTO-CORREÇÃO
  // ==========================================
  console.log('\n================================================================');
  console.log('📊 RELATÓRIO FINAL DE AUDITORIA DOS LINKS');
  console.log('================================================================');

  let totalOk = 0;
  let totalSemEstoque = 0;
  let totalNaoEncontrado = 0;
  let totalPrecoDiv = 0;
  let totalErros = 0;

  const stmtInvalidar = db.prepare(`
    UPDATE belaped_cotacoes_reais
    SET preco = NULL, disponivel = 0, descricao = ?
    WHERE id = ?
  `);

  for (const r of todosResultados) {
    if (r.status === 'OK') {
      totalOk++;
    } else {
      if (r.status === 'SEM_ESTOQUE') totalSemEstoque++;
      else if (r.status === 'NAO_ENCONTRADO') totalNaoEncontrado++;
      else if (r.status === 'PRECO_DIVERGENTE') totalPrecoDiv++;
      else totalErros++;

      if (deveCorrigir && r.cotacao_id) {
        stmtInvalidar.run(`[INVALIDADO NO TESTE DE LINK: ${r.motivo}]`, r.cotacao_id);
      }
    }
  }

  console.log(`📦 Total de Links de Produtos Testados: ${todosResultados.length}`);
  console.log(`✅ Aprovados (Em Estoque e Válidos): ${totalOk} (${((totalOk / (todosResultados.length || 1)) * 100).toFixed(1)}%)`);
  console.log(`❌ Reprovados Sem Estoque (Avise-me / Já Vendemos): ${totalSemEstoque}`);
  console.log(`❌ Reprovados Não Encontrados: ${totalNaoEncontrado}`);
  console.log(`⚠️ Divergência de Preço: ${totalPrecoDiv}`);
  console.log(`⚠️ Erros de Conexão/Navegação: ${totalErros}`);

  if (deveCorrigir) {
    console.log(`\n🧹 AUTO-CORREÇÃO: As cotações reprovadas foram invalidadas no banco de dados!`);
    console.log(`   O BelaPed agora promoverá os 2º colocados válidos ou descartará produtos em ruptura.`);
  } else {
    console.log(`\n💡 Dica: Para invalidar automaticamente as cotações reprovadas, execute com --fix:`);
    console.log(`   node backend/testador-links-cotacoes.cjs --fix`);
  }

  console.log('\n================================================================\n');
}

main().catch(err => {
  console.error('Falha geral no auditor:', err);
  process.exit(1);
});
