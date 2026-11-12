/**
 * Utilitário universal de cópia para a área de transferência.
 * Funciona de forma transparente em HTTP (rede local da farmácia), HTTPS, localhost
 * e em qualquer navegador (Chrome, Edge, Firefox, Safari).
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  // 1. Tentar Clipboard API nativa se o contexto for seguro
  if (navigator?.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      console.warn('[BelaFarma] Falha na API navigator.clipboard nativa, acionando fallback execCommand:', err);
    }
  }

  // 2. Fallback universal para HTTP e navegadores em rede local (textarea invisível + execCommand)
  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-9999px';
    textArea.style.top = '-9999px';
    textArea.style.opacity = '0';
    textArea.setAttribute('readonly', '');
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const success = document.execCommand('copy');
    document.body.removeChild(textArea);
    return !!success;
  } catch (fallbackErr) {
    console.error('[BelaFarma] Falha total ao copiar para área de transferência:', fallbackErr);
    return false;
  }
}
