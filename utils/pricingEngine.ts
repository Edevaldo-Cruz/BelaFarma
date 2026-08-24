/**
 * pricingEngine.ts - Motor de Cálculo de Precificação e Formação de Preço Inteligente
 * Baseado na metodologia de Markup Divisor para Varejo Farmacêutico.
 */

export interface PricingInputs {
  cmv: number; // Custo de Aquisição/Compra (R$)
  impostoPercent: number; // Alíquota de Imposto (% individual / Simples Nacional / Monofásico)
  taxaCartaoPercent: number; // Taxa de Cartão / Gateway de Pagamento (%)
  custosVariaveisPercent: number; // Outros Custos Variáveis / Comissões (%)
  custoFixoPercent: number; // Custo Fixo Operacional da Loja (%)
  proLaboreSocio1Percent: number; // Pró-labore Sócio 1 (%)
  proLaboreSocio2Percent: number; // Pró-labore Sócio 2 (%)
  margemLiquidaPercent: number; // Margem Líquida Alvo / Reserva de Caixa (%)
}

export interface FinancialDecompositionItem {
  id: string;
  label: string;
  percentual: number;
  valorReais: number;
  categoria: 'custo' | 'imposto' | 'taxa' | 'fixo' | 'prolabore' | 'lucro' | 'variavel';
  cor: string;
  descricao: string;
}

export interface PricingResult {
  cmv: number;
  totalDeducoesPercent: number;
  markupDivisor: number;
  markupMultiplicador: number;
  precoSugerido: number;
  margemBrutaPercent: number;
  lucroBrutoReais: number;
  pontoEquilibrioUnitario: number; // Preço mínimo apenas para cobrir CMV + Impostos + Cartão + Fixo (sem pró-labore e sem lucro)
  decomposicao: FinancialDecompositionItem[];
  isValid: boolean;
  errorMessage?: string;
}

export interface CategoryPreset {
  id: string;
  nome: string;
  descricao: string;
  icone: string;
  impostoPercent: number;
  taxaCartaoPercent: number;
  custosVariaveisPercent: number;
  custoFixoPercent: number;
  proLaboreSocio1Percent: number;
  proLaboreSocio2Percent: number;
  margemLiquidaPercent: number;
  isCustom?: boolean;
}

export const DEFAULT_PRESETS: CategoryPreset[] = [
  {
    id: 'genericos',
    nome: 'Genéricos (Alta Margem)',
    descricao: 'Medicamentos genéricos com foco em alta rentabilidade e indicação no balcão.',
    icone: 'Pill',
    impostoPercent: 4.0,
    taxaCartaoPercent: 2.5,
    custosVariaveisPercent: 1.0,
    custoFixoPercent: 28.77,
    proLaboreSocio1Percent: 6.0,
    proLaboreSocio2Percent: 6.0,
    margemLiquidaPercent: 15.0
  },
  {
    id: 'similares',
    nome: 'Similares / Bonificados',
    descricao: 'Medicamentos similares com margem líquida média-alta.',
    icone: 'Sparkles',
    impostoPercent: 4.0,
    taxaCartaoPercent: 2.5,
    custosVariaveisPercent: 1.0,
    custoFixoPercent: 28.77,
    proLaboreSocio1Percent: 6.0,
    proLaboreSocio2Percent: 6.0,
    margemLiquidaPercent: 12.0
  },
  {
    id: 'perfumaria',
    nome: 'Perfumaria & Cosméticos',
    descricao: 'Itens de higiene, perfumaria e conveniência com tributação padrão.',
    icone: 'Sparkle',
    impostoPercent: 6.0,
    taxaCartaoPercent: 2.5,
    custosVariaveisPercent: 1.0,
    custoFixoPercent: 28.77,
    proLaboreSocio1Percent: 6.0,
    proLaboreSocio2Percent: 6.0,
    margemLiquidaPercent: 8.0
  },
  {
    id: 'referencia',
    nome: 'Marca / Referência (Alto Giro)',
    descricao: 'Medicamentos de marca/referência conhecidos, com preço travado e alto giro.',
    icone: 'Shield',
    impostoPercent: 4.0,
    taxaCartaoPercent: 2.5,
    custosVariaveisPercent: 1.0,
    custoFixoPercent: 28.77,
    proLaboreSocio1Percent: 6.0,
    proLaboreSocio2Percent: 6.0,
    margemLiquidaPercent: 4.0
  }
];

/**
 * Arredonda um número para 2 casas decimais.
 */
export function roundMoney(val: number): number {
  return Math.round((val + Number.EPSILON) * 100) / 100;
}

/**
 * Calcula a precificação completa usando Markup Divisor.
 */
