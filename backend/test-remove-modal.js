const puppeteer = require('puppeteer');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

(async () => {
  console.log('Testing exact DOM removal of modal overlay and clicking Consultar...');

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });

  page.on('response', async res => {
    const url = res.url();
    const status = res.status();
    if (!url.endsWith('.png') && !url.endsWith('.jpg') && !url.endsWith('.css') && !url.endsWith('.js') && !url.includes('google') && !url.includes('stripe') && !url.includes('onesignal')) {
      try {
        const text = await res.text();
        console.log(`[HTTP ${status}] ${url.substring(0, 100)}`);
        if (text.includes('independentes') || text.includes('6.38') || text.includes('6,38') || text.includes('Rede de farmácias')) {
          console.log('\n🎯 FOUND REGIONAL MATRIX IN RESPONSE!\n', text.substring(0, 1500));
        }
      } catch (e) {}
    }
  });

  try {
    const loginUrl = process.env.NAPP_LOGIN_URL || 'https://app.nappsolutions.com/login';
    await page.goto(loginUrl, { waitUntil: 'networkidle2' });

    await page.waitForSelector('input', { timeout: 15000 });
    const emailInput = await page.$('input[type="text"], input[type="email"]');
    const passwordInput = await page.$('input[type="password"]');

    await emailInput.type(process.env.NAPP_EMAIL);
    await passwordInput.type(process.env.NAPP_PASSWORD);
    await page.keyboard.press('Enter');
    await new Promise(r => setTimeout(r, 4000));

    console.log('Navigating directly to Neosoro product details...');
    await page.goto('https://app.nappsolutions.com/catalog/0f155b4e-006c-11f1-9fd8-a35e2a10b5e1', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 3000));

    // Remove any modal or backdrop overlays directly from DOM
    console.log('Removing modal overlays from DOM...');
    await page.evaluate(() => {
      const modals = document.querySelectorAll('.MuiModal-root, [role="presentation"], [class*="MuiBackdrop"]');
      modals.forEach(m => m.remove());
    });
    await new Promise(r => setTimeout(r, 1000));

    // Scroll to Proffer section
    await page.evaluate(() => window.scrollTo(0, 800));
    await new Promise(r => setTimeout(r, 1000));

    console.log('Current URL:', page.url());

    // Click Consultar button
    console.log('Clicking Consultar button...');
    const clickRes = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const consultar = btns.find(b => b.innerText && (b.innerText.trim() === 'Consultar' || b.innerText.trim() === 'Consultar novamente'));
      if (consultar) {
        consultar.click();
        return 'CLICKED: ' + consultar.innerText;
      }
      return 'NOT_FOUND. Available buttons: ' + btns.map(b => b.innerText.trim()).join(' | ');
    });

    console.log('Click result:', clickRes);
    await new Promise(r => setTimeout(r, 6000));

    const text = await page.evaluate(() => document.body.innerText);
    console.log('\n--- PAGE TEXT AFTER CLICK ---');
    if (text.includes('Farmácias independentes') || text.includes('6,38') || text.includes('6.38')) {
      console.log('🎯 REGIONAL TABLE SUCCESS!');
      const idx = text.indexOf('Farmácias independentes');
      console.log(text.substring(idx - 100, idx + 600));
    } else {
      console.log(text.substring(0, 1500));
    }

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await browser.close();
    console.log('Done.');
  }
})();
