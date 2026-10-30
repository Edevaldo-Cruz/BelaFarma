import React, { useRef } from 'react';
import { Printer, X, CheckCircle2, ShieldCheck, QrCode } from 'lucide-react';

interface DanfeNfceModalProps {
  danfe: {
    nfe_number: number;
    nfe_series: number;
    access_key_formatted: string;
    protocol_number: string;
    issued_at: string;
    qr_code_base64?: string;
    ambiente: string;
    empresa: {
      razao_social: string;
      nome_fantasia: string;
      cnpj: string;
      inscricao_estadual: string;
      endereco: string;
    };
    consumidor: {
      cpf: string;
      nome: string;
    };
    totais: {
      total_items_value: number;
      discount_value: number;
      total_value: number;
      total_tributos_aprox: number;
    };
    itens: Array<{
      index: number;
      code: string;
      name: string;
      quantity: number;
      unit_price: number;
      total_price: number;
    }>;
    pagamentos: Array<{
      metodo: string;
      valor: number;
    }>;
  };
  onClose: () => void;
}

export const DanfeNfceModal: React.FC<DanfeNfceModalProps> = ({ danfe, onClose }) => {
  const printAreaRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      {/* Container Principal */}
      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header Superior com Ações */}
        <div className="p-4 bg-slate-800 border-b border-slate-700 flex items-center justify-between no-print">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Cupom Fiscal Eletrônico</h3>
              <p className="text-[11px] text-slate-400">NFC-e #{danfe.nfe_number} (Série {danfe.nfe_series})</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-emerald-950/40 transition-colors"
            >
              <Printer className="w-4 h-4" />
              Imprimir
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Área de Visualização do Cupom Térmico (Estilo Bobina 80mm) */}
        <div className="flex-1 overflow-y-auto p-4 flex justify-center bg-slate-950">
          <div
            ref={printAreaRef}
            className="w-full max-w-[320px] bg-white text-black p-4 font-mono text-[11px] leading-tight shadow-lg border border-slate-300 rounded-sm print:shadow-none print:border-none print:m-0 print:p-2"
          >
            {/* Cabeçalho Empresa */}
            <div className="text-center border-b border-dashed border-gray-400 pb-2 mb-2">
              <div className="font-bold text-xs uppercase">{danfe.empresa.nome_fantasia || danfe.empresa.razao_social}</div>
              <div className="text-[10px]">{danfe.empresa.razao_social}</div>
              <div className="text-[10px]">CNPJ: {danfe.empresa.cnpj} | IE: {danfe.empresa.inscricao_estadual}</div>
              <div className="text-[9px] text-gray-700 mt-0.5">{danfe.empresa.endereco}</div>
              <div className="mt-1 font-bold text-[10px] uppercase border-t border-dotted border-gray-400 pt-1">
                DANFE NFC-e - Documento Auxiliar da Nota Fiscal de Consumidor Eletrônica
              </div>
              <div className="text-[9px] text-gray-600">Não permite aproveitamento de crédito de ICMS</div>
            </div>

            {/* Lista de Itens */}
            <div className="border-b border-dashed border-gray-400 pb-2 mb-2">
              <div className="flex justify-between font-bold text-[9px] border-b border-gray-300 pb-0.5 mb-1">
                <span># | CÓD | DESCRIÇÃO</span>
                <span>QTD x VL.UN = TOTAL</span>
              </div>
              <div className="space-y-1">
                {danfe.itens.map((it) => (
                  <div key={it.index} className="text-[10px]">
                    <div className="font-semibold truncate">
                      {String(it.index).padStart(2, '0')} {it.name}
                    </div>
                    <div className="flex justify-between text-gray-700 text-[9px]">
                      <span>{it.quantity} un x R$ {it.unit_price.toFixed(2)}</span>
                      <span className="font-bold text-black">R$ {it.total_price.toFixed(2)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Totais */}
            <div className="border-b border-dashed border-gray-400 pb-2 mb-2 space-y-0.5 text-[10px]">
              <div className="flex justify-between">
                <span>Qtd. Total de Itens:</span>
                <span className="font-bold">{danfe.itens.length}</span>
              </div>
              <div className="flex justify-between">
                <span>Subtotal Itens:</span>
                <span>R$ {danfe.totais.total_items_value.toFixed(2)}</span>
              </div>
              {danfe.totais.discount_value > 0 && (
                <div className="flex justify-between text-red-700">
                  <span>Desconto:</span>
                  <span>- R$ {danfe.totais.discount_value.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-xs font-bold pt-1 border-t border-gray-300">
                <span>VALOR A PAGAR:</span>
                <span>R$ {danfe.totais.total_value.toFixed(2)}</span>
              </div>

              {/* Formas de Pagamento */}
              <div className="pt-1.5 mt-1 border-t border-dotted border-gray-300">
                <div className="font-bold text-[9px] uppercase">Forma de Pagamento:</div>
                {danfe.pagamentos.map((p, idx) => (
                  <div key={idx} className="flex justify-between text-[9px]">
                    <span>{p.metodo}:</span>
                    <span>R$ {p.valor.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Tributos da Lei 12.741/2012 */}
            <div className="text-[9px] text-gray-700 text-center border-b border-dashed border-gray-400 pb-2 mb-2">
              Tributos Incidentes (Lei Federal 12.741/2012): <br />
              <strong className="text-black">R$ {danfe.totais.total_tributos_aprox.toFixed(2)}</strong> (Aprox. 31.4% IBPT)
            </div>

            {/* Dados da NFC-e e SEFAZ */}
            <div className="text-center border-b border-dashed border-gray-400 pb-2 mb-2 text-[9px] space-y-0.5">
              <div className="font-bold">
                NFC-e nº {danfe.nfe_number} Série {danfe.nfe_series}
              </div>
              <div>Data de Emissão: {danfe.issued_at}</div>
              <div className="text-[8px] text-gray-600">Protocolo de Autorização: {danfe.protocol_number}</div>
              <div className="font-bold text-[8px] uppercase mt-1">Ambiente: {danfe.ambiente}</div>
            </div>

            {/* Consumidor */}
            <div className="text-center border-b border-dashed border-gray-400 pb-2 mb-2 text-[9px]">
              <span className="font-bold">CONSUMIDOR:</span> {danfe.consumidor.cpf}
            </div>

            {/* Chave de Acesso */}
            <div className="text-center border-b border-dashed border-gray-400 pb-2 mb-2">
              <div className="font-bold text-[9px]">CHAVE DE ACESSO:</div>
              <div className="text-[8px] font-mono tracking-tighter break-all">{danfe.access_key_formatted}</div>
            </div>

            {/* QR Code SEFAZ */}
            {danfe.qr_code_base64 && (
              <div className="flex flex-col items-center justify-center pt-1 text-center">
                <div className="text-[9px] font-bold uppercase mb-1">Consulta via Leitor de QR Code</div>
                <img
                  src={danfe.qr_code_base64}
                  alt="QR Code NFC-e SEFAZ"
                  className="w-36 h-36 border border-gray-200"
                />
                <div className="text-[8px] text-gray-600 mt-1">
                  Consulte pela Chave de Acesso no site da SEFAZ
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