export function calculatePricing(inputs: PricingInputs): PricingResult {
  const cmv = Math.max(0, Number(inputs.cmv) || 0);
  const imposto = Math.max(0, Number(inputs.impostoPercent) || 0);
  const taxaCartao = Math.max(0, Number(inputs.taxaCartaoPercent) || 0);
  const custosVar = Math.max(0, Number(inputs.custosVariaveisPercent) || 0);
  const custoFixo = Math.max(0, Number(inputs.custoFixoPercent) || 0);
  const proLabore1 = Math.max(0, Number(inputs.proLaboreSocio1Percent) || 0);
  const proLabore2 = Math.max(0, Number(inputs.proLaboreSocio2Percent) || 0);
  const margemLiquida = Math.max(0, Number(inputs.margemLiquidaPercent) || 0);

  const totalDeducoesPercent = roundMoney(
    imposto + taxaCartao + custosVar + custoFixo + proLabore1 + proLabore2 + margemLiquida
  );

  // Validação: Deduções não podem atingir ou passar de 100%
  if (totalDeducoesPercent >= 100) {
    return {
      cmv,
      totalDeducoesPercent,
      markupDivisor: 0,
      markupMultiplicador: 0,
      precoSugerido: 0,
      margemBrutaPercent: 0,
      lucroBrutoReais: 0,
      pontoEquilibrioUnitario: 0,
      decomposicao: [],
      isValid: false,
      errorMessage: `A soma das deduções (${totalDeducoesPercent.toFixed(2)}%) não pode ser igual ou superior a 100%. Reduza os percentuais de margem ou custos fixos.`
    };
  }

  // Markup Divisor = 1 - (Total Deduções / 100)
  const markupDivisor = (100 - totalDeducoesPercent) / 100;

  // Se CMV for 0, o preço sugerido é 0
  let precoSugerido = 0;
  let markupMultiplicador = 0;
  let margemBrutaPercent = 0;
  let lucroBrutoReais = 0;
  let pontoEquilibrioUnitario = 0;

  if (cmv > 0 && markupDivisor > 0) {
    precoSugerido = roundMoney(cmv / markupDivisor);
    markupMultiplicador = roundMoney(precoSugerido / cmv);
    lucroBrutoReais = roundMoney(precoSugerido - cmv);
    margemBrutaPercent = roundMoney((lucroBrutoReais / precoSugerido) * 100);

    // Ponto de equilíbrio unitário: cobre CMV + Impostos + Cartão + Custo Fixo (sem lucro e sem pró-labore)
    const deducoesBasicas = (imposto + taxaCartao + custosVar + custoFixo) / 100;
    if (deducoesBasicas < 1) {
      pontoEquilibrioUnitario = roundMoney(cmv / (1 - deducoesBasicas));
    }
  }

  // Decomposição de cada centavo
  const decomposicao: FinancialDecompositionItem[] = [];

  if (precoSugerido > 0) {
    const cmvPercentual = roundMoney((cmv / precoSugerido) * 100);
    decomposicao.push({
      id: 'cmv',
      label: 'Custo da Mercadoria (Reposição do Estoque)',
      percentual: cmvPercentual,
      valorReais: cmv,
      categoria: 'custo',
      cor: '#3b82f6', // blue-500
      descricao: 'Valor destinado para recomprar o produto no distribuidor.'
    });

    if (imposto > 0) {
      decomposicao.push({
        id: 'imposto',
        label: `Impostos (${imposto}%)`,
        percentual: imposto,
        valorReais: roundMoney((precoSugerido * imposto) / 100),
        categoria: 'imposto',
        cor: '#ef4444', // red-500
        descricao: 'Simples Nacional / PIS / COFINS / ICMS estimado.'
      });
    }

    if (taxaCartao > 0) {
      decomposicao.push({
        id: 'cartao',
        label: `Taxas de Cartão / Maquininha (${taxaCartao}%)`,
        percentual: taxaCartao,
        valorReais: roundMoney((precoSugerido * taxaCartao) / 100),
        categoria: 'taxa',
        cor: '#f59e0b', // amber-500
        descricao: 'Taxas médias de débito, crédito e antecipação.'
      });
    }

    if (custosVar > 0) {
      decomposicao.push({
        id: 'variavel',
        label: `Outros Custos Variáveis (${custosVar}%)`,
        percentual: custosVar,
        valorReais: roundMoney((precoSugerido * custosVar) / 100),
        categoria: 'variavel',
        cor: '#8b5cf6', // purple-500
        descricao: 'Embalagens, sacolas, comissões e fretes.'
      });
    }

    if (custoFixo > 0) {
      decomposicao.push({
        id: 'fixo',
        label: `Custo Fixo Operacional da Farmácia (${custoFixo}%)`,
        percentual: custoFixo,
        valorReais: roundMoney((precoSugerido * custoFixo) / 100),
        categoria: 'fixo',
        cor: '#0284c7', // sky-600
        descricao: 'Aluguel, energia, funcionários, sistemas e água da loja.'
      });
    }

    if (proLabore1 > 0) {
      decomposicao.push({
        id: 'prolabore1',
        label: `Pró-labore Sócio 1 (${proLabore1}%)`,
        percentual: proLabore1,
        valorReais: roundMoney((precoSugerido * proLabore1) / 100),
        categoria: 'prolabore',
        cor: '#0d9488', // teal-600
        descricao: 'Retirada mensal do Sócio 1.'
      });
    }

    if (proLabore2 > 0) {
      decomposicao.push({
        id: 'prolabore2',
        label: `Pró-labore Sócio 2 (${proLabore2}%)`,
        percentual: proLabore2,
        valorReais: roundMoney((precoSugerido * proLabore2) / 100),
        categoria: 'prolabore',
        cor: '#14b8a6', // teal-500
        descricao: 'Retirada mensal do Sócio 2.'
      });
    }

    if (margemLiquida > 0) {
      decomposicao.push({
        id: 'lucro',
        label: `Lucro Líquido / Reserva de Caixa (${margemLiquida}%)`,
        percentual: margemLiquida,
        valorReais: roundMoney((precoSugerido * margemLiquida) / 100),
        categoria: 'lucro',
        cor: '#10b981', // emerald-500
        descricao: 'Sobra líquida real para expansão e caixa da farmácia.'
      });
    }
  }

  return {
    cmv,
    totalDeducoesPercent,
    markupDivisor: roundMoney(markupDivisor * 100) / 100,
    markupMultiplicador,
    precoSugerido,
    margemBrutaPercent,
    lucroBrutoReais,
    pontoEquilibrioUnitario,
    decomposicao,
    isValid: true
  };
}

