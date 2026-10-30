/**
 * Utilitário de Impressão Térmica Isolada (80mm / 72mm)
 * Otimizado para Bematech MP-4200 TH, Epson TM-T20, Elgin, Daruma e similares.
 * 
 * Utiliza tipografia encorpada e alto contraste (preto 100% puro sem suavização de cinza)
 * para evitar letras falhadas/pontilhadas nas cabeças térmicas de 203 DPI.
 */

export interface CupomVendaData {
  sale_id: number | string;
  date: string;
  time: string;
  customer_name?: string;
  items: Array<{
    name: string;
    quantity: number;
    unit_price?: number;
    total_price: number;
  }>;
  total_items_value: number;
  discount_value: number;
  total_final: number;
  payment: {
    method: string;
    amount?: number;
  };
  change?: number;
}

export interface DanfeNfceData {
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
    nome?: string;
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
}

/**
 * Injeta o documento no iframe invisível e dispara a impressão
 */
export function imprimirHtmlIsolado(htmlContent: string) {
  // Limpa iframes de impressões anteriores
  const existing = document.getElementById('bela-thermal-printer-frame');
  if (existing) {
    existing.remove();
  }

  const iframe = document.createElement('iframe');
  iframe.id = 'bela-thermal-printer-frame';
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.style.visibility = 'hidden';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document || iframe.contentDocument;
  if (!doc) {
    console.error('Falha ao instanciar iframe de impressão');
    return;
  }

  doc.open();
  doc.write(htmlContent);
  doc.close();

  // Espera breve para renderização de fontes e QR code
  setTimeout(() => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch (err) {
      console.error('Erro na chamada print():', err);
    }
  }, 250);
}

/**
 * Imprime Comprovante Não Fiscal de Venda de Balcão (PDV)
 * Tipografia espessa em preto absoluto (100% #000) para evitar o efeito pontilhado/falhado
 */
