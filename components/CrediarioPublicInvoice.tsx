import React from 'react';
import { CrediarioClientPortal } from './CrediarioClientPortal';

interface CrediarioPublicInvoiceProps {
  invoiceId: string;
}

/**
 * Wrapper de compatibilidade para links antigos /fatura/:invoiceId.
 * Redireciona o cliente diretamente para o novo Portal Unificado (/minha-conta/:token).
 */
export const CrediarioPublicInvoice: React.FC<CrediarioPublicInvoiceProps> = ({ invoiceId }) => {
  return <CrediarioClientPortal legacyInvoiceId={invoiceId} />;
};

export default CrediarioPublicInvoice;
