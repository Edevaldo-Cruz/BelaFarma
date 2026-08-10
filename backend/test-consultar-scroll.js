const puppeteer = require('puppeteer');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

(async () => {
  console.log('Testing exact Consultar button click with scrolling and Puppeteer click...');

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
        console.log(' -> Body:', text.substring(0, 1000));
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

    // Scroll down to make Proffer section visible
    await page.evaluate(() => window.scrollTo(0, 1000));
    await new Promise(r => setTimeout(r, 1000));

    console.log('Finding Consultar button...');
    const btnSelector = 'button';
    const buttons = await page.$$(btnSelector);
    let consultarBtn = null;
    for (const b of buttons) {
      const text = await page.evaluate(el => el.innerText.trim(), b);
      if (text === 'Consultar' || text === 'Consultar novamente' || text.includes('Consultar')) {
        consultarBtn = b;
        console.log(`Found button with text: "${text}"`);
        break;
      }
    }

    if (consultarBtn) {
      console.log('Clicking button with Puppeteer native click...');
      await consultarBtn.click();
      await new Promise(r => setTimeout(r, 5000));
    } else {
      console.log('Consultar button not found among <button> elements.');
    }

    const domText = await page.evaluate(() => document.body.innerText);
    console.log('\n--- DOM TEXT AFTER CLICK ---');
    if (domText.includes('Farmácias independentes') || domText.includes('6,38') || domText.includes('6.38')) {
      console.log('🎯 TABLE FOUND IN DOM!');
      const idx = domText.indexOf('Farmácias independentes');
      console.log(domText.substring(idx - 50, idx + 400));
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
