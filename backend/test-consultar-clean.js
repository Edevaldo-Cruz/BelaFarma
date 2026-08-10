const puppeteer = require('puppeteer');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

(async () => {
  console.log('Testing Consultar click with modal dismissal...');

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
        console.log(`\n[HTTP ${status}] ${url}`);
        if (text.includes('independentes') || text.includes('6.38') || text.includes('6,38') || text.includes('Rede de farmácias')) {
          console.log('🎯 FOUND REGIONAL MATRIX IN RESPONSE!\n', text.substring(0, 1500));
        } else {
          console.log(' -> Body:', text.substring(0, 300));
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

    console.log('Navigating to Neosoro product details...');
    await page.goto('https://app.nappsolutions.com/catalog/0f155b4e-006c-11f1-9fd8-a35e2a10b5e1', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 3000));

    // Dismiss any modals / toasts
    console.log('Dismissing popups...');
    await page.evaluate(() => {
      const allBtns = Array.from(document.querySelectorAll('button, span, div, svg'));
      allBtns.forEach(b => {
        const txt = b.innerText ? b.innerText.trim() : '';
        if (txt === 'Lembrar-me mais tarde' || txt === 'Depois' || txt === 'Sim') {
          b.click();
        }
      });
      // Also try clicking modal close SVG / buttons
      const closeButtons = document.querySelectorAll('.MuiModal-root button, [aria-label="close"]');
      closeButtons.forEach(cb => cb.click());
    });
    await new Promise(r => setTimeout(r, 2000));

    // Scroll to Proffer section
    console.log('Scrolling to Proffer section...');
    await page.evaluate(() => window.scrollTo(0, 800));
    await new Promise(r => setTimeout(r, 1000));

    // Click Consultar button
    console.log('Finding and clicking Consultar button...');
    const clickResult = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const consultar = btns.find(b => b.innerText && (b.innerText.trim() === 'Consultar' || b.innerText.trim() === 'Consultar novamente'));
      if (consultar) {
        consultar.click();
        return 'CLICKED: ' + consultar.innerText;
      }
      return 'NOT_FOUND';
    });

    console.log('Click result:', clickResult);
    await new Promise(r => setTimeout(r, 6000));

    const text = await page.evaluate(() => document.body.innerText);
    console.log('\n--- PAGE TEXT AFTER CLICK ---');
    if (text.includes('Farmácias independentes') || text.includes('6,38') || text.includes('6.38')) {
      console.log('🎯 REGIONAL TABLE SUCCESS!');
      const idx = text.indexOf('Farmácias independentes');
      console.log(text.substring(idx - 50, idx + 500));
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
