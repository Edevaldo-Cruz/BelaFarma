
/**
 * INTEGRAÇÃO MONGODB ATLAS (DATA API)
 * 
 * Se o erro "Failed to fetch" persistir:
 * 1. MongoDB Atlas -> App Services -> Data API -> Settings -> Allowed Origins -> Adicionar "*"
 * 2. Clique em "Review Draft & Deploy" (Botão azul no topo).
 */

const ATLAS_CONFIG = {
  endpoint: 'https://sa-east-1.aws.data.mongodb-api.com/app/data-bhzrbfe/endpoint/data/v1', 
  apiKey: 'mdb_sa_sk_rXt_BACYUMGw1ZIHduNx1TVF4eXoANI08qTrLKT4', 
  cluster: 'BancoBela',
  database: 'belafarma',
  dataSource: 'BancoBela'
};

export const isAtlasConfigured = () => {
  return (
    ATLAS_CONFIG.apiKey.startsWith('mdb_sa_sk_') && 
    ATLAS_CONFIG.endpoint.includes('bhzrbfe')
  );
};

export const atlasRequest = async (action: string, collection: string, body: any = {}) => {
  if (!isAtlasConfigured()) return null;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000); // Timeout rápido de 4s

    const response = await fetch(`${ATLAS_CONFIG.endpoint}/action/${action}`, {
      method: 'POST',
      mode: 'cors',
      headers: {
        'Content-Type': 'application/json',
        'api-key': ATLAS_CONFIG.apiKey,
      },
      signal: controller.signal,
      body: JSON.stringify({
        dataSource: ATLAS_CONFIG.dataSource,
        database: ATLAS_CONFIG.database,
        collection: collection,
        ...body
      }),
    });

    clearTimeout(timeoutId);

    if (!response.ok) return null;
    return await response.json();
  } catch (error: any) {
    // Log silencioso para o desenvolvedor
    console.warn(`[BancoBela] Sincronização offline: ${error.message}`);
    // Lançamos um erro específico para o componente saber que é erro de rede
    throw new Error('NETWORK_ERROR');
  }
};
