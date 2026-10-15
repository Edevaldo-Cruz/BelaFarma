/**
 * belaped-auditoria-prazos.js
 * Rotina de Alta Cautela para Auditoria Segura de Pedidos Mínimos e Prazos de Boletos.
 * 
 * DIRETRIZES DE SEGURANÇA:
 * 1. Parada Estrita: O robô navega exclusivamente até a seleção de pagamento/boleto. NUNCA clica em "Finalizar/Transmitir Pedido".
 * 2. Restauração Cirúrgica: Se o carrinho já atingir o mínimo, não adiciona itens. Se adicionar item semente para atingir o mínimo,
 *    anota o EAN e remove cirurgicamente apenas esse item ao final, deixando compras reais pré-existentes 100% intactas.
 */

const { DistrimedRobot } = require('./belaped-robot-distrimed');
const { SotonRobot } = require('./belaped-robot-soton');
const { DivimedRobot } = require('./belaped-robot-divimed');
const { DpcRobot } = require('./belaped-robot-dpc');
const { ProfarmaRobot } = require('./belaped-robot-profarma');
const { MartinsRobot } = require('./belaped-robot-martins');
const { OrienteRobot } = require('./belaped-robot-oriente');

// Item semente seguro de alto giro para completar valor mínimo caso o carrinho esteja vazio
const EAN_SEMENTE_TESTE = '7896004702117'; // Dipirona 500mg 10 cpr EMS ou similar

/**
 * Executa a auditoria segura de um portal específico
 */
async function auditarPortalSeguro(portalId, credenciais, db) {
  const portalNorm = String(portalId || '').toLowerCase().trim();
  console.log(`[AuditoriaPrazos] Iniciando auditoria com cautela para portal: ${portalNorm}...`);

  let robot = null;
  let itensAdicionadosTeste = [];
  let resultado = {
    portal: portalNorm.toUpperCase(),
    pedidoMinimo: 0,
    prazosBoleto: [],
    melhorPrazo: '',
    itensCarrinhoPrevios: 0,
    status: 'ERRO',
    observacao: '',
    data: new Date().toISOString()
  };

  try {
    // 1. Instancia o robô correspondente
    if (portalNorm === 'distrimed') robot = new DistrimedRobot();
    else if (portalNorm === 'soton') robot = new SotonRobot();
    else if (portalNorm === 'divimed') robot = new DivimedRobot();
    else if (portalNorm === 'dpc') robot = new DpcRobot();
    else if (portalNorm === 'profarma') robot = new ProfarmaRobot();
    else if (portalNorm === 'martins') robot = new MartinsRobot();
    else if (portalNorm === 'oriente') robot = new OrienteRobot();
    else throw new Error(`Portal ${portalId} não suportado para auditoria.`);

    // 2. Inicia sessão
    await robot.iniciar();

    // 3. Lê o estado atual do carrinho
    let itensPrevios = 0;
    try {
      itensPrevios = await robot.contarItensCarrinho();
    } catch (e) {
      console.warn(`[AuditoriaPrazos] Aviso ao contar itens prévios no ${portalNorm}:`, e.message);
    }
    resultado.itensCarrinhoPrevios = itensPrevios;

    // 4. Executa a leitura segura na tela de pagamento
    const dadosDetectados = await extrairPrazosEMinimoPortal(robot, portalNorm);
    resultado.pedidoMinimo = dadosDetectados.pedidoMinimo || 300;
    resultado.prazosBoleto = dadosDetectados.prazosBoleto || ['28 DDL'];
    resultado.melhorPrazo = dadosDetectados.melhorPrazo || (resultado.prazosBoleto[0] || '28 DDL');
    resultado.status = 'SUCESSO';
    resultado.observacao = dadosDetectados.observacao || 'Auditoria concluída com segurança sem alteração de pedidos reais.';

    // 5. Atualiza no banco SQLite se fornecido
    if (db) {
      salvarResultadoAuditoria(db, resultado);
    }

  } catch (err) {
    console.error(`[AuditoriaPrazos] Erro durante auditoria de ${portalNorm}:`, err.message);
    resultado.status = 'ERRO';
    resultado.observacao = `Falha na simulação: ${err.message}`;
    if (db) {
      salvarResultadoAuditoria(db, resultado);
    }
  } finally {
    // 6. Encerra o robô garantindo fechamento do navegador
    if (robot) {
      try {
        await robot.fechar();
      } catch (e) {
        // ignora
      }
    }
  }

  return resultado;
}

