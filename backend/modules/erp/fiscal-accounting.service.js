/**
 * Belinha ERP - Fiscal Accounting & Tax Segregation Service
 * Motor Contábil e Fiscal Especializado no Varejo Farmacêutico (Simples Nacional - Anexo I)
 * 
 * Legislação e Referências:
 * - PIS/COFINS Monofásico: Leis 10.147/2000 e 10.865/2004 (CST 04 - Alíquota Zero no Varejo)
 * - Segregação no Simples: Lei Complementar 123/2006, art. 18, § 4º-A, inciso I
 * - ICMS ST: Convênio ICMS 142/2018 e RICMS/MG (CSOSN 500 / CFOP 5.405)
 * - SPED Fiscal: EFD ICMS/IPI (Guia Prático da EFD - Blocos 0, C e 9)
 */

const { db, initErpDatabase } = require('./erp-database');

// Composição percentual média dos tributos no Anexo I do Simples Nacional (Faixas 1 a 3)
// No PGDAS-D:
// Ao marcar "com Substituição Tributária de ICMS", o percentual de ICMS (~33.5%) é deduzido.
// Ao marcar "Tributação Monofásica de PIS/COFINS", as parcelas de PIS (~2.76%) e COFINS (~12.74%) são deduzidas.
const COMPOSICAO_ANEXO_I = {
  ICMS: 0.3350,
  PIS: 0.0276,
  COFINS: 0.1274,
  OUTROS: 0.5100 // IRPJ + CSLL + CPP (recolhidos mesmo com monofasia e ST)
};

// Tabela de Faixas Oficiais do Anexo I da LC 123/2006 (Comércio)
const TABELA_ANEXO_I = [
  { faixa: 1, limite: 180000.00, aliquota: 0.0400, deducao: 0.00 },
  { faixa: 2, limite: 360000.00, aliquota: 0.0730, deducao: 5940.00 },
  { faixa: 3, limite: 720000.00, aliquota: 0.0950, deducao: 13860.00 },
  { faixa: 4, limite: 1800000.00, aliquota: 0.1070, deducao: 22500.00 },
  { faixa: 5, limite: 3600000.00, aliquota: 0.1430, deducao: 87300.00 },
  { faixa: 6, limite: 4800000.00, aliquota: 0.1900, deducao: 378000.00 }
];

/**
 * Validação de integridade do NCM (8 dígitos numéricos válidos)
 */
function validarNcm(ncm) {
  if (!ncm) return false;
  const limpo = String(ncm).replace(/\D/g, '');
  return limpo.length === 8 && !/^0+$/.test(limpo);
}

/**
 * Calcula a RBT12 (Receita Bruta dos 12 meses anteriores) e a Alíquota Efetiva do Simples Nacional
 * @param {string} competencia 'YYYY-MM'
 * @returns {Object} Dados de RBT12, Faixa e Alíquota Efetiva
 */
