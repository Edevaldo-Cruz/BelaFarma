import { z } from 'zod';

/**
 * Utilitário de sanitização para strings (remove caracteres invisíveis/nulos,
 * limita espaços excessivos e normaliza texto).
 */
export function sanitizeString(input: unknown): string {
  if (typeof input !== 'string') return '';
  return input
    .replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u001F\u007F-\u009F]/g, '')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Sanitiza texto removendo tags HTML potenciais ou perigosas.
 */
export function sanitizeHtml(input: unknown): string {
  const sanitized = sanitizeString(input);
  return sanitized.replace(/[<>]/g, '');
}

/**
 * Validação de dígito verificador padrão EAN (EAN-13 e EAN-8).
 */
export function isValidEanChecksum(ean: string): boolean {
  const cleaned = ean.replace(/\D/g, '');
  if (cleaned.length !== 8 && cleaned.length !== 13 && cleaned.length !== 14) {
    return false;
  }

  const digits = cleaned.split('').map(Number);
  const checkDigit = digits.pop()!;
  
  // No EAN-13 / EAN-8 o peso alterna 3 e 1 a partir da direita (antes do DV)
  let sum = 0;
  for (let i = digits.length - 1, multiplier = 3; i >= 0; i--) {
    sum += digits[i] * multiplier;
    multiplier = multiplier === 3 ? 1 : 3;
  }

  const calculatedCheckDigit = (10 - (sum % 10)) % 10;
  return calculatedCheckDigit === checkDigit;
}

/**
 * Schema estrito para EAN:
 * - Apenas números
 * - Comprimento válido (8 ou 13 dígitos)
 * - Dígito verificador matemático válido
 */
export const eanSchema = z
  .string()
  .transform(val => sanitizeString(val).replace(/\D/g, ''))
  .refine(val => val.length === 8 || val.length === 13 || val.length === 14, {
    message: 'EAN deve conter 8, 13 ou 14 dígitos numéricos'
  })
  .refine(val => isValidEanChecksum(val), {
    message: 'Dígito verificador do EAN é inválido'
  });

/**
 * Schema para valores monetários (BRL / decimais positivos).
 */
export const moneySchema = z
  .union([z.number(), z.string()])
  .transform(val => {
    if (typeof val === 'number') return val;
    const sanitized = sanitizeString(val).replace(/[^\d.,-]/g, '').replace(',', '.');
    const parsed = parseFloat(sanitized);
    return isNaN(parsed) ? 0 : parsed;
  })
  .pipe(z.number().min(0, 'Valor monetário não pode ser negativo'));

/**
 * Schema para quantidades inteiras positivas.
 */
export const quantitySchema = z
  .union([z.number(), z.string()])
  .transform(val => {
    if (typeof val === 'number') return Math.floor(val);
    const parsed = parseInt(sanitizeString(val), 10);
    return isNaN(parsed) ? 0 : parsed;
  })
  .pipe(z.number().int().min(0, 'Quantidade não pode ser negativa'));

/**
 * Schema padrão para itens de cotação / produtos do BelaFarma.
 */
export const produtoCotacaoSchema = z.object({
  ean: z.string().transform(v => sanitizeString(v).replace(/\D/g, '')),
  descricao: z.string().transform(sanitizeHtml),
  laboratorio: z.string().optional().transform(v => sanitizeHtml(v || '')),
  precoCusto: moneySchema.default(0),
  precoVenda: moneySchema.optional(),
  quantidade: quantitySchema.default(1),
  estoque: quantitySchema.default(0),
  portal: z.string().optional().transform(v => sanitizeString(v || ''))
});

export type ProdutoCotacao = z.infer<typeof produtoCotacaoSchema>;

/**
 * Helper seguro para validar dados sem estourar exceção unhandled.
 */
export function safeValidate<T>(
  schema: z.ZodType<T>,
  data: unknown
): { success: true; data: T } | { success: false; errors: string[] } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  const errors = result.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`);
  return { success: false, errors };
}
