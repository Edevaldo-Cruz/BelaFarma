/**
 * geoip.service.js
 * Serviço de geolocalização por IP com cache em memória e fallback seguro.
 * Identifica silenciosamente Cidade, Estado e País de acessos na vitrine.
 */

const ipCache = new Map();

function isPrivateIp(ip) {
  if (!ip) return true;
  const cleanIp = ip.replace(/^::ffff:/, '');
  return (
    cleanIp === '127.0.0.1' ||
    cleanIp === '::1' ||
    cleanIp === 'localhost' ||
    cleanIp.startsWith('10.') ||
    cleanIp.startsWith('192.168.') ||
    cleanIp.startsWith('172.16.') ||
    cleanIp.startsWith('172.31.')
  );
}

/**
 * Obtém cidade e estado a partir do IP do visitante.
 * @param {string} ip - Endereço IP do cliente
 * @returns {Promise<{ cidade: string, estado: string, pais: string }>}
 */
async function getGeoLocationFromIp(ip) {
  if (!ip || isPrivateIp(ip)) {
    return {
      cidade: 'Juiz de Fora',
      estado: 'MG',
      pais: 'Brasil'
    };
  }

  const cleanIp = ip.replace(/^::ffff:/, '').trim();

  if (ipCache.has(cleanIp)) {
    return ipCache.get(cleanIp);
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1800);

    const res = await fetch(`http://ip-api.com/json/${cleanIp}?fields=status,country,regionName,region,city`, {
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      if (data.status === 'success') {
        const geo = {
          cidade: data.city || 'Juiz de Fora',
          estado: data.region || 'MG',
          pais: data.country || 'Brasil'
        };
        ipCache.set(cleanIp, geo);
        return geo;
      }
    }
  } catch (e) {
    // Silently fallback on timeout or offline
  }

  const fallback = {
    cidade: 'Juiz de Fora',
    estado: 'MG',
    pais: 'Brasil'
  };
  ipCache.set(cleanIp, fallback);
  return fallback;
}

module.exports = {
  getGeoLocationFromIp,
  isPrivateIp
};
