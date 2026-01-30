
export const formatDateInBrazil = (dateString: string): string => {
  if (!dateString) return '';
  // Se a string vier como '2024-05-20', dividimos manualmente para evitar conversão de fuso
  if (dateString.includes('T')) {
      // Se vier com Time, usamos UTC para evitar mudança de dia
      const date = new Date(dateString);
      return date.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
  } else {
      // Se vier 'YYYY-MM-DD', forçamos a interpretação correta
      const [year, month, day] = dateString.split('-').map(Number);
      // Criamos a data usando Date.UTC para garantir que seja interpretada como UTC meia-noite
      // E exibimos usando UTC para não alterar
      const date = new Date(Date.UTC(year, month - 1, day));
      return date.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
  }
};

export const getDayFromDate = (dateString: string): number => {
    if (!dateString) return 0;
    if (dateString.includes('T')) {
        const date = new Date(dateString);
        // Usar UTC para extrair o dia correto
        return date.getUTCDate();
    } else {
        const parts = dateString.split('-');
        return parseInt(parts[2], 10);
    }
}
