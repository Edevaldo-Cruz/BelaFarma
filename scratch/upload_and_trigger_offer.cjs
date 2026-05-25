const fs = require('fs');
const path = require('path');

const serverUrl = 'http://localhost:3001';
const uploadUrl = `${serverUrl}/api/whatsapp/offers-bank`;
const triggerUrl = `${serverUrl}/api/whatsapp/send-immediate-bank`;
const imageUrl = 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=500'; // Imagem estável de frascos de remédio do Unsplash
const localImagePath = path.join(__dirname, 'product.jpg');

async function downloadImage(url, dest) {
  console.log(`📥 Baixando imagem promocional de teste da internet: ${url}...`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Falha no download da imagem de teste: Status ${res.status}`);
  const arrayBuffer = await res.arrayBuffer();
  fs.writeFileSync(dest, Buffer.from(arrayBuffer));
  console.log(`✅ Imagem salva temporariamente em: ${dest}`);
}

async function runUploadAndTrigger() {
  try {
    // 1. Baixa a imagem de teste promocional
    await downloadImage(imageUrl, localImagePath);

    // 2. Cria FormData multipart para o upload da oferta
    console.log(`🧠 Fazendo upload e acionando IA Multimodal da VPS de produção para analisar o produto...`);
    const fileBuffer = fs.readFileSync(localImagePath);
    const formData = new FormData();
    // FormData nativo do Node.js v18+ aceita Blob com filename
    const blob = new Blob([fileBuffer], { type: 'image/jpeg' });
    formData.append('media', blob, 'vitamina_promocional.jpg');

    const uploadRes = await fetch(uploadUrl, {
      method: 'POST',
      body: formData
    });

    console.log(`HTTP Status Upload: ${uploadRes.status} ${uploadRes.statusText}`);
    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      throw new Error(`Erro no upload: ${errText}`);
    }

    const uploadData = await uploadRes.json();
    console.log('✅ IA Multimodal da VPS de Produção Processou com Sucesso:');
    console.log(JSON.stringify(uploadData, null, 2));

    if (!uploadData.success || !uploadData.offer) {
      throw new Error('VPS não retornou a oferta criada de forma correta.');
    }

    const { id: offerId, productName } = uploadData.offer;
    console.log(`\n🚀 Oferta criada ID: "${offerId}" ("${productName}")`);
    console.log(`🚀 Solicitando disparo imediato da oferta para o grupo "Marketing" em produção...`);

    // 3. Dispara a oferta criada para a fila imediata do robô
    const triggerRes = await fetch(triggerUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        offerId,
        groupId: 'Marketing',
        groupName: 'Marketing'
      })
    });

    console.log(`HTTP Status Disparo: ${triggerRes.status} ${triggerRes.statusText}`);
    const triggerData = await triggerRes.json();
    console.log('✅ Resposta de Confirmação da VPS:');
    console.log(JSON.stringify(triggerData, null, 2));

  } catch (err) {
    console.error('💥 Ocorreu um erro no teste de ponta a ponta:', err.message);
  } finally {
    // Limpeza da imagem local temporária
    if (fs.existsSync(localImagePath)) {
      try {
        fs.unlinkSync(localImagePath);
        console.log('🧹 Limpeza de arquivos locais concluída.');
      } catch (e) {}
    }
  }
}

runUploadAndTrigger();
