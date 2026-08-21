/**
 * Serviço para cálculo de feriados nacionais brasileiros (fixos e móveis)
 * e verificação de dias úteis (segunda a sábado, excluindo domingos e feriados).
 */

function calcularPascoa(ano) {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(ano, mes - 1, dia);
}

function obterFeriadosNacionais(ano) {
  const feriados = [
    `${ano}-01-01`, // Confraternização Universal
    `${ano}-04-21`, // Tiradentes
    `${ano}-05-01`, // Dia do Trabalho
    `${ano}-09-07`, // Independência do Brasil
    `${ano}-10-12`, // Nossa Senhora Aparecida
    `${ano}-11-02`, // Finados
    `${ano}-11-15`, // Proclamação da República
    `${ano}-11-20`, // Dia da Consciência Negra
    `${ano}-12-25`, // Natal
  ];

  // Feriados móveis calculados a partir da Páscoa
  const pascoa = calcularPascoa(ano);

  // Carnaval (terça-feira, 47 dias antes da Páscoa)
  const carnaval = new Date(pascoa);
  carnaval.setDate(pascoa.getDate() - 47);
  feriados.push(formatarDataISO(carnaval));

  // Segunda de Carnaval (48 dias antes)
  const segundaCarnaval = new Date(pascoa);
  segundaCarnaval.setDate(pascoa.getDate() - 48);
  feriados.push(formatarDataISO(segundaCarnaval));

  // Sexta-feira Santa (2 dias antes da Páscoa)
  const sextaSanta = new Date(pascoa);
  sextaSanta.setDate(pascoa.getDate() - 2);
  feriados.push(formatarDataISO(sextaSanta));

  // Corpus Christi (60 dias após a Páscoa)
  const corpusChristi = new Date(pascoa);
  corpusChristi.setDate(pascoa.getDate() + 60);
  feriados.push(formatarDataISO(corpusChristi));

  return feriados;
}

function formatarDataISO(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Verifica se a data informada é dia útil para rotina de produtos (segunda a sábado, sem feriados)
 * @param {Date|string} dateObj 
 * @returns {boolean}
 */
function ehDiaUtilParaMural(dateObj = new Date()) {
  const d = typeof dateObj === 'string' ? new Date(dateObj + 'T12:00:00') : new Date(dateObj);
  const dayOfWeek = d.getDay(); // 0 = Domingo, 6 = Sábado

  // Domingo não gera
  if (dayOfWeek === 0) {
    return false;
  }

  const dataISO = formatarDataISO(d);
  const feriadosAno = obterFeriadosNacionais(d.getFullYear());

  if (feriadosAno.includes(dataISO)) {
    return false; // É feriado nacional
  }

  return true;
}

module.exports = {
  ehDiaUtilParaMural,
  obterFeriadosNacionais,
  formatarDataISO
};
