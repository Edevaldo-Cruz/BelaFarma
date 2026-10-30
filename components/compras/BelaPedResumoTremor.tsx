import React, { useMemo } from 'react';
import { Card, Metric, Text, DonutChart, BarList, Flex, Badge } from '@tremor/react';

interface Props {
  faltas: any[];
  totais: { distribuidora: string; valorTotal: number; qtdProdutos: number }[];
}

const brl = (v: number) => 'R$ ' + (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Resumo visual (Tremor) da aba de reposição:
 * total sugerido, economia vs. última compra, itens ainda sem cotação e distribuição por distribuidora.
 */
const BelaPedResumoTremor: React.FC<Props> = ({ faltas, totais }) => {
  const kpis = useMemo(() => {
    let total = 0, economia = 0, semCotacao = 0, cotados = 0;
    for (const f of faltas) {
      total += Number(f.subtotal_7d) || 0;
      const p1 = Number(f.preco_1) || 0;
      const ult = Number(f.preco_ult_compra) || 0;
      const qtd = Number(f.qtd_sugerida_7d) || 0;
      if (!f.fornecedor_1 || f.fornecedor_1 === '—' || /n[aã]o cotado|aguardando/i.test(f.fornecedor_1)) semCotacao++;
      else cotados++;
      if (p1 > 0 && ult > p1) economia += (ult - p1) * qtd;
    }
    return { total, economia, semCotacao, cotados };
  }, [faltas]);

  const donut = totais
    .filter(t => t.valorTotal > 0)
    .map(t => ({ name: t.distribuidora, value: Number(t.valorTotal.toFixed(2)) }));

  return (
    <div className="dark grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
      <Card decoration="top" decorationColor="cyan" className="!bg-[#0e1626] !ring-slate-800">
        <Text className="!text-slate-400">Total sugerido (1 semana)</Text>
        <Metric className="!text-white">{brl(kpis.total)}</Metric>
        <Text className="!text-slate-500 mt-1">{faltas.length} produtos</Text>
      </Card>

      <Card decoration="top" decorationColor="emerald" className="!bg-[#0e1626] !ring-slate-800">
        <Text className="!text-slate-400">Economia vs. última compra</Text>
        <Metric className="!text-emerald-400">{brl(kpis.economia)}</Metric>
        <Text className="!text-slate-500 mt-1">usando o melhor preço cotado</Text>
      </Card>

      <Card decoration="top" decorationColor={kpis.semCotacao > 0 ? 'amber' : 'emerald'} className="!bg-[#0e1626] !ring-slate-800">
        <Text className="!text-slate-400">Cotação dos portais</Text>
        <Flex justifyContent="start" alignItems="baseline" className="gap-2">
          <Metric className="!text-white">{kpis.cotados}</Metric>
          <Text className="!text-slate-400">cotados</Text>
        </Flex>
        <Badge color={kpis.semCotacao > 0 ? 'amber' : 'emerald'} className="mt-1">
          {kpis.semCotacao} sem cotação
        </Badge>
      </Card>

      <Card className="!bg-[#0e1626] !ring-slate-800">
        <Text className="!text-slate-400 mb-2">Valor por distribuidora (1º colocado)</Text>
        {donut.length > 0 ? (
          <DonutChart
            data={donut}
            category="value"
            index="name"
            valueFormatter={brl}
            variant="donut"
            className="h-28"
            showLabel={false}
          />
        ) : (
          <Text className="!text-slate-500">Sem dados cotados.</Text>
        )}
      </Card>

      {donut.length > 0 && (
        <Card className="!bg-[#0e1626] !ring-slate-800 md:col-span-2 xl:col-span-4">
          <Text className="!text-slate-400 mb-2">Ranking por valor de compra</Text>
          <BarList
            data={[...donut].sort((a, b) => b.value - a.value).map(d => ({ name: d.name, value: d.value }))}
            valueFormatter={brl}
            color="cyan"
          />
        </Card>
      )}
    </div>
  );
};

export default BelaPedResumoTremor;
