const fs = require('fs');
const path = require('path');

const serverUrl = 'https://app.drogariabelafarma.com.br';
const triggerUrl = `${serverUrl}/api/whatsapp/send-immediate`;
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

async function runImageTrigger() {
  try {
    // 1. Baixa a imagem de teste promocional
    await downloadImage(imageUrl, localImagePath);

    // 2. Cria FormData multipart para o envio imediato com imagem
    console.log(`🚀 Fazendo upload da imagem física e enfileirando post na VPS de produção...`);
    const fileBuffer = fs.readFileSync(localImagePath);
    const formData = new FormData();
    const blob = new Blob([fileBuffer], { type: 'image/jpeg' });
    formData.append('media', blob, 'vitamina_promocional.jpg');
    formData.append('groupId', 'Marketing');
    formData.append('groupName', 'Marketing');
    formData.append('content', '💊 Oferta Especial Bela Farma: Cuide da sua saúde com as melhores vitaminas e suplementos do mercado! Aproveite nossas promoções exclusivas da semana! ☀️\n\nFique atento! A cada hora traremos uma oferta imperdível para você! 🔔');

    const res = await fetch(triggerUrl, {
      method: 'POST',
      body: formData
    });

    console.log(`HTTP Status Disparo: ${res.status} ${res.statusText}`);
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Erro no envio: ${errText}`);
    }

    const data = await res.json();
    console.log('✅ Resposta de Confirmação da VPS de Produção:');
    console.log(JSON.stringify(data, null, 2));

  } catch (err) {
    console.error('💥 Ocorreu um erro no teste com imagem na produção:', err.message);
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

runImageTrigger();
