const puppeteer = require('puppeteer');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

(async () => {
  console.log('Inspecting GraphQL / API calls on Consultar click...');

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });

  page.on('request', req => {
    const url = req.url();
    if (!url.endsWith('.png') && !url.endsWith('.jpg') && !url.endsWith('.css') && !url.endsWith('.js') && !url.includes('google') && !url.includes('stripe')) {
      console.log(`[REQ] ${req.method()} ${url}`);
      if (req.postData()) console.log(' -> Body:', req.postData());
    }
  });

  page.on('response', async res => {
    const url = res.url();
    if (!url.endsWith('.png') && !url.endsWith('.jpg') && !url.endsWith('.css') && !url.endsWith('.js') && !url.includes('google') && !url.includes('stripe')) {
      try {
        const text = await res.text();
        console.log(`[RESP ${res.status()}] ${url}`);
        if (text.includes('6.38') || text.includes('6,38') || text.includes('independentes') || text.includes('Baixo') || text.includes('Médio')) {
          console.log('\n🎯 EXACT PROFFER MATRIX RESPONSE MATCH:\n', text);
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

    console.log('Navigating to Neosoro product page...');
    await page.goto('https://app.nappsolutions.com/catalog/0f155b4e-006c-11f1-9fd8-a35e2a10b5e1', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 3000));

    console.log('Clicking Consultar button...');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button, div, span, a'));
      const btn = btns.find(b => b.innerText && b.innerText.trim() === 'Consultar');
      if (btn) btn.click();
    });

    await new Promise(r => setTimeout(r, 5000));

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await browser.close();
    console.log('Done.');
  }
})();