export function imprimirCupomVenda(venda: CupomVendaData) {
  const itemsHtml = venda.items
    .map(
      (it) => `
      <div class="item-row">
        <div class="item-desc">${it.quantity}x ${escapeHtml(it.name)}</div>
        <div class="item-val">R$ ${it.total_price.toFixed(2)}</div>
      </div>
    `
    )
    .join('');

  const html = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="utf-8">
      <title>Cupom #${venda.sale_id}</title>
      <style>
        @page {
          size: 80mm auto;
          margin: 0;
        }
        @media print {
          html, body {
            width: 72mm !important;
            margin: 0 !important;
            padding: 0 !important;
            filter: contrast(300%) grayscale(100%);
          }
        }
        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
          color: #000000 !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        body {
          width: 72mm;
          max-width: 72mm;
          margin: 0 auto;
          padding: 2mm 1mm 12mm 1mm;
          /* Fonte encorpada sem serifa para traços cheios sem falhas na cabeça térmica */
          font-family: 'Segoe UI', 'Consolas', 'Arial', -apple-system, sans-serif;
          font-size: 12px;
          font-weight: 700;
          line-height: 1.28;
          color: #000000 !important;
          background: #ffffff !important;
          -webkit-font-smoothing: antialiased;
          text-rendering: geometricPrecision;
        }
        .text-center { text-align: center; }
        .text-right { text-align: right; }
        .text-left { text-align: left; }
        .bold { font-weight: 900; }
        .uppercase { text-transform: uppercase; }
        .divider {
          border-bottom: 2px dashed #000000;
          margin: 5px 0;
        }
        .divider-solid {
          border-bottom: 2px solid #000000;
          margin: 5px 0;
        }
        .header {
          text-align: center;
          margin-bottom: 4px;
        }
        .title {
          font-size: 15px;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .subtitle {
          font-size: 10px;
          font-weight: 800;
        }
        .sale-badge {
          font-size: 14px;
          font-weight: 900;
          margin-top: 3px;
        }
        .item-row {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 4px;
          font-size: 12px;
          font-weight: 700;
        }
        .item-desc {
          flex: 1;
          word-break: break-word;
          padding-right: 4px;
          font-weight: 700;
        }
        .item-val {
          white-space: nowrap;
          text-align: right;
          font-weight: 900;
        }
        .totals-row {
          display: flex;
          justify-content: space-between;
          margin-bottom: 3px;
          font-size: 12px;
          font-weight: 700;
        }
        .total-final {
          display: flex;
          justify-content: space-between;
          font-size: 16px;
          font-weight: 900;
          border-top: 2px dashed #000000;
          padding-top: 4px;
          margin-top: 4px;
        }
        .footer {
          text-align: center;
          font-size: 10px;
          font-weight: 700;
          margin-top: 8px;
        }
        .cut-space {
          height: 15mm;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="title">DROGARIA BELA FARMA</div>
        <div class="subtitle">COMPROVANTE DE VENDA • NÃO FISCAL</div>
        <div class="sale-badge">CUPOM #${venda.sale_id}</div>
        <div class="subtitle">${venda.date} às ${venda.time}</div>
        ${venda.customer_name ? `<div style="font-size:11px; font-weight:900; margin-top:3px;">CLIENTE: ${escapeHtml(venda.customer_name)}</div>` : ''}
      </div>

      <div class="divider"></div>

      <div style="font-size: 10px; font-weight: 900; margin-bottom: 4px; display: flex; justify-content: space-between;">
        <span>ITEM / DESCRIÇÃO</span>
        <span>TOTAL</span>
      </div>

      <div class="items-list">
        ${itemsHtml}
      </div>

      <div class="divider"></div>

      <div class="totals-row">
        <span>SUBTOTAL:</span>
        <span style="font-weight: 900;">R$ ${venda.total_items_value.toFixed(2)}</span>
      </div>

      ${venda.discount_value > 0 ? `
        <div class="totals-row">
          <span>DESCONTO:</span>
          <span style="font-weight: 900;">- R$ ${venda.discount_value.toFixed(2)}</span>
        </div>
      ` : ''}

      <div class="total-final">
        <span>TOTAL A PAGAR:</span>
        <span>R$ ${venda.total_final.toFixed(2)}</span>
      </div>

      <div class="totals-row" style="margin-top: 5px;">
        <span>FORMA DE PAGTO:</span>
        <span style="font-weight: 900;">${escapeHtml(venda.payment.method)}</span>
      </div>

      ${(venda.change || 0) > 0 ? `
        <div class="totals-row">
          <span>TROCO:</span>
          <span style="font-weight: 900;">R$ ${venda.change!.toFixed(2)}</span>
        </div>
      ` : ''}

      <div class="divider"></div>

      <div class="footer">
        <div>OBRIGADO PELA PREFERÊNCIA!</div>
        <div style="font-size: 10px; margin-top: 2px;">BelaFarma • Saúde e Economia ao seu lado</div>
      </div>

      <div class="cut-space"></div>
    </body>
    </html>
  `;

  imprimirHtmlIsolado(html);
}

/**
 * Imprime DANFE NFC-e com QR Code oficial da SEFAZ
 */
export function imprimirDanfeNfce(danfe: DanfeNfceData) {
  const itensHtml = danfe.itens
    .map(
      (it) => `
      <div style="margin-bottom: 4px;">
        <div style="font-weight: 900; font-size: 11px;">${String(it.index).padStart(2, '0')} ${escapeHtml(it.name)}</div>
        <div style="display: flex; justify-content: space-between; font-size: 10px; font-weight: 700;">
          <span>${it.quantity} un x R$ ${it.unit_price.toFixed(2)}</span>
          <span style="font-weight: 900;">R$ ${it.total_price.toFixed(2)}</span>
        </div>
      </div>
    `
    )
    .join('');

  const pagamentosHtml = danfe.pagamentos
    .map(
      (p) => `
      <div style="display: flex; justify-content: space-between; font-size: 10px; font-weight: 700;">
        <span>${escapeHtml(p.metodo)}:</span>
        <span style="font-weight: 900;">R$ ${p.valor.toFixed(2)}</span>
      </div>
    `
    )
    .join('');

  const html = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="utf-8">
      <title>NFC-e #${danfe.nfe_number}</title>
      <style>
        @page {
          size: 80mm auto;
          margin: 0;
        }
        @media print {
          html, body {
            width: 72mm !important;
            margin: 0 !important;
            padding: 0 !important;
            filter: contrast(300%) grayscale(100%);
          }
        }
        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
          color: #000000 !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        body {
          width: 72mm;
          max-width: 72mm;
          margin: 0 auto;
          padding: 2mm 1mm 12mm 1mm;
          font-family: 'Segoe UI', 'Consolas', 'Arial', -apple-system, sans-serif;
          font-size: 11px;
          font-weight: 700;
          line-height: 1.25;
          color: #000000 !important;
          background: #ffffff !important;
          -webkit-font-smoothing: antialiased;
          text-rendering: geometricPrecision;
        }
        .text-center { text-align: center; }
        .text-right { text-align: right; }
        .bold { font-weight: 900; }
        .uppercase { text-transform: uppercase; }
        .divider {
          border-bottom: 2px dashed #000000;
          margin: 5px 0;
        }
        .header {
          text-align: center;
          margin-bottom: 4px;
        }
        .razao {
          font-size: 13px;
          font-weight: 900;
          text-transform: uppercase;
        }
        .sub {
          font-size: 9.5px;
          font-weight: 700;
        }
        .cut-space {
          height: 15mm;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="razao">${escapeHtml(danfe.empresa.nome_fantasia || danfe.empresa.razao_social)}</div>
        <div class="sub">${escapeHtml(danfe.empresa.razao_social)}</div>
        <div class="sub">CNPJ: ${escapeHtml(danfe.empresa.cnpj)} | IE: ${escapeHtml(danfe.empresa.inscricao_estadual)}</div>
        <div class="sub">${escapeHtml(danfe.empresa.endereco)}</div>
        <div class="divider"></div>
        <div style="font-weight: 900; font-size: 11px; text-transform: uppercase;">DANFE NFC-e</div>
        <div style="font-size: 9px; font-weight: 700;">Documento Auxiliar da Nota Fiscal de Consumidor Eletrônica</div>
        <div style="font-size: 8.5px; font-weight: 700;">Não permite aproveitamento de crédito de ICMS</div>
      </div>

      <div class="divider"></div>

      <div style="font-size: 9.5px; font-weight: 900; display: flex; justify-content: space-between; margin-bottom: 4px;">
        <span># | CÓD | DESCRIÇÃO</span>
        <span>QTD x VL.UN = TOTAL</span>
      </div>

      <div class="itens-list">
        ${itensHtml}
      </div>

      <div class="divider"></div>

      <div style="display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 2px;">
        <span>Qtd. Total de Itens:</span>
        <span class="bold">${danfe.itens.length}</span>
      </div>
      <div style="display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 2px;">
        <span>Subtotal Itens:</span>
        <span class="bold">R$ ${danfe.totais.total_items_value.toFixed(2)}</span>
      </div>

      ${danfe.totais.discount_value > 0 ? `
        <div style="display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 2px;">
          <span>Desconto:</span>
          <span class="bold">- R$ ${danfe.totais.discount_value.toFixed(2)}</span>
        </div>
      ` : ''}

      <div style="display: flex; justify-content: space-between; font-size: 14px; font-weight: 900; border-top: 2px dashed #000; padding-top: 4px; margin-top: 4px;">
        <span>VALOR A PAGAR:</span>
        <span>R$ ${danfe.totais.total_value.toFixed(2)}</span>
      </div>

      <div class="divider"></div>

      <div style="font-size: 10px; font-weight: 900; margin-bottom: 3px; text-transform: uppercase;">FORMA DE PAGAMENTO:</div>
      ${pagamentosHtml}

      <div class="divider"></div>

      <div class="text-center" style="font-size: 9px; font-weight: 700;">
        Tributos Incidentes (Lei Federal 12.741/2012): <br>
        <span style="font-weight: 900;">R$ ${danfe.totais.total_tributos_aprox.toFixed(2)}</span> (Aprox. 31.4% IBPT)
      </div>

      <div class="divider"></div>

      <div class="text-center" style="font-size: 10px; font-weight: 700;">
        <div class="bold">NFC-e nº ${danfe.nfe_number} Série ${danfe.nfe_series}</div>
        <div>Emissão: ${danfe.issued_at}</div>
        <div style="font-size: 9px;">Protocolo: ${escapeHtml(danfe.protocol_number)}</div>
        <div style="font-size: 9px; font-weight: 900; text-transform: uppercase; margin-top: 2px;">Ambiente: ${escapeHtml(danfe.ambiente)}</div>
      </div>

      <div class="divider"></div>

      <div class="text-center" style="font-size: 10px;">
        <span class="bold">CONSUMIDOR:</span> ${escapeHtml(danfe.consumidor.cpf)}
      </div>

      <div class="divider"></div>

      <div class="text-center">
        <div class="bold" style="font-size: 10px;">CHAVE DE ACESSO:</div>
        <div style="font-size: 9px; font-weight: 900; font-family: monospace; word-break: break-all; margin-top: 2px;">
          ${escapeHtml(danfe.access_key_formatted)}
        </div>
      </div>

      ${danfe.qr_code_base64 ? `
        <div class="divider"></div>
        <div class="text-center" style="margin-top: 5px;">
          <div style="font-size: 10px; font-weight: 900; text-transform: uppercase; margin-bottom: 4px;">
            Consulta via Leitor de QR Code
          </div>
          <img src="${danfe.qr_code_base64}" alt="QR Code NFC-e" style="width: 145px; height: 145px; margin: 0 auto; display: block; image-rendering: pixelated;" />
          <div style="font-size: 8.5px; font-weight: 700; margin-top: 4px;">
            Consulte pela Chave de Acesso no site da SEFAZ
          </div>
        </div>
      ` : ''}

      <div class="cut-space"></div>
    </body>
    </html>
  `;

  imprimirHtmlIsolado(html);
}

function escapeHtml(text: string | null | undefined): string {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
