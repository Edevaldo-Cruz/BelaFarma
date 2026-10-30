// Utilitários oficiais de integração e formatação para WhatsApp da Vitrine BelaFarma
import type { VitrineCartItem, CheckoutData } from './vitrineTypes.ts';
import { formatBRL } from './vitrineTypes.ts';

export const OFFICIAL_WHATSAPP_PHONE = '5532998228189';

export type CartInput =
  | VitrineCartItem[]
  | {
      getItems: () => VitrineCartItem[];
      getSubtotal?: () => number;
      getTotalSavings?: () => number;
      getTotalItems?: () => number;
    };

/**
 * Arredonda valores monetários para duas casas decimais, evitando dízimas IEEE 754.
 */
export function roundCents(num: number): number {
  return Math.round((Number(num) || 0) * 100) / 100;
}

/**
 * Normaliza e assegura o número oficial do WhatsApp BelaFarma.
 * Aceita números com 11 dígitos (adiciona DDI 55) ou 13 dígitos completos.
 * Fallback padrão estrito: 5532998228189.
 */
export function canonicalizeWhatsAppPhone(phone?: string | null): string {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 11) return '55' + digits;
  if (digits.length === 13) return digits;
  return OFFICIAL_WHATSAPP_PHONE;
}

/**
 * Extrai os itens e totais do carrinho suportando array de itens ou CartManager.
 */
export function extractCartTotals(cart: CartInput): {
  items: VitrineCartItem[];
  totalItems: number;
  subtotal: number;
  savings: number;
} {
  const items: VitrineCartItem[] = Array.isArray(cart) ? cart : cart.getItems();

  const totalItems: number =
    !Array.isArray(cart) && typeof cart.getTotalItems === 'function'
      ? cart.getTotalItems()
      : items.reduce((sum, it) => sum + (Number(it.quantidade) || 0), 0);

  const subtotal: number =
    !Array.isArray(cart) && typeof cart.getSubtotal === 'function'
      ? cart.getSubtotal()
      : roundCents(
          items.reduce(
            (sum, it) => sum + (Number(it.produto.preco_por) || 0) * it.quantidade,
            0
          )
        );

  const savings: number =
    !Array.isArray(cart) && typeof cart.getTotalSavings === 'function'
      ? cart.getTotalSavings()
      : roundCents(
          items.reduce((sum, it) => {
            const de = Number(it.produto.preco_de) || 0;
            const por = Number(it.produto.preco_por) || 0;
            return sum + (de > por ? (de - por) * it.quantidade : 0);
          }, 0)
        );

  return { items, totalItems, subtotal, savings };
}

/**
 * Validação sem burocracia do formulário de checkout:
 * - Nome Completo é estritamente obrigatório.
 * - Modalidade deve ser 'retirada' ou 'entrega'.
 * - Não exige senhas, CPFs ou logins prévios.
 */
export function validateCheckoutForm(checkoutData?: CheckoutData | null): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  if (!checkoutData || !checkoutData.nome || !checkoutData.nome.trim()) {
    errors.push('Nome Completo é obrigatório.');
  }
  if (!checkoutData || !['retirada', 'entrega'].includes(checkoutData.modalidade)) {
    errors.push("Modalidade de atendimento deve ser 'retirada' ou 'entrega'.");
  }
  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Formata a mensagem completa de pedido para envio no WhatsApp oficial da BelaFarma.
 * Inclui:
 * - Cabeçalho festivo comemorativo
 * - Nome do cliente e modalidade (Retirada na Loja ou Entrega)
 * - Endereço e bairro se modalidade for entrega
 * - Lista numerada com nome, apresentação, quantidade, valor unitário e subtotal do item
 * - Valor total do pedido e destaque de economia comemorativa
 */
export function formatWhatsAppOrderMessage(
  cart: CartInput,
  checkoutData: CheckoutData
): string {
  const { items, totalItems, subtotal, savings } = extractCartTotals(cart);

  const isDelivery = checkoutData.modalidade === 'entrega';
  const modalidadeStr = isDelivery ? '🚚 Entrega / Delivery' : '🏪 Retirada na Loja';

  let msg = '🎉 *NOVO PEDIDO - ANIVERSÁRIO & LIQUIDAÇÃO BELAFARMA* 🎉\n\n';
  msg += `👤 *Cliente:* ${(checkoutData.nome || '').trim()}\n`;
  msg += `📦 *Modalidade:* ${modalidadeStr}\n`;

  if (isDelivery && checkoutData.endereco) {
    const endStr = [checkoutData.endereco, checkoutData.bairro].filter(Boolean).join(' - ');
    msg += `📍 *Endereço:* ${endStr}\n`;
  }

  msg += `\n🛒 *ITENS DO PEDIDO (${totalItems} ${totalItems === 1 ? 'item' : 'itens'}):*\n`;

  items.forEach((item, idx) => {
    const nome = item.produto.nome || item.produto.descricao;
    const apres = item.produto.apresentacao ? ` (${item.produto.apresentacao})` : '';
    const unit = formatBRL(item.produto.preco_por);
    const itemSubtotal = formatBRL(item.produto.preco_por * item.quantidade);
    msg += `${idx + 1}. *${nome}*${apres}\n`;
    msg += `   • ${item.quantidade}x a ${unit} = *${itemSubtotal}*\n`;
  });

  msg += `\n💰 *VALOR TOTAL DO PEDIDO: ${formatBRL(subtotal)}*\n`;

  if (savings > 0) {
    msg += `✨ *Você economizou:* ${formatBRL(savings)} nesta compra!\n`;
  }

  msg += `\n⚡ _Pedido gerado pela Vitrine de Aniversário BelaFarma_`;

  return msg;
}

/**
 * Gera a URL completa para redirecionar diretamente para o WhatsApp oficial com a mensagem codificada.
 */
export function generateWhatsAppOrderUrl(
  cart: CartInput,
  checkoutData: CheckoutData,
  phone: string = OFFICIAL_WHATSAPP_PHONE
): string {
  const canonicalPhone = canonicalizeWhatsAppPhone(phone);
  const msg = formatWhatsAppOrderMessage(cart, checkoutData);
  return `https://wa.me/${canonicalPhone}?text=${encodeURIComponent(msg)}`;
}

/**
 * Alias compatível com a suíte de testes de integração.
 */
export const buildWhatsAppUrl = generateWhatsAppOrderUrl;
