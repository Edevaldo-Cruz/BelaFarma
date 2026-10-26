/**
 * backend/services/radar-ia.service.js
 * Serviço de Curadoria e Radar de Oportunidades por Segmento com IA (Gemini) no BelaPed
 */

const { callAI } = require('./ai.service');

// Segmentos campeões no varejo farmacêutico com termos de busca otimizados
const SEGMENTOS_PADRAO = [
  {
    id: 'sabonetes',
    label: 'Sabonetes',
    icon: '🧼',
    descricao: 'Barras, líquidos, íntimos e antibacterianos',
    termos: ['sabonete', 'sabonete em barra', 'sabonete liquido', 'sabonete intimo']
  },
  {
    id: 'desodorantes',
    label: 'Desodorantes',
    icon: '🧴',
    descricao: 'Aerosol, roll-on, clinical e antitranspirantes',
    termos: ['desodorante aerosol', 'desodorante roll on', 'antitranspirante', 'rexona', 'dove']
  },
  {
    id: 'creme_dental',
    label: 'Higiene Bucal',
    icon: '🪥',
    descricao: 'Cremes dentais, escovas e enxaguantes bucais',
    termos: ['creme dental', 'escova dental', 'enxaguante bucal', 'colgate', 'sensodyne']
  },
  {
    id: 'cabelos',
    label: 'Cuidados Capilares',
    icon: '💇',
    descricao: 'Shampoos, condicionadores, cremes de pentear e máscaras',
    termos: ['shampoo', 'condicionador', 'creme para cabelo', 'creme para pentear', 'mascara capilar']
  },
  {
    id: 'infantil',
    label: 'Infantil & Bebê',
    icon: '👶',
    descricao: 'Fraldas descartáveis, lenços umedecidos e pomadas',
    termos: ['fralda infantil', 'lenco umedecido', 'pomada assadura', 'huggies', 'pampers']
  },
  {
    id: 'pele_hidratacao',
    label: 'Pele & Hidratantes',
    icon: '✨',
    descricao: 'Hidratantes corporais, protetores solares e faciais',
    termos: ['hidratante corporal', 'creme facial', 'protetor solar', 'nivea', 'cerave']
  },
  {
    id: 'primeiros_socorros',
    label: 'Primeiros Socorros',
    icon: '🩹',
    descricao: 'Curativos adesivos, esparadrapos, gazes e algodão',
    termos: ['curativo adesivo', 'esparadrapo', 'gaze hidrofila', 'algodao hidrofilo', 'soro fisiologico']
  },
  {
    id: 'vitaminas',
    label: 'Vitaminas & Nutrição',
    icon: '💊',
    descricao: 'Polivitamínicos, Vitamina C, Ômega 3 e Colágeno',
    termos: ['vitamina c', 'multivitaminico', 'polivitaminico', 'omega 3', 'colageno']
  }
];

/**
 * Normaliza e enriquece ofertas através do Gemini (ou fallback heurístico)
 */