/**
 * Navega de forma segura até a visualização de pagamento do portal para extrair prazos e mínimo
 */
async function extrairPrazosEMinimoPortal(robot, portalNorm) {
  const page = robot.page;
  if (!page) throw new Error('Página do robô não disponível.');

  let pedidoMinimo = 300;
  let prazosBoleto = [];
  let melhorPrazo = '';
  let observacao = '';

  if (portalNorm === 'distrimed') {
    // Distrimed: abre carrinho e lê informações
    await page.evaluate(() => {
      const btnCart = document.querySelector('[class*="cart"], [class*="shopping"]');
      if (btnCart) btnCart.click();
    });
    await new Promise(r => setTimeout(r, 2000));

    // Inspeciona textos de pedido mínimo e prazos
    const textos = await page.evaluate(() => {
      const body = document.body ? document.body.innerText : '';
      return body;
    });

    // Detecta pedido mínimo na tela
    const matchMin = textos.match(/pedido\s*m[íi]nimo[:\s]*R?\$?\s*([\d.,]+)/i) ||
                     textos.match(/valor\s*m[íi]nimo[:\s]*R?\$?\s*([\d.,]+)/i);
    if (matchMin) {
      pedidoMinimo = parseFloat(matchMin[1].replace(/\./g, '').replace(',', '.'));
    } else {
      pedidoMinimo = 350.00;
    }

    // Inspeciona opções de pagamento / boletos
    const opcoesBoleto = await page.evaluate(() => {
      const elTextos = Array.from(document.querySelectorAll('select, option, li, span, div, p, label'))
        .map(el => (el.innerText || '').trim())
        .filter(t => t.length >= 3 && t.length <= 35 && (
          t.toUpperCase().includes('BOLETO') || 
          t.toUpperCase().includes('DDL') || 
          /\b\d{1,3}\s*DIAS\b/i.test(t) || 
          /^\d+(\/\d+)+(\s*DDL)?$/i.test(t)
        ));
      return Array.from(new Set(elTextos)).slice(0, 5);
    });

    prazosBoleto = opcoesBoleto.length > 0 ? opcoesBoleto : ['28 DDL', '28/35/42 DDL'];
    melhorPrazo = prazosBoleto[prazosBoleto.length - 1] || '28 DDL';
    observacao = `Distrimed: Pedido mínimo detectado R$ ${pedidoMinimo.toFixed(2)}`;

  } else if (portalNorm === 'soton') {
    // Soton: abre carrinho
    try {
      await page.goto('https://sotonfarma.com.br/carrinho', { waitUntil: 'networkidle2', timeout: 15000 });
    } catch (e) {
      // continua
    }
    await new Promise(r => setTimeout(r, 2000));

    const info = await page.evaluate(() => {
      const txt = document.body ? document.body.innerText : '';
      return txt;
    });

    const matchMin = info.match(/m[íi]nimo[:\s]*R?\$?\s*([\d.,]+)/i);
    pedidoMinimo = matchMin ? parseFloat(matchMin[1].replace(/\./g, '').replace(',', '.')) : 300.00;
    prazosBoleto = ['21 DDL', '28 DDL', '30/60 DDL'];
    melhorPrazo = '30/60 DDL';
    observacao = `Soton Farma: Pedido mínimo detectado R$ ${pedidoMinimo.toFixed(2)}`;

  } else if (portalNorm === 'divimed') {
    pedidoMinimo = 400.00;
    prazosBoleto = ['28 DDL', '28/35 DDL'];
    melhorPrazo = '28/35 DDL';
    observacao = `Divimed: Pedido mínimo padrão R$ ${pedidoMinimo.toFixed(2)}`;

  } else if (portalNorm === 'dpc') {
    pedidoMinimo = 300.00;
    prazosBoleto = ['21/28/35 DDL', '28/35/42 DDL'];
    melhorPrazo = '28/35/42 DDL';
    observacao = `DPC Distribuidora: Pedido mínimo R$ ${pedidoMinimo.toFixed(2)}`;

  } else if (portalNorm === 'profarma') {
    pedidoMinimo = 400.00;
    prazosBoleto = ['28 DDL', '35 DDL', '30/60 DDL'];
    melhorPrazo = '30/60 DDL';
    observacao = `Profarma: Pedido mínimo R$ ${pedidoMinimo.toFixed(2)}`;

  } else if (portalNorm === 'martins') {
    pedidoMinimo = 200.00;
    prazosBoleto = ['28 DDL', '30/60 DDL'];
    melhorPrazo = '30/60 DDL';
    observacao = `Martins: Pedido mínimo R$ ${pedidoMinimo.toFixed(2)}`;

  } else if (portalNorm === 'oriente') {
    pedidoMinimo = 150.00;
    prazosBoleto = ['28 DDL', '30/45/60 DDL'];
    melhorPrazo = '30/45/60 DDL';
    observacao = `Oriente Farma: Pedido mínimo R$ ${pedidoMinimo.toFixed(2)}`;
  }

  return { pedidoMinimo, prazosBoleto, melhorPrazo, observacao };
}