function calcularRbt12EAliquotas(competencia) {
  initErpDatabase();

  const [anoStr, mesStr] = competencia.split('-');
  const ano = parseInt(anoStr, 10);
  const mes = parseInt(mesStr, 10);

  // Determina os 12 meses anteriores
  const mesesAnteriores = [];
  for (let i = 1; i <= 12; i++) {
    const d = new Date(ano, mes - 1 - i, 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    mesesAnteriores.push(`${y}-${m}`);
  }

  const placeholders = mesesAnteriores.map(() => '?').join(',');
  const row = db.prepare(`
    SELECT COALESCE(SUM(total_value), 0) as rbt12
    FROM sales
    WHERE strftime('%Y-%m', sale_date) IN (${placeholders})
      AND status != 'CANCELADA'
  `).get(...mesesAnteriores);

  const rbt12 = Math.max(0, Number(row?.rbt12 || 0));

  // Enquadra na faixa do Anexo I
  let faixaEncontrada = TABELA_ANEXO_I[0];
  for (const f of TABELA_ANEXO_I) {
    if (rbt12 <= f.limite) {
      faixaEncontrada = f;
      break;
    }
  }

  // Fórmula: ((RBT12 * Alíquota Nominal) - Parcela a Deduzir) / RBT12
  let aliquotaEfetiva = faixaEncontrada.aliquota;
  if (rbt12 > 0) {
    aliquotaEfetiva = ((rbt12 * faixaEncontrada.aliquota) - faixaEncontrada.deducao) / rbt12;
    aliquotaEfetiva = Math.max(0.04, aliquotaEfetiva); // Mínimo de 4% da Faixa 1
  }

  return {
    rbt12,
    faixa: faixaEncontrada.faixa,
    aliquotaNominal: faixaEncontrada.aliquota,
    parcelaDeducao: faixaEncontrada.deducao,
    aliquotaEfetiva: Math.round(aliquotaEfetiva * 10000) / 10000 // 4 casas decimais
  };
}

/**
 * Classifica um produto vendido de acordo com o cruzamento das regras tributárias
 */
function classificarItemFiscal(item) {
  const ncm = (item.ncm || '').replace(/\D/g, '');
  const cfop = String(item.cfop || '').trim();
  const cstPis = String(item.cst_pis || '').trim();
  const flagMonofasico = String(item.tributacao_monofasica || '').toUpperCase() === 'S';
  const flagSt = Number(item.aliquota_st || 0) > 0 || cfop === '5405';

  // 1. Validação do NCM
  if (!validarNcm(ncm)) {
    return {
      grupo: 'INDETERMINADO',
      motivo: 'NCM inexistente ou fora do padrão de 8 dígitos',
      isMonofasico: false,
      isIcmsSt: false,
      csosn: '102',
      cstPisCofins: '49',
      cfop: '5102'
    };
  }

  // 2. Classificação de Monofásico (PIS/COFINS)
  // Cap 30 (Medicamentos), Cap 33 (Cosméticos específicos), Cap 34 (Sabonetes específicos), 9603 (Escovas)
  const isNcmMedicamento = ncm.startsWith('3003') || ncm.startsWith('3004') || 
                           ncm.startsWith('3001') || ncm.startsWith('3002') || 
                           ncm.startsWith('3005') || ncm.startsWith('3006');
  const isNcmPerfumariaMonofasica = ncm.startsWith('3303') || ncm.startsWith('3304') || 
                                    ncm.startsWith('3305') || ncm.startsWith('3307') ||
                                    ncm.startsWith('3401') || ncm.startsWith('960321');

  const isMonofasico = flagMonofasico || cstPis === '04' || isNcmMedicamento || isNcmPerfumariaMonofasica;

  // 3. Classificação de ICMS Substituição Tributária (ST)
  // No varejo farmacêutico em Minas Gerais, praticamente todo o Capítulo 30 e perfumaria estão sujeitos a ST
  const isIcmsSt = flagSt || isNcmMedicamento || isNcmPerfumariaMonofasica;

  if (isMonofasico && isIcmsSt) {
    return {
      grupo: 'MONOFASICO_E_ST',
      cstPisCofins: '04',
      csosn: '500',
      cfop: '5405',
      isMonofasico: true,
      isIcmsSt: true
    };
  } else if (!isMonofasico && isIcmsSt) {
    return {
      grupo: 'APENAS_ST',
      cstPisCofins: '01',
      csosn: '500',
      cfop: '5405',
      isMonofasico: false,
      isIcmsSt: true
    };
  } else if (isMonofasico && !isIcmsSt) {
    return {
      grupo: 'APENAS_MONOFASICO',
      cstPisCofins: '04',
      csosn: '102',
      cfop: '5102',
      isMonofasico: true,
      isIcmsSt: false
    };
  }

  return {
    grupo: 'TRIBUTADO_INTEGRAL',
    cstPisCofins: '01',
    csosn: '102',
    cfop: '5102',
    isMonofasico: false,
    isIcmsSt: false
  };
}

/**
 * Processa a Apuração Fiscal do Período
 * @param {string} competencia 'YYYY-MM'
 * @param {Object} options Opções de apuração (aliquotaManual, dataInicial, dataFinal)
 */
async function processarApuracaoFiscal(competencia, options = {}) {
  initErpDatabase();

  const closingId = `APURACAO_${competencia.replace('-', '_')}`;
  const { aliquotaManual = null, dataInicial = null, dataFinal = null } = options;

  // 1. Obtém a Alíquota Efetiva calculada por RBT12 ou sobrescrita manual
  const rbtCalc = calcularRbt12EAliquotas(competencia);
  const aliquotaEfetiva = (aliquotaManual !== null && !isNaN(aliquotaManual) && Number(aliquotaManual) > 0)
    ? Number(aliquotaManual)
    : rbtCalc.aliquotaEfetiva;

  // 2. Extrai vendas e cupons do período
  let whereSales = `strftime('%Y-%m', s.sale_date) = ?`;
  const paramsSales = [competencia];

  if (dataInicial && dataFinal) {
    whereSales = `date(s.sale_date) >= date(?) AND date(s.sale_date) <= date(?)`;
    paramsSales.length = 0;
    paramsSales.push(dataInicial, dataFinal);
  }

  const sales = db.prepare(`
    SELECT s.id, s.sale_date, s.sale_time, s.total_value, s.discount_value,
           s.fiscal_status, s.nfe_number, s.nfe_series, s.access_key, s.status
    FROM sales s
    WHERE ${whereSales} AND s.status != 'CANCELADA'
    ORDER BY s.sale_date ASC
  `).all(...paramsSales);

  const salesCanceladas = db.prepare(`
    SELECT COALESCE(SUM(total_value), 0) as total_cancelado, COUNT(*) as qtd_canceladas
    FROM sales s
    WHERE ${whereSales} AND s.status = 'CANCELADA'
  `).get(...paramsSales);

  // 3. Extrai itens vendidos com dados cadastrais e fiscais dos produtos
  let whereItems = `strftime('%Y-%m', s.sale_date) = ?`;
  const paramsItems = [competencia];
  if (dataInicial && dataFinal) {
    whereItems = `date(s.sale_date) >= date(?) AND date(s.sale_date) <= date(?)`;
    paramsItems.length = 0;
    paramsItems.push(dataInicial, dataFinal);
  }

  const items = db.prepare(`
    SELECT si.id as item_id, si.sale_id, si.product_code, si.barcode, si.product_name,
           si.quantity, si.unit_price, si.total_price,
           p.ncm, p.cest, p.tributacao_monofasica, p.cst_pis, p.cst_cofins, p.aliquota_st,
           s.sale_date, s.fiscal_status, s.nfe_number, s.access_key
    FROM sale_items si
    JOIN sales s ON s.id = si.sale_id
    LEFT JOIN products p ON p.code = si.product_code
    WHERE ${whereItems} AND s.status != 'CANCELADA'
  `).all(...paramsItems);

  let faturamentoBruto = 0;
  let recMonofasicoSt = 0;
  let recApenasSt = 0;
  let recApenasMonofasico = 0;
  let recTributadaIntegral = 0;
  let recIndeterminada = 0;

  const inconsistenciasMap = new Map();

  // 4. Cruzamento e Classificação dos Itens
  for (const it of items) {
    const valorItem = Number(it.total_price || 0);
    faturamentoBruto += valorItem;

    const classif = classificarItemFiscal(it);

    switch (classif.grupo) {
      case 'MONOFASICO_E_ST':
        recMonofasicoSt += valorItem;
        break;
      case 'APENAS_ST':
        recApenasSt += valorItem;
        break;
      case 'APENAS_MONOFASICO':
        recApenasMonofasico += valorItem;
        break;
      case 'TRIBUTADO_INTEGRAL':
        recTributadaIntegral += valorItem;
        break;
      case 'INDETERMINADO':
      default:
        // Safe Default: Não trava a apuração, joga provisoriamente em tributação integral
        recIndeterminada += valorItem;
        recTributadaIntegral += valorItem;

        // Registra ou acumula inconsistência por produto
        const pKey = it.product_code || it.barcode || it.product_name;
        if (inconsistenciasMap.has(pKey)) {
          const inc = inconsistenciasMap.get(pKey);
          inc.impacto_valor += valorItem;
          inc.vendas_count += 1;
        } else {
          inconsistenciasMap.set(pKey, {
            closing_id: closingId,
            product_code: it.product_code,
            barcode: it.barcode || 'S/EAN',
            product_name: it.product_name,
            issue_type: !validarNcm(it.ncm) ? 'NCM_AUSENTE' : 'CADASTRO_INCOMPLETO',
            detalhe: classif.motivo || 'Cadastro fiscal ausente ou divergente',
            impacto_valor: valorItem,
            vendas_count: 1
          });
        }
        break;
    }
  }

  const inconsistencias = Array.from(inconsistenciasMap.values());

  // 5. Cálculos Financeiros e Tributários do DAS
  // Cenário 1: Sem Segregação (Calculado com a alíquota cheia sobre todo o faturamento)
  const dasSemSegregacao = faturamentoBruto * aliquotaEfetiva;

  // Cenário 2: Com Segregação Rigorosa da LC 123/2006:
  // Balde 1 (Monofásico + ST): Abate ICMS (33.5%), PIS (2.76%) e COFINS (12.74%) -> Paga apenas 51% (IRPJ, CSLL, CPP)
  const impostoBalde1 = recMonofasicoSt * (aliquotaEfetiva * COMPOSICAO_ANEXO_I.OUTROS);

  // Balde 2 (Apenas ST): Abate ICMS (33.5%) -> Paga PIS/COFINS e OUTROS (66.5%)
  const impostoBalde2 = recApenasSt * (aliquotaEfetiva * (1 - COMPOSICAO_ANEXO_I.ICMS));

  // Balde 3 (Apenas Monofásico): Abate PIS/COFINS (15.5%) -> Paga ICMS e OUTROS (84.5%)
  const impostoBalde3 = recApenasMonofasico * (aliquotaEfetiva * (1 - (COMPOSICAO_ANEXO_I.PIS + COMPOSICAO_ANEXO_I.COFINS)));

  // Balde 4 (Integral): Paga 100% da alíquota
  const impostoBalde4 = recTributadaIntegral * aliquotaEfetiva;

  const dasComSegregacao = impostoBalde1 + impostoBalde2 + impostoBalde3 + impostoBalde4;
  const economiaTributaria = Math.max(0, dasSemSegregacao - dasComSegregacao);
  const percentualEconomia = dasSemSegregacao > 0 ? ((economiaTributaria / dasSemSegregacao) * 100) : 0;

  // 6. Gravação no Banco de Dados
  db.prepare(`
    INSERT INTO tax_closings (
      id, competencia, data_fechamento, faturamento_bruto, total_cancelamentos,
      faturamento_liquido, rec_monofasico_st, rec_apenas_st, rec_apenas_monofasico,
      rec_tributada_integral, rec_indeterminada, aliquota_efetiva_estimada,
      das_estimado_sem_segregacao, das_estimado_com_segregacao, economia_tributaria_estimada,
      total_documentos, total_itens, inconsistencias_count, status
    ) VALUES (
      ?, ?, datetime('now', 'localtime'), ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?, ?
    )
    ON CONFLICT(id) DO UPDATE SET
      data_fechamento = datetime('now', 'localtime'),
      faturamento_bruto = excluded.faturamento_bruto,
      total_cancelamentos = excluded.total_cancelamentos,
      faturamento_liquido = excluded.faturamento_liquido,
      rec_monofasico_st = excluded.rec_monofasico_st,
      rec_apenas_st = excluded.rec_apenas_st,
      rec_apenas_monofasico = excluded.rec_apenas_monofasico,
      rec_tributada_integral = excluded.rec_tributada_integral,
      rec_indeterminada = excluded.rec_indeterminada,
      aliquota_efetiva_estimada = excluded.aliquota_efetiva_estimada,
      das_estimado_sem_segregacao = excluded.das_estimado_sem_segregacao,
      das_estimado_com_segregacao = excluded.das_estimado_com_segregacao,
      economia_tributaria_estimada = excluded.economia_tributaria_estimada,
      total_documentos = excluded.total_documentos,
      total_itens = excluded.total_itens,
      inconsistencias_count = excluded.inconsistencias_count,
      status = excluded.status
  `).run(
    closingId, competencia, faturamentoBruto, salesCanceladas.total_cancelado || 0,
    faturamentoBruto, recMonofasicoSt, recApenasSt, recApenasMonofasico,
    recTributadaIntegral, recIndeterminada, aliquotaEfetiva,
    dasSemSegregacao, dasComSegregacao, economiaTributaria,
    sales.length, items.length, inconsistencias.length,
    inconsistencias.length > 0 ? 'COM_PENDENCIAS' : 'CONCLUIDO'
  );

  // Atualiza as pendências no banco
  db.prepare('DELETE FROM fiscal_audit_issues WHERE closing_id = ?').run(closingId);
  const insertIssueStmt = db.prepare(`
    INSERT INTO fiscal_audit_issues (closing_id, product_code, barcode, product_name, issue_type, detalhe, impacto_valor)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const runInsertIssues = db.transaction((issues) => {
    for (const inc of issues) {
      insertIssueStmt.run(
        inc.closing_id, inc.product_code, inc.barcode, inc.product_name,
        inc.issue_type, inc.detalhe, inc.impacto_valor
      );
    }
  });
  runInsertIssues(inconsistencias);

  return {
    closingId,
    competencia,
    faturamentoBruto,
    totalCancelamentos: salesCanceladas.total_cancelado || 0,
    faturamentoLiquido: faturamentoBruto,
    rbt12: rbtCalc.rbt12,
    faixaSimples: rbtCalc.faixa,
    aliquotaEfetiva,
    aliquotaManualInformada: aliquotaManual !== null,
    segregacao: {
      monofasicoComSt: recMonofasicoSt,
      apenasSt: recApenasSt,
      apenasMonofasico: recApenasMonofasico,
      tributadaIntegral: recTributadaIntegral,
      indeterminadaPendente: recIndeterminada,
      percentualMonofasicoSt: faturamentoBruto > 0 ? ((recMonofasicoSt / faturamentoBruto) * 100) : 0
    },
    das: {
      valorSemSegregacao: dasSemSegregacao,
      valorComSegregacao: dasComSegregacao,
      economiaTributariaMes: economiaTributaria,
      percentualEconomia: Math.round(percentualEconomia * 100) / 100
    },
    guiaPgdas: [
      {
        campo: 'Receita com PIS/COFINS Monofásico e ICMS ST',
        deducoes: 'Dedução de ICMS, PIS e COFINS',
        valor: recMonofasicoSt,
        percentual: faturamentoBruto > 0 ? (recMonofasicoSt / faturamentoBruto) * 100 : 0
      },
      {
        campo: 'Receita com ICMS ST e PIS/COFINS Normal',
        deducoes: 'Dedução de ICMS apenas',
        valor: recApenasSt,
        percentual: faturamentoBruto > 0 ? (recApenasSt / faturamentoBruto) * 100 : 0
      },
      {
        campo: 'Receita com PIS/COFINS Monofásico e ICMS Normal',
        deducoes: 'Dedução de PIS e COFINS apenas',
        valor: recApenasMonofasico,
        percentual: faturamentoBruto > 0 ? (recApenasMonofasico / faturamentoBruto) * 100 : 0
      },
      {
        campo: 'Receita Tributada Integralmente (Sem Substituição)',
        deducoes: 'Nenhuma dedução (Tributação Cheia)',
        valor: recTributadaIntegral,
        percentual: faturamentoBruto > 0 ? (recTributadaIntegral / faturamentoBruto) * 100 : 0
      }
    ],
    estatisticas: {
      totalVendas: sales.length,
      totalItens: items.length,
      totalCanceladas: salesCanceladas.qtd_canceladas || 0,
      totalInconsistencias: inconsistencias.length
    },
    inconsistenciasCadastrais: inconsistencias
  };
}

/**
 * Quick-Fix: Atualiza o cadastro do produto com dados fiscais corretos e reavalia pendências
 */
function quickFixProdutoFiscal(productCode, updates = {}) {
  initErpDatabase();

  const { ncm, cest, tributacao_monofasica, cst_pis, cst_cofins, aliquota_st } = updates;

  const current = db.prepare('SELECT * FROM products WHERE code = ?').get(productCode);
  if (!current) {
    throw new Error(`Produto ${productCode} não encontrado no catálogo.`);
  }

  const novoNcm = ncm !== undefined ? String(ncm).trim() : current.ncm;
  const novoCest = cest !== undefined ? String(cest).trim() : current.cest;
  const novoMono = tributacao_monofasica !== undefined ? String(tributacao_monofasica).toUpperCase() : current.tributacao_monofasica;
  const novoCstPis = cst_pis !== undefined ? String(cst_pis).trim() : current.cst_pis;
  const novoCstCofins = cst_cofins !== undefined ? String(cst_cofins).trim() : current.cst_cofins;
  const novaAliqSt = aliquota_st !== undefined ? Number(aliquota_st) : current.aliquota_st;

  db.prepare(`
    UPDATE products
    SET ncm = ?, cest = ?, tributacao_monofasica = ?, cst_pis = ?, cst_cofins = ?, aliquota_st = ?, updated_at = datetime('now', 'localtime')
    WHERE code = ?
  `).run(novoNcm, novoCest, novoMono, novoCstPis, novoCstCofins, novaAliqSt, productCode);

  // Se o NCM agora for válido, atualiza o status na tabela de auditoria
  if (validarNcm(novoNcm)) {
    db.prepare(`
      UPDATE fiscal_audit_issues
      SET status = 'CORRIGIDO'
      WHERE product_code = ?
    `).run(productCode);
  }

  return {
    success: true,
    productCode,
    updatedValues: {
      ncm: novoNcm,
      cest: novoCest,
      tributacao_monofasica: novoMono,
      cst_pis: novoCstPis,
      cst_cofins: novoCstCofins,
      aliquota_st: novaAliqSt
    }
  };
}

/**
 * Formata números no padrão SPED (separador vírgula, sem separador de milhar)
 */
function fmtSpedNum(num, casas = 2) {
  if (num === null || num === undefined || isNaN(num)) return '';
  return Number(num).toFixed(casas).replace('.', ',');
}

/**
 * Formata datas no padrão SPED (DDMMAAAA)
 */
function fmtSpedData(dataIso) {
  if (!dataIso) return '';
  const limpa = String(dataIso).split('T')[0].replace(/\D/g, ''); // YYYYMMDD
  if (limpa.length === 8) {
    return `${limpa.slice(6, 8)}${limpa.slice(4, 6)}${limpa.slice(0, 4)}`; // DDMMAAAA
  }
  return '';
}

/**
 * Gera o arquivo oficial do SPED Fiscal (EFD ICMS/IPI) em formato .TXT
 * Blocos 0, C e 9
 */
function gerarSpedFiscalEfd(competencia) {
  initErpDatabase();
  const config = db.prepare('SELECT * FROM fiscal_settings WHERE id = ?').get('primary') || {};

  const [ano, mes] = competencia.split('-');
  const ultimoDia = new Date(parseInt(ano, 10), parseInt(mes, 10), 0).getDate();
  const dtIni = `01${mes}${ano}`;
  const dtFin = `${String(ultimoDia).padStart(2, '0')}${mes}${ano}`;

  const linhas = [];
  const registroContador = {};

  function addLinha(reg, campos = []) {
    const linha = `|${reg}|${campos.join('|')}|`;
    linhas.push(linha);
    registroContador[reg] = (registroContador[reg] || 0) + 1;
  }

  // === BLOCO 0: Abertura e Cadastro ===
  addLinha('0000', [
    '018',
    '0',
    dtIni,
    dtFin,
    (config.razao_social || 'DROGARIA BELA FARMA LTDA').toUpperCase(),
    (config.cnpj || '47378578000140').replace(/\D/g, ''),
    config.uf || 'MG',
    (config.inscricao_estadual || '').replace(/\D/g, ''),
    config.cod_municipio_ibge || '3136702',
    '',
    '',
    '1',
    '0'
  ]);

  addLinha('0001', ['0']);

  // Registro 0100: Dados do Contabilista (Obrigatório pelo Guia Prático da EFD)
  const nomeContador = (config.contador_nome || 'EDIVALDO CRUZ').toUpperCase().substring(0, 100);
  const cpfContador = String(config.contador_cpf || '').replace(/\D/g, '');
  const crcContador = String(config.contador_crc || 'MG000000O0').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const cnpjContabilidade = String(config.contador_cnpj || '').replace(/\D/g, '');
  const cepContador = String(config.contador_cep || config.cep || '36033000').replace(/\D/g, '');
  const endContador = (config.contador_endereco || config.logradouro || 'RUA PREVIDENCIARIOS').substring(0, 60).toUpperCase();
  const numContador = String(config.contador_numero || config.numero || '100').substring(0, 10);
  const bairroContador = (config.contador_bairro || config.bairro || 'PREVIDENCIARIOS').substring(0, 60).toUpperCase();
  const foneContador = String(config.contador_telefone || '3232150000').replace(/\D/g, '').substring(0, 11);
  const emailContador = String(config.contador_email || 'contabil@belafarma.com.br');
  const codMunContador = String(config.cod_municipio_ibge || '3136702').replace(/\D/g, '');

  addLinha('0100', [
    nomeContador,
    cpfContador,
    crcContador,
    cnpjContabilidade,
    cepContador,
    endContador,
    numContador,
    '', // Compl
    bairroContador,
    foneContador,
    '', // Fax
    emailContador,
    codMunContador
  ]);

  // Registro 0150: Cadastro de Participantes (Fornecedores das Notas de Entrada do período)
  const fornecedoresPeriodo = db.prepare(`
    SELECT DISTINCT cnpj_supplier, supplier_name, supplier_ie, supplier_ibge_code, supplier_address, supplier_uf
    FROM invoices
    WHERE strftime('%Y-%m', issue_date) = ? AND cnpj_supplier IS NOT NULL
  `).all(competencia);

  for (const f of fornecedoresPeriodo) {
    const rawCnpj = String(f.cnpj_supplier || '').replace(/\D/g, '');
    if (!rawCnpj) continue;
    const cnpjLimpo = rawCnpj.padStart(14, '0');
    const codPart = `FORN_${cnpjLimpo}`;
    const ieLimpa = String(f.supplier_ie || '').replace(/\D/g, '') || 'ISENTO';
    const codIbge = String(f.supplier_ibge_code || '3136702').replace(/\D/g, '');

    addLinha('0150', [
      codPart,
      (f.supplier_name || 'FORNECEDOR').substring(0, 60).toUpperCase(),
      '1058',
      cnpjLimpo,
      '',
      ieLimpa,
      codIbge,
      '',
      (f.supplier_address || 'ENDERECO PRINCIPAL').substring(0, 60),
      '',
      '',
      ''
    ]);
  }

  // Registro 0200: Produtos movimentados no período (Vendas e Entradas)
  const produtosPeriodo = db.prepare(`
    SELECT DISTINCT p.code, p.name, p.barcode, p.ncm, p.cest
    FROM products p
    WHERE p.code IN (
      SELECT si.product_code 
      FROM sale_items si 
      JOIN sales s ON s.id = si.sale_id 
      WHERE strftime('%Y-%m', s.sale_date) = ?
      
      UNION
      
      SELECT ii.product_code 
      FROM invoice_items ii 
      JOIN invoices i ON i.id = ii.invoice_id 
      WHERE strftime('%Y-%m', i.issue_date) = ?
    )
  `).all(competencia, competencia);

  for (const prod of produtosPeriodo) {
    addLinha('0200', [
      prod.code,
      prod.name.substring(0, 60),
      prod.barcode && /^\d{8,14}$/.test(prod.barcode) ? prod.barcode : '',
      '',
      'UN',
      '00',
      (prod.ncm || '30049099').replace(/\D/g, ''),
      '',
      '',
      '',
      '0',
      (prod.cest || '').replace(/\D/g, '')
    ]);
  }

  addLinha('0990', [linhas.length + 1]);

  // === BLOCO B: Escrituração e Apuração do ISS (DF) ===
  // Sem movimento (IND_MOV = '1')
  addLinha('B001', ['1']);
  addLinha('B990', ['2']);

  // === BLOCO C: Documentos Fiscais ===
  const startBlocoCIdx = linhas.length;
  addLinha('C001', ['0']);

  // 1. Escrituração das Notas Fiscais de Entrada (Modelo 55 - Compra)
  const notasEntradaMes = db.prepare(`
    SELECT i.*
    FROM invoices i
    WHERE strftime('%Y-%m', i.issue_date) = ? AND i.status != 'Cancelada'
    ORDER BY i.issue_date ASC
  `).all(competencia);

  for (const inv of notasEntradaMes) {
    const rawCnpj = String(inv.cnpj_supplier || '').replace(/\D/g, '');
    const cnpjForn = rawCnpj ? rawCnpj.padStart(14, '0') : '';
    const codPart = cnpjForn ? `FORN_${cnpjForn}` : '';
    const numNf = String(inv.invoice_number || '').replace(/\D/g, '') || '1';
    const chave = inv.access_key || '';
    const dtDoc = fmtSpedData(inv.issue_date);
    const vlDoc = Number(inv.total_value || 0);
    const vlIcms = Number(inv.total_icms || 0);
    const vlSt = Number(inv.total_icms_st || 0);
    const vlIpi = Number(inv.total_ipi || 0);

    // C100: Cabeçalho NF-e de Entrada (IND_OPER = '0', IND_EMIT = '1' - Terceiros)
    addLinha('C100', [
      '0', // 0 = Entrada
      '1', // 1 = Emissão de terceiros
      codPart,
      '55', // Modelo 55 NF-e
      '00', // Documento Regular
      String(inv.series || '1'),
      String(numNf),
      chave,
      dtDoc,
      dtDoc,
      fmtSpedNum(vlDoc),
      '1', // A prazo / normal
      '0,00',
      '0,00',
      fmtSpedNum(vlDoc - vlSt), // Valor das mercadorias
      '9', // Sem frete destacado
      '0,00',
      '0,00',
      '0,00',
      fmtSpedNum(vlIcms > 0 ? (vlDoc - vlSt) : 0), // Base ICMS
      fmtSpedNum(vlIcms),
      fmtSpedNum(vlSt > 0 ? vlDoc : 0), // Base ST
      fmtSpedNum(vlSt),
      fmtSpedNum(vlIpi),
      '0,00',
      '0,00',
      '0,00',
      '0,00'
    ]);

    // Itens da nota de entrada para resumo analítico C190
    const itensEntrada = db.prepare(`
      SELECT *
      FROM invoice_items
      WHERE invoice_id = ?
    `).all(inv.id);

    const analiticoEntrada = {};
    for (const item of itensEntrada) {
      const cst = String(item.cst_csosn || '500').replace(/\D/g, '').padEnd(3, '0').slice(-3);
      const cfop = String(item.cfop_entrada || '1403').replace(/\D/g, '') || '1403';
      const aliq = Number(item.aliquota_icms || 0);
      const chaveAgrup = `${cst}_${cfop}_${aliq}`;

      if (!analiticoEntrada[chaveAgrup]) {
        analiticoEntrada[chaveAgrup] = {
          cst,
          cfop,
          aliq,
          valorOperacao: 0,
          baseIcms: 0,
          valorIcms: 0,
          baseSt: 0,
          valorSt: 0,
          valorIpi: 0
        };
      }

      analiticoEntrada[chaveAgrup].valorOperacao += Number(item.total_cost || 0);
      analiticoEntrada[chaveAgrup].baseIcms += Number(item.base_icms || 0);
      analiticoEntrada[chaveAgrup].valorIcms += Number(item.valor_icms || 0);
      analiticoEntrada[chaveAgrup].baseSt += Number(item.base_st || 0);
      analiticoEntrada[chaveAgrup].valorSt += Number(item.valor_st || 0);
      analiticoEntrada[chaveAgrup].valorIpi += Number(item.valor_ipi || 0);
    }

    for (const k of Object.keys(analiticoEntrada)) {
      const ag = analiticoEntrada[k];
      addLinha('C190', [
        ag.cst,
        ag.cfop,
        fmtSpedNum(ag.aliq),
        fmtSpedNum(ag.valorOperacao),
        fmtSpedNum(ag.baseIcms),
        fmtSpedNum(ag.valorIcms),
        fmtSpedNum(ag.baseSt),
        fmtSpedNum(ag.valorSt),
        '0,00',
        fmtSpedNum(ag.valorIpi),
        ''
      ]);
    }
  }

  // 2. Escrituração das Notas Fiscais de Saída (Modelo 65 - NFC-e PDV)
  const vendasMes = db.prepare(`
    SELECT s.*
    FROM sales s
    WHERE strftime('%Y-%m', s.sale_date) = ?
    ORDER BY s.sale_date ASC
  `).all(competencia);

  for (const v of vendasMes) {
    const isCancelada = v.status === 'CANCELADA';
    const numNf = v.nfe_number || v.id.slice(-6).replace(/\D/g, '1');
    const chave = v.access_key || '';

    // C100: Cabeçalho
    addLinha('C100', [
      '1', // 1 = Saída
      '0', // 0 = Emissão própria
      '',
      '65', // NFC-e
      isCancelada ? '02' : '00',
      String(v.nfe_series || 1),
      String(numNf),
      chave,
      fmtSpedData(v.sale_date),
      fmtSpedData(v.sale_date),
      fmtSpedNum(v.total_value),
      '9', // Sem frete
      '0',
      '0',
      fmtSpedNum(v.discount_value),
      '0',
      '0,00',
      '0,00',
      '0,00',
      '0,00',
      '0,00',
      '0,00',
      '0,00'
    ]);

    if (!isCancelada) {
      const itensDaVenda = db.prepare(`
        SELECT si.*, p.ncm, p.aliquota_st, p.tributacao_monofasica, p.cst_pis
        FROM sale_items si
        LEFT JOIN products p ON p.code = si.product_code
        WHERE si.sale_id = ?
      `).all(v.id);

      const analitico = {};
      for (const item of itensDaVenda) {
        const classif = classificarItemFiscal(item);
        const chaveAgrupamento = `${classif.csosn}_${classif.cfop}`;
        if (!analitico[chaveAgrupamento]) {
          analitico[chaveAgrupamento] = {
            csosn: classif.csosn,
            cfop: classif.cfop,
            valor: 0
          };
        }
        analitico[chaveAgrupamento].valor += Number(item.total_price);
      }

      for (const k of Object.keys(analitico)) {
        const ag = analitico[k];
        addLinha('C190', [
          ag.csosn,
          ag.cfop,
          '0,00',
          fmtSpedNum(ag.valor),
          '0,00',
          '0,00',
          '0,00',
          '0,00',
          '0,00',
          '0,00',
          ''
        ]);
      }
    }
  }

  const qtdLinhasBlocoC = (linhas.length - startBlocoCIdx) + 1;
  addLinha('C990', [qtdLinhasBlocoC]);

  // === BLOCO D: Documentos Fiscais II - Serviços (ICMS / Fretes / Telecom) ===
  // Sem movimento (IND_MOV = '1')
  addLinha('D001', ['1']);
  addLinha('D990', ['2']);

  // === BLOCO E: Apuração do ICMS e do IPI ===
  // Obrigatório para o PVA da Receita Federal
  addLinha('E001', ['0']);
  addLinha('E100', [dtIni, dtFin]);
  addLinha('E110', [
    '0,00', // VL_TOT_DEBITOS
    '0,00', // VL_AJ_DEBITOS
    '0,00', // VL_TOT_AJ_DEBITOS
    '0,00', // VL_ESTORNOS_CRED
    '0,00', // VL_TOT_CREDITOS
    '0,00', // VL_AJ_CREDITOS
    '0,00', // VL_TOT_AJ_CREDITOS
    '0,00', // VL_ESTORNOS_DEB
    '0,00', // VL_SLD_CREDOR_ANT
    '0,00', // VL_SLD_APURADO
    '0,00', // VL_TOT_DED
    '0,00', // VL_ICMS_RECOLHER
    '0,00', // VL_SLD_CREDOR_TRANSPORTAR
    '0,00'  // DEB_ESP
  ]);
  addLinha('E990', ['4']);

  // === BLOCO G: Controle do Crédito de ICMS do Ativo Permanente (CIAP) ===
  // Sem movimento (IND_MOV = '1')
  addLinha('G001', ['1']);
  addLinha('G990', ['2']);

  // === BLOCO H: Inventário Físico ===
  // Sem movimento no mês corrente (IND_MOV = '1')
  addLinha('H001', ['1']);
  addLinha('H990', ['2']);

  // === BLOCO 1: Outras Informações ===
  addLinha('1001', ['0']);
  addLinha('1010', ['N', 'N', 'N', 'N', 'N', 'N', 'N', 'N', 'N']);
  addLinha('1990', ['3']);

  // === BLOCO 9: Encerramento e Totalizadores ===
  const startBloco9Idx = linhas.length;
  addLinha('9001', ['0']);

  // Tipos de registros presentes no arquivo (incluindo os próprios 9001, 9900, 9990, 9999)
  const regsNoArquivo = Object.keys(registroContador);
  const totalTiposRegistro = regsNoArquivo.length + 4;

  for (const reg of regsNoArquivo) {
    addLinha('9900', [reg, String(registroContador[reg])]);
  }
  addLinha('9900', ['9001', '1']);
  addLinha('9900', ['9900', String(totalTiposRegistro)]);
  addLinha('9900', ['9990', '1']);
  addLinha('9900', ['9999', '1']);

  const qtdLinhasBloco9 = (linhas.length - startBloco9Idx) + 2;
  addLinha('9990', [String(qtdLinhasBloco9)]);
  addLinha('9999', [String(linhas.length + 1)]);

  return linhas.join('\r\n');
}

/**
 * Exporta o Relatório Contábil Analítico em CSV formatado para contabilidade
 */
function exportarRelatorioContabilCsv(competencia) {
  initErpDatabase();

  const apuracao = db.prepare('SELECT * FROM tax_closings WHERE id = ?').get(`APURACAO_${competencia.replace('-', '_')}`);
  const items = db.prepare(`
    SELECT si.product_code, si.barcode, si.product_name, si.quantity, si.unit_price, si.total_price,
           p.ncm, p.cest, p.tributacao_monofasica, p.cst_pis, p.aliquota_st,
           s.sale_date, s.access_key, s.nfe_number
    FROM sale_items si
    JOIN sales s ON s.id = si.sale_id
    LEFT JOIN products p ON p.code = si.product_code
    WHERE strftime('%Y-%m', s.sale_date) = ? AND s.status != 'CANCELADA'
    ORDER BY s.sale_date ASC
  `).all(competencia);

  const linhasCsv = [];
  linhasCsv.push(`RELATÓRIO CONTÁBIL & FISCAL - APURAÇÃO SIMPLES NACIONAL (BELAFARMA)`);
  linhasCsv.push(`Competência:;${competencia};Data de Emissão:;${new Date().toLocaleString('pt-BR')}`);
  linhasCsv.push(``);
  linhasCsv.push(`RESUMO DA APURAÇÃO FISCAL`);
  linhasCsv.push(`Faturamento Bruto:;R$ ${(apuracao?.faturamento_bruto || 0).toFixed(2)}`);
  linhasCsv.push(`Receita PIS/COFINS Monofásico + ICMS ST (Abate ICMS/PIS/COFINS):;R$ ${(apuracao?.rec_monofasico_st || 0).toFixed(2)}`);
  linhasCsv.push(`Receita Apenas ICMS ST:;R$ ${(apuracao?.rec_apenas_st || 0).toFixed(2)}`);
  linhasCsv.push(`Receita Apenas Monofásico PIS/COFINS:;R$ ${(apuracao?.rec_apenas_monofasico || 0).toFixed(2)}`);
  linhasCsv.push(`Receita Tributada Integralmente:;R$ ${(apuracao?.rec_tributada_integral || 0).toFixed(2)}`);
  linhasCsv.push(`Alíquota Efetiva do Simples Aplicada:;${((apuracao?.aliquota_efetiva_estimada || 0) * 100).toFixed(2)}%`);
  linhasCsv.push(`DAS Estimado Sem Segregação:;R$ ${(apuracao?.das_estimado_sem_segregacao || 0).toFixed(2)}`);
  linhasCsv.push(`DAS Estimado Com Segregação Legal:;R$ ${(apuracao?.das_estimado_com_segregacao || 0).toFixed(2)}`);
  linhasCsv.push(`Economia Tributária Gerada:;R$ ${(apuracao?.economia_tributaria_estimada || 0).toFixed(2)}`);
  linhasCsv.push(``);
  linhasCsv.push(`DETALHAMENTO ITEM A ITEM VENDIDO NO PERÍODO`);
  linhasCsv.push(`Data;Cupom/NF;Código;EAN;Descrição;Qtd;Vlr Unit;Total;NCM;CEST;Monofásico;ST;CST PIS;CFOP;CSOSN;Enquadramento DAS`);

  for (const it of items) {
    const cl = classificarItemFiscal(it);
    linhasCsv.push([
      it.sale_date,
      it.nfe_number || 'PDV',
      it.product_code,
      it.barcode || '',
      `"${(it.product_name || '').replace(/"/g, '""')}"`,
      Number(it.quantity).toFixed(2).replace('.', ','),
      Number(it.unit_price).toFixed(2).replace('.', ','),
      Number(it.total_price).toFixed(2).replace('.', ','),
      it.ncm || '',
      it.cest || '',
      cl.isMonofasico ? 'SIM' : 'NAO',
      cl.isIcmsSt ? 'SIM' : 'NAO',
      cl.cstPisCofins,
      cl.cfop,
      cl.csosn,
      cl.grupo
    ].join(';'));
  }

  return '\uFEFF' + linhasCsv.join('\r\n'); // BOM UTF-8 para abrir perfeitamente no Excel
}

module.exports = {
  calcularRbt12EAliquotas,
  classificarItemFiscal,
  processarApuracaoFiscal,
  quickFixProdutoFiscal,
  gerarSpedFiscalEfd,
  exportarRelatorioContabilCsv,
  validarNcm
};
