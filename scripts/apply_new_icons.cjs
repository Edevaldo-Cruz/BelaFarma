const path = require('path');
const fs = require('fs');

const projectDir = 'c:/Users/User/.gemini/antigravity/scratch/projects/BelaFarma';
const sharp = require(path.join(projectDir, 'backend/node_modules/sharp'));

async function buildIcons() {
  const brainDir = 'C:/Users/User/.gemini/antigravity/brain/f829ed85-7a28-441e-a657-6c0ad8d04aaf';
  const publicDir = path.join(projectDir, 'public');
  const imagesDir = path.join(publicDir, 'images');
  const tauriIconsDir = path.join(projectDir, 'src-tauri/icons');

  // Source image is the approved variation 1: 512x512 red badge with white symbol
  const srcBadgePath = path.join(brainDir, 'variation_1_red_badge.png');
  const badgeBuffer = fs.readFileSync(srcBadgePath);

  console.log('Source badge loaded:', srcBadgePath);

  // 1. PWA 512x512
  await sharp(badgeBuffer)
    .resize(512, 512, { kernel: 'lanczos3' })
    .png()
    .toFile(path.join(publicDir, 'pwa-512x512.png'));
  console.log('Generated: pwa-512x512.png');

  // 2. PWA 192x192
  await sharp(badgeBuffer)
    .resize(192, 192, { kernel: 'lanczos3' })
    .png()
    .toFile(path.join(publicDir, 'pwa-192x192.png'));
  console.log('Generated: pwa-192x192.png');

  // 3. UI In-App Icons (logo-icon.png and logo-icon-badge.png)
  await sharp(badgeBuffer)
    .resize(256, 256, { kernel: 'lanczos3' })
    .png()
    .toFile(path.join(imagesDir, 'logo-icon.png'));
  console.log('Generated: images/logo-icon.png');

  await sharp(badgeBuffer)
    .resize(256, 256, { kernel: 'lanczos3' })
    .png()
    .toFile(path.join(imagesDir, 'logo-icon-badge.png'));
  console.log('Generated: images/logo-icon-badge.png');

  // 4. Favicons
  await sharp(badgeBuffer)
    .resize(64, 64, { kernel: 'lanczos3' })
    .png()
    .toFile(path.join(publicDir, 'favicon.png'));
  console.log('Generated: favicon.png');

  const fav32Buffer = await sharp(badgeBuffer)
    .resize(32, 32, { kernel: 'lanczos3' })
    .png()
    .toBuffer();
  fs.writeFileSync(path.join(publicDir, 'favicon-32x32.png'), fav32Buffer);
  console.log('Generated: favicon-32x32.png');

  // Generate valid ICO for 32x32
  const icoHeader = Buffer.alloc(6);
  icoHeader.writeUInt16LE(0, 0); // reserved
  icoHeader.writeUInt16LE(1, 2); // ICO type
  icoHeader.writeUInt16LE(1, 4); // 1 image

  const icoEntry = Buffer.alloc(16);
  icoEntry.writeUInt8(32, 0); // width
  icoEntry.writeUInt8(32, 1); // height
  icoEntry.writeUInt8(0, 2);  // color count
  icoEntry.writeUInt8(0, 3);  // reserved
  icoEntry.writeUInt16LE(1, 4);  // color planes
  icoEntry.writeUInt16LE(32, 6); // bpp
  icoEntry.writeUInt32LE(fav32Buffer.length, 8); // image size
  icoEntry.writeUInt32LE(22, 12); // offset (6 + 16)

  const icoBuffer = Buffer.concat([icoHeader, icoEntry, fav32Buffer]);
  fs.writeFileSync(path.join(publicDir, 'favicon.ico'), icoBuffer);
  console.log('Generated: favicon.ico');

  // 5. Tauri icons
  if (fs.existsSync(tauriIconsDir)) {
    await sharp(badgeBuffer)
      .resize(512, 512, { kernel: 'lanczos3' })
      .png()
      .toFile(path.join(tauriIconsDir, 'icon.png'));
    fs.writeFileSync(path.join(tauriIconsDir, 'icon.ico'), icoBuffer);
    console.log('Generated Tauri icons');
  }

  console.log('All icons generated successfully!');
}

buildIcons().catch(err => {
  console.error('Error generating icons:', err);
  process.exit(1);
});