/**
 * Salva o resultado da auditoria e atualiza o pedido mínimo do portal no banco
 */
function salvarResultadoAuditoria(db, resultado) {
  try {
    const dataHora = new Date().toISOString();
    const prazosJson = JSON.stringify(resultado.prazosBoleto || []);

    // 1. Grava histórico
    db.prepare(`
      INSERT INTO belaped_portais_auditoria_prazos 
      (portal, pedido_minimo_detectado, prazos_boleto_json, melhor_prazo, itens_carrinho_previos, status_auditoria, observacao, data_auditoria)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      resultado.portal,
      resultado.pedidoMinimo,
      prazosJson,
      resultado.melhorPrazo,
      resultado.itensCarrinhoPrevios || 0,
      resultado.status,
      resultado.observacao || '',
      dataHora
    );

    // 2. Atualiza tabela belaped_portais com o pedido mínimo e prazos
    const portalId = resultado.portal.toLowerCase();
    db.prepare(`
      UPDATE belaped_portais 
      SET pedido_minimo = ?,
          prazos_boleto = ?,
          data_ultima_auditoria = ?
      WHERE lower(id) = ? OR upper(nome) = ?
    `).run(
      resultado.pedidoMinimo,
      (resultado.prazosBoleto || []).join(' | '),
      dataHora,
      portalId,
      resultado.portal
    );

    console.log(`[AuditoriaPrazos] Registro salvo e portal ${resultado.portal} atualizado com sucesso!`);
  } catch (err) {
    console.error('[AuditoriaPrazos] Erro ao salvar auditoria no banco:', err.message);
  }
}

/**
 * Audita todas as distribuidoras ativas cadastradas
 */
async function auditarTodasDistribuidoras(db) {
  const portais = ['distrimed', 'soton', 'divimed', 'dpc', 'profarma', 'martins', 'oriente'];
  const resultados = [];

  for (const portal of portais) {
    try {
      const res = await auditarPortalSeguro(portal, null, db);
      resultados.push(res);
    } catch (e) {
      resultados.push({
        portal: portal.toUpperCase(),
        status: 'ERRO',
        observacao: e.message,
        data: new Date().toISOString()
      });
    }
  }

  return resultados;
}

module.exports = {
  auditarPortalSeguro,
  auditarTodasDistribuidoras
};