/**
 * Diagnostica se o preço atual de venda do produto cobre os custos e gera lucro.
 */
export function diagnoseCurrentPrice(
  cmv: number,
  currentPrice: number,
  inputs: PricingInputs
): {
  status: 'lucro_saudavel' | 'margem_apertada' | 'prejuizo';
  lucroLiquidoReais: number;
  lucroLiquidoPercent: number;
  margemBrutaAtual: number;
  mensagem: string;
} {
  const preco = Math.max(0, Number(currentPrice) || 0);
  const custo = Math.max(0, Number(cmv) || 0);

  if (preco <= 0 || custo <= 0) {
    return {
      status: 'margem_apertada',
      lucroLiquidoReais: 0,
      lucroLiquidoPercent: 0,
      margemBrutaAtual: 0,
      mensagem: 'Informe o CMV e Preço Atual para diagnóstico.'
    };
  }

  const deducoesSemMargem = (
    (inputs.impostoPercent || 0) +
    (inputs.taxaCartaoPercent || 0) +
    (inputs.custosVariaveisPercent || 0) +
    (inputs.custoFixoPercent || 0) +
    (inputs.proLaboreSocio1Percent || 0) +
    (inputs.proLaboreSocio2Percent || 0)
  );

  const deducoesEmReais = (preco * deducoesSemMargem) / 100;
  const lucroLiquidoReais = roundMoney(preco - custo - deducoesEmReais);
  const lucroLiquidoPercent = roundMoney((lucroLiquidoReais / preco) * 100);
  const margemBrutaAtual = roundMoney(((preco - custo) / preco) * 100);

  if (lucroLiquidoReais < 0) {
    return {
      status: 'prejuizo',
      lucroLiquidoReais,
      lucroLiquidoPercent,
      margemBrutaAtual,
      mensagem: `🔴 Prejuízo Unitário de R$ ${Math.abs(lucroLiquidoReais).toFixed(2)} por venda! O preço atual não cobre todos os custos operacionais e pró-labore.`
    };
  } else if (lucroLiquidoPercent < 3.0) {
    return {
      status: 'margem_apertada',
      lucroLiquidoReais,
      lucroLiquidoPercent,
      margemBrutaAtual,
      mensagem: `🟡 Margem Apertada (${lucroLiquidoPercent.toFixed(1)}%). Cobre custos, mas gera pouco retorno livre.`
    };
  } else {
    return {
      status: 'lucro_saudavel',
      lucroLiquidoReais,
      lucroLiquidoPercent,
      margemBrutaAtual,
      mensagem: `🟢 Preço Saudável! Gera R$ ${lucroLiquidoReais.toFixed(2)} de lucro líquido (${lucroLiquidoPercent.toFixed(1)}%) por unidade vendida.`
    };
  }
}
