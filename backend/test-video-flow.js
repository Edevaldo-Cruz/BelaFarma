const puppeteer = require('puppeteer');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

(async () => {
  console.log('Replicating EXACT video flow for Neosoro (7896714231143)...');

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });

  let networkLog = [];

  page.on('request', req => {
    const url = req.url();
    if (!url.includes('google') && !url.includes('stripe') && !url.includes('iconify') && !url.endsWith('.png') && !url.endsWith('.jpg')) {
      networkLog.push({
        event: 'REQ',
        method: req.method(),
        url: url,
        postData: req.postData() || null
      });
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
        networkLog.push({
          event: 'RESP',
          status: res.status(),
          url: url,
          bodySnippet: body ? body.substring(0, 1000) : null
        });
      } catch (e) {}
    }
  });

  try {
    // 1. Login
    const loginUrl = process.env.NAPP_LOGIN_URL || 'https://app.nappsolutions.com/login';
    console.log('1. Navigating to login...');
    await page.goto(loginUrl, { waitUntil: 'networkidle2' });

    await page.waitForSelector('input', { timeout: 15000 });
    const emailInput = await page.$('input[type="text"], input[type="email"], input[name="email"]');
    const passwordInput = await page.$('input[type="password"], input[name="password"]');

    await emailInput.type(process.env.NAPP_EMAIL);
    await passwordInput.type(process.env.NAPP_PASSWORD);
    await page.keyboard.press('Enter');
    await new Promise(r => setTimeout(r, 4000));

    // 2. Open Catalog Search for 7896714231143
    console.log('2. Searching catalog for 7896714231143...');
    await page.goto('https://app.nappsolutions.com/catalog?search=7896714231143', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 3000));

    // 3. Click product row or navigate to product details
    console.log('3. Navigating to Product Details page...');
    const productUrl = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a, tr, div'));
      for (const l of links) {
        if (l.innerText && l.innerText.includes('7896714231143')) {
          // If it's a link or clickable
          const anchor = l.closest('a') || l.querySelector('a');
          if (anchor && anchor.href) return anchor.href;
        }
      }
      return null;
    });

    if (productUrl) {
      console.log('Product URL found:', productUrl);
      await page.goto(productUrl, { waitUntil: 'networkidle2' });
    } else {
      console.log('Clicking on product row directly...');
      await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll('tr, div'));
        const row = rows.find(r => r.innerText && r.innerText.includes('7896714231143'));
        if (row) row.click();
      });
      await new Promise(r => setTimeout(r, 3000));
    }

    console.log('Current URL on product page:', page.url());

    // CLEAR NETWORK LOG BEFORE CONSULTAR CLICK
    networkLog = [];

    // 4. Click Consultar button
    console.log('4. Clicking Consultar button...');
    const clickSuccess = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button, div, span'));
      const target = btns.find(b => b.innerText && b.innerText.trim() === 'Consultar');
      if (target) {
        target.click();
        return true;
      }
      return false;
    });

    console.log('Click Consultar result:', clickSuccess);

    // Wait 6 seconds for network request & response
    await new Promise(r => setTimeout(r, 6000));

    console.log('\n========================================');
    console.log(`CAPTURED ${networkLog.length} NETWORK EVENTS AFTER CLICKING CONSULTAR:`);
    console.log('========================================');

    networkLog.forEach((ev, idx) => {
      if (ev.event === 'REQ') {
        console.log(`\n[#${idx + 1} REQ ${ev.method}] ${ev.url}`);
        if (ev.postData) console.log('   Payload:', ev.postData);
      } else {
        console.log(`[#${idx + 1} RESP ${ev.status}] ${ev.url}`);
        if (ev.bodySnippet) console.log('   Response Body:\n', ev.bodySnippet);
      }
    });

    // Also extract DOM text after click to confirm the table values (6.38, 4.00, 8.30)
    const domText = await page.evaluate(() => document.body.innerText);
    console.log('\n========================================');
    console.log('DOM TEXT AFTER CONSULTAR CLICK:');
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
    console.log('\nFinished Video Replica Test.');
  }
})();
