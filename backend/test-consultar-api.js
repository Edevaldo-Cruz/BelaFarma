const puppeteer = require('puppeteer');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

(async () => {
  console.log('Testing exact Consultar button click for Neosoro...');

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });

  page.on('request', req => {
    const url = req.url();
    if (!url.includes('google') && !url.includes('stripe') && !url.includes('iconify') && !url.endsWith('.png') && !url.endsWith('.jpg')) {
      console.log(`[REQ ${req.method()}] ${url}`);
      if (req.postData()) console.log('   Payload:', req.postData());
    }
  });

  page.on('response', async res => {
    const url = res.url();
    if (!url.includes('google') && !url.includes('stripe') && !url.includes('iconify') && !url.endsWith('.png') && !url.endsWith('.jpg')) {
      try {
        const ct = res.headers()['content-type'] || '';
        let body = null;
        if (ct.includes('json') || ct.includes('text')) {
          body = await res.text();
        }
        console.log(`[RESP ${res.status()}] ${url.substring(0, 110)}`);
        if (body && (body.includes('6.38') || body.includes('6,38') || body.includes('independentes') || body.includes('proffer') || body.includes('price'))) {
          console.log('   🎯 PROFFER BODY MATCH:\n', body.substring(0, 1500));
        }
      } catch (e) {}
    }
  });

  try {
    // 1. Login
    const loginUrl = process.env.NAPP_LOGIN_URL || 'https://app.nappsolutions.com/login';
    await page.goto(loginUrl, { waitUntil: 'networkidle2' });

    await page.waitForSelector('input', { timeout: 15000 });
    const emailInput = await page.$('input[type="text"], input[type="email"], input[name="email"]');
    const passwordInput = await page.$('input[type="password"], input[name="password"]');

    await emailInput.type(process.env.NAPP_EMAIL);
    await passwordInput.type(process.env.NAPP_PASSWORD);
    await page.keyboard.press('Enter');
    await new Promise(r => setTimeout(r, 4000));

    // 2. Open Product Details for Neosoro (0f155b4e-006c-11f1-9fd8-a35e2a10b5e1)
    console.log('Navigating directly to Product Details for Neosoro...');
    await page.goto('https://app.nappsolutions.com/catalog/0f155b4e-006c-11f1-9fd8-a35e2a10b5e1', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 3000));

    // 3. Find button with text "Consultar"
    console.log('Searching for button "Consultar"...');
    const consultarBtn = await page.evaluateHandle(() => {
      const btns = Array.from(document.querySelectorAll('button, div, span, a'));
      return btns.find(b => b.innerText && b.innerText.trim() === 'Consultar');
    });

    if (consultarBtn) {
      console.log('Found Consultar button! Clicking...');
      await consultarBtn.click();
      await new Promise(r => setTimeout(r, 6000));
    } else {
      console.log('Consultar button element not found.');
    }

    const domText = await page.evaluate(() => document.body.innerText);
    console.log('\n========================================');
    console.log('DOM TEXT AFTER CLICKING CONSULTAR:');
    console.log('========================================');
    if (domText.includes('Farmácias independentes') || domText.includes('6,38') || domText.includes('6.38')) {
      const idx = domText.indexOf('Farmácias independentes');
      console.log(domText.substring(idx - 100, idx + 600));
    } else {
      console.log(domText.substring(0, 1500));
    }

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await browser.close();
    console.log('Done.');
  }
})();
