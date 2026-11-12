import React, { useRef, ReactNode } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

export interface ColumnDef<T> {
  key: string;
  header: ReactNode;
  width?: string | number; // ex: '120px', '25%', 150
  align?: 'left' | 'right' | 'center';
  className?: string;
  headerClassName?: string;
  renderCell: (item: T, index: number) => ReactNode;
}

export interface VirtualizedTableProps<T> {
  data: T[];
  columns: ColumnDef<T>[];
  rowHeight?: number; // padrão 40px para alta densidade
  maxHeight?: string | number;
  emptyMessage?: ReactNode;
  rowKey: (item: T, index: number) => string | number;
  onRowClick?: (item: T, index: number) => void;
  rowClassName?: (item: T, index: number) => string;
  isLoading?: boolean;
}

/**
 * Tabela de Alta Densidade com Virtualização nativa (TanStack Virtual).
 * Cumpre os padrões BelaFarma:
 * - Cabeçalhos fixos com whitespace-nowrap e larguras controladas
 * - Linhas compactas de alta densidade vertical
 * - Suporta milhares de itens a 60fps sem sobrecarregar a DOM
 */
export function VirtualizedTable<T>({
  data,
  columns,
  rowHeight = 40,
  maxHeight = '650px',
  emptyMessage = 'Nenhum registro encontrado.',
  rowKey,
  onRowClick,
  rowClassName,
  isLoading = false
}: VirtualizedTableProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: data.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan: 5
  });

  const virtualRows = rowVirtualizer.getVirtualItems();
  const totalSize = rowVirtualizer.getTotalSize();

  const getAlignClass = (align?: 'left' | 'right' | 'center') => {
    if (align === 'right') return 'text-right justify-end';
    if (align === 'center') return 'text-center justify-center';
    return 'text-left justify-start';
  };

  return (
    <div className="w-full border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm flex flex-col">
      <div
        ref={parentRef}
        style={{
          maxHeight: typeof maxHeight === 'number' ? `${maxHeight}px` : maxHeight,
          overflowY: 'auto'
        }}
        className="relative w-full custom-scrollbar"
      >
        <table className="w-full text-xs text-left border-collapse table-fixed">
          {/* Cabeçalho Fixo (Sticky) com proteção de colisão */}
          <thead className="sticky top-0 z-10 bg-slate-100 text-slate-700 uppercase tracking-wider font-semibold border-b border-slate-200 shadow-sm">
            <tr>
              {columns.map(col => (
                <th
                  key={col.key}
                  style={{ width: col.width }}
                  className={`px-3 py-2.5 whitespace-nowrap select-none ${getAlignClass(col.align)} ${
                    col.headerClassName || ''
                  }`}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>

          {/* Corpo da Tabela Virtualizado */}
          <tbody className="divide-y divide-slate-100">
            {isLoading ? (
              <tr>
                <td colSpan={columns.length} className="py-12 text-center text-slate-400">
                  <div className="inline-block animate-spin rounded-full h-6 w-6 border-2 border-emerald-500 border-t-transparent mb-2" />
                  <p className="text-xs font-medium">Carregando dados...</p>
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="py-12 text-center text-slate-400 font-medium text-xs">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              <>
                {/* Espaçador superior da virtualização */}
                {virtualRows.length > 0 && virtualRows[0].start > 0 && (
                  <tr>
                    <td
                      colSpan={columns.length}
                      style={{ height: `${virtualRows[0].start}px`, padding: 0, border: 'none' }}
                    />
                  </tr>
                )}

                {/* Linhas Visíveis */}
                {virtualRows.map(virtualRow => {
                  const item = data[virtualRow.index];
                  const key = rowKey(item, virtualRow.index);
                  const customRowClass = rowClassName ? rowClassName(item, virtualRow.index) : '';

                  return (
                    <tr
                      key={key}
                      onClick={() => onRowClick && onRowClick(item, virtualRow.index)}
                      className={`hover:bg-slate-50 transition-colors h-[${rowHeight}px] ${
                        onRowClick ? 'cursor-pointer' : ''
                      } ${customRowClass}`}
                      style={{ height: `${virtualRow.size}px` }}
                    >
                      {columns.map(col => (
                        <td
                          key={col.key}
                          style={{ width: col.width }}
                          className={`px-3 py-1.5 overflow-hidden text-ellipsis whitespace-nowrap ${getAlignClass(
                            col.align
                          )} ${col.className || ''}`}
                        >
                          {col.renderCell(item, virtualRow.index)}
                        </td>
                      ))}
                    </tr>
                  );
                })}

                {/* Espaçador inferior da virtualização */}
                {virtualRows.length > 0 && (
                  <tr>
                    <td
                      colSpan={columns.length}
                      style={{
                        height: `${totalSize - (virtualRows[virtualRows.length - 1]?.end || 0)}px`,
                        padding: 0,
                        border: 'none'
                      }}
                    />
                  </tr>
                )}
              </>
            )}
          </tbody>
        </table>
      </div>

      {/* Rodapé informativo de contagem e densidade */}
      <div className="px-3 py-2 bg-slate-50 border-t border-slate-200 text-[11px] text-slate-500 flex justify-between items-center">
        <span>
          Total: <strong className="text-slate-700">{data.length.toLocaleString('pt-BR')}</strong> registros
        </span>
        {data.length > 0 && (
          <span className="text-slate-400">
            Renderizando {virtualRows.length} linhas simultâneas (otimizado)
          </span>
        )}
      </div>
    </div>
  );
}
