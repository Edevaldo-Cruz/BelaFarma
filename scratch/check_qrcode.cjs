async function run() {
  try {
    console.log('--- Baileys Principal Status ---');
    const resStatus = await fetch('http://192.168.1.70:3001/api/whatsapp/baileys/status');
    const dataStatus = await resStatus.json();
    console.log(JSON.stringify(dataStatus, null, 2));

    console.log('--- Baileys Principal QR Code ---');
    const resQR = await fetch('http://192.168.1.70:3001/api/whatsapp/baileys/qrcode');
    const dataQR = await resQR.json();
    console.log('hasQR:', dataQR.hasQR);
    console.log('qrCode length:', dataQR.qrCode ? dataQR.qrCode.length : 0);
    if (dataQR.qrCode) {
      console.log('qrCode snippet:', dataQR.qrCode.substring(0, 80));
    }

    console.log('--- Secondary Status ---');
    const resSecStatus = await fetch('http://192.168.1.70:3001/api/whatsapp/secondary/status');
    const dataSecStatus = await resSecStatus.json();
    console.log(JSON.stringify(dataSecStatus, null, 2));

    console.log('--- Secondary QR Code ---');
    const resSecQR = await fetch('http://192.168.1.70:3001/api/whatsapp/secondary/qrcode');
    const dataSecQR = await resSecQR.json();
    console.log('hasQR:', dataSecQR.hasQR);
    console.log('qrCode length:', dataSecQR.qrCode ? dataSecQR.qrCode.length : 0);
  } catch (err) {
    console.error('Error:', err.message);
  }
}

run();