async function curarOfertasComIA(segmentoInfo, ofertasBrutas, opcoes = {}) {
  if (!Array.isArray(ofertasBrutas) || ofertasBrutas.length === 0) {
    return [];
  }

  // Limita até 40 ofertas por lote para otimizar tempo e tokens
  const amostra = ofertasBrutas.slice(0, 40);

  const promptProdutos = amostra.map((it, idx) => ({
    indice: idx,
    ean: it.ean || '',
    descricao: it.descricao || '',
    marca: it.laboratorio || it.marca || '',
    distribuidora: it.distribuidora || '',
    custo: Number(it.preco || 0)
  }));

  const systemPrompt = `Você é o Diretor de Compras e Precificação de uma grande rede de Farmácias no Brasil.
Sua missão é analisar ofertas obtidas em distribuidores farmacêuticos para o segmento de compras: "${segmentoInfo}".

REGRAS RÍGIDAS DE ANÁLISE:
1. Elimine produtos fora de contexto que não sejam itens de revenda em farmácia (ex: dispensers industriais de 20L, peças plásticas avulsas, matérias primas brutas).
2. Para cada item válido de farmácia, calcule um preço de venda no varejo ("preco_venda_sugerido") competitivo e realista no mercado brasileiro de drogarias (margem bruta de 35% a 65% sobre o custo, dependendo da competitividade da marca).
3. Classifique o nicho em um destes: "Giro Alto", "Econômico", "Premium / Dermo", "Infantil", "Família / Multi-pack", "Geral".
4. Defina "destaque_ouro" como true se o produto tiver margem bruta >= 40% e for de marca conhecida/alta aceitação, ou preço de custo muito abaixo do mercado.
5. Retorne ESTRITAMENTE um array JSON de objetos no seguinte formato (sem markdown, sem explicações):
[
  {
    "indice": 0,
    "valido": true,
    "nicho": "Giro Alto",
    "preco_venda_sugerido": 4.99,
    "margem_estimada_pct": 46.5,
    "destaque_ouro": true,
    "motivo_destaque": "Preço de atacado agressivo em sabonete de alto giro."
  }
]`;

  let enriquecimentosIa = null;

  try {
    const respostaTexto = await callAI(
      JSON.stringify(promptProdutos),
      systemPrompt,
      { temperature: 0.2, maxTokens: 4096, isPriority: true }
    );

    const jsonLimpo = respostaTexto
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim();

    const parsed = JSON.parse(jsonLimpo);
    if (Array.isArray(parsed)) {
      enriquecimentosIa = new Map();
      parsed.forEach(p => {
        if (typeof p.indice === 'number') {
          enriquecimentosIa.set(p.indice, p);
        }
      });
    }
  } catch (err) {
    console.warn('[RadarIA] Aviso na curadoria via Gemini (usando fallback heurístico):', err.message);
  }

  // Montagem do resultado combinando com a IA ou aplicando Heurística de Fallback
  const consolidados = [];

  for (let i = 0; i < amostra.length; i++) {
    const it = amostra[i];
    const custo = Number(it.preco || 0);
    if (custo <= 0) continue;

    const iaData = enriquecimentosIa ? enriquecimentosIa.get(i) : null;

    if (iaData && iaData.valido === false) {
      // Filtrado pela IA como ruído/fora de contexto
      continue;
    }

    let nicho = 'Geral';
    let precoVenda = 0;
    let margemPct = 0;
    let destaqueOuro = false;
    let motivoDestaque = '';

    if (iaData && iaData.preco_venda_sugerido) {
      nicho = iaData.nicho || 'Geral';
      precoVenda = Number(Number(iaData.preco_venda_sugerido).toFixed(2));
      margemPct = precoVenda > custo ? Number((((precoVenda - custo) / precoVenda) * 100).toFixed(1)) : 0;
      destaqueOuro = !!iaData.destaque_ouro;
      motivoDestaque = iaData.motivo_destaque || '';
    } else {
      // Heurística Farmacêutica Inteligente de Contingência
      const descUpper = (it.descricao || '').toUpperCase();
      let markup = 1.50; // Margem padrão de 33% sobre a venda

      if (descUpper.includes('DOVE') || descUpper.includes('REXONA') || descUpper.includes('COLGATE') || descUpper.includes('NIVEA')) {
        markup = 1.45;
        nicho = 'Giro Alto';
      } else if (descUpper.includes('KIT') || descUpper.includes('LEVE') || descUpper.includes('PACK') || descUpper.includes('GRATIS')) {
        markup = 1.40;
        nicho = 'Família / Multi-pack';
      } else if (descUpper.includes('INFANTIL') || descUpper.includes('BEBE') || descUpper.includes('BABY') || descUpper.includes('FRALDA')) {
        markup = 1.35;
        nicho = 'Infantil';
      } else if (descUpper.includes('DERMO') || descUpper.includes('CERAVE') || descUpper.includes('VICHY') || descUpper.includes('LA ROCHE')) {
        markup = 1.55;
        nicho = 'Premium / Dermo';
      } else if (descUpper.includes('LUX') || descUpper.includes('PALMOLIVE') || descUpper.includes('SORRISO') || descUpper.includes('EVEN')) {
        markup = 1.50;
        nicho = 'Econômico';
      }

      precoVenda = Number((custo * markup).toFixed(2));
      margemPct = Number((((precoVenda - custo) / precoVenda) * 100).toFixed(1));
      if (margemPct >= 38) {
        destaqueOuro = true;
        motivoDestaque = `Excelente margem bruta estimada (${margemPct}%) para o mix da farmácia.`;
      }
    }

    consolidados.push({
      segmento: segmentoInfo,
      ean: it.ean ? String(it.ean).trim() : null,
      descricao: it.descricao ? String(it.descricao).trim() : 'Sem Descrição',
      marca_laboratorio: it.laboratorio || it.marca || null,
      distribuidora: it.distribuidora || 'Distribuidora',
      preco_distribuidora: custo,
      estoque_status: it.disponivel !== false ? 'DISPONIVEL' : 'CONSULTAR',
      preco_venda_sugerido: precoVenda,
      margem_estimada_pct: margemPct,
      nicho_ia: nicho,
      destaque_ouro: destaqueOuro ? 1 : 0,
      motivo_destaque: motivoDestaque,
      url_produto: it.url_produto || null
    });
  }

  // Ordena por maior margem e menor preço
  return consolidados.sort((a, b) => b.margem_estimada_pct - a.margem_estimada_pct);
}

module.exports = {
  SEGMENTOS_PADRAO,
  curarOfertasComIA
};
