const { workerData, parentPort } = require('worker_threads');
const { chromium } = require('playwright');
const { getWorkingProxy, isDirectMode, getProxyCount } = require('./proxies');
const { getTempEmail, checkInbox } = require('./email');
const { generateInsaneFPS, injectFPS } = require('./utils');
const { solve } = require('./captcha-solver');

function log(msg) {
  parentPort.postMessage({ type: 'log', data: `[W${workerData.workerId}] ${msg}` });
}

async function randomDelay(min, max) {
  return new Promise(r => setTimeout(r, min + Math.random() * (max - min)));
}

async function humanType(page, selector, text) {
  const el = await page.$(selector);
  if (!el) return;
  
  await el.click();
  await randomDelay(150, 350);
  
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Delete');
  await randomDelay(100, 200);
  
  for (let i = 0; i < text.length; i++) {
    await page.keyboard.press(text[i]);
    const delay = 30 + Math.random() * 100;
    await new Promise(r => setTimeout(r, delay));
  }
}

async function humanClick(page, selector) {
  const el = await page.$(selector);
  if (!el) return false;
  
  const box = await el.boundingBox();
  if (!box) return false;
  
  const x = box.x + 10 + Math.random() * (box.width - 20);
  const y = box.y + 10 + Math.random() * (box.height - 20);
  
  await page.mouse.move(x, y, { steps: 8 });
  await randomDelay(80, 200);
  await page.mouse.down();
  await randomDelay(20, 80);
  await page.mouse.up();
  
  return true;
}

async function extractToken(page) {
  await randomDelay(2000, 4000);
  
  return await page.evaluate(() => {
    try {
      if (window.localStorage) {
        const t = window.localStorage.getItem('token');
        if (t) return t;
      }
      if (window.sessionStorage) {
        const t = window.sessionStorage.getItem('token');
        if (t) return t;
      }
      const cookie = document.cookie.match(/token=([^;]+)/);
      if (cookie) return cookie[1];
      return null;
    } catch (e) {
      return null;
    }
  });
}

async function createAccount() {
  let browser;
  try {
    const proxy = await getWorkingProxy();
    const email = await getTempEmail();
    
    if (proxy) {
      log(`Proxy: ${proxy} | Pool: ${getProxyCount()} | Email: ${email}`);
    } else {
      log(`DIRECT | Email: ${email}`);
    }
    
    const launchOptions = {
      headless: false,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-features=IsolateOrigins,site-per-process',
        '--disable-web-security',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-gpu',
        '--window-size=1366,768'
      ]
    };
    
    if (proxy) {
      launchOptions.proxy = { server: `http://${proxy}` };
    }
    
    browser = await chromium.launch(launchOptions);
    
    const fingerprint = generateInsaneFPS();
    
    const context = await browser.newContext({
      viewport: { width: 1366, height: 768 },
      screen: { width: 1366, height: 768 },
      userAgent: fingerprint.userAgent,
      locale: fingerprint.locale,
      timezoneId: fingerprint.timezone,
      geolocation: fingerprint.geolocation,
      permissions: ['notifications'],
      colorScheme: 'light'
    });
    
    const page = await context.newPage();
    await injectFPS(page, fingerprint);
    
    await randomDelay(3000, 5000);
    
    log('Loading Discord...');
    await page.goto('https://discord.com/register', { 
      waitUntil: 'networkidle',
      timeout: 30000 
    });
    
    await randomDelay(3000, 5000);
    
    const blocked = await page.$('text=Sorry, something went wrong') 
      || await page.$('text=You are being rate limited')
      || await page.$('text=Access denied');
      
    if (blocked) {
      log('Blocked - closing');
      await browser.close();
      return;
    }
    
    const captchaImmediate = await page.$('iframe[src*="hcaptcha"]');
    if (captchaImmediate) {
      log('Instant captcha - attempting solve...');
      const frame = await captchaImmediate.contentFrame();
      const solved = await solve(frame, page);
      if (!solved) {
        log('Captcha solve failed');
        await browser.close();
        return;
      }
    }
    
    log('Filling form...');
    
    await humanType(page, 'input[name="email"]', email);
    await randomDelay(1000, 2000);
    
    const username = `user_${Math.floor(Math.random() * 100000000)}`;
    await humanType(page, 'input[name="username"]', username);
    await randomDelay(1000, 2000);
    
    const password = `Pass${Math.random().toString(36).slice(2, 12)}!`;
    await humanType(page, 'input[name="password"]', password);
    await randomDelay(1000, 2000);
    
    log('Setting DOB...');
    
    await page.evaluate(() => {
      const monthBtn = document.querySelector('[aria-label="Month"]');
      if (monthBtn) {
        monthBtn.click();
        setTimeout(() => {
          const jan = Array.from(document.querySelectorAll('*')).find(el => el.textContent?.trim() === 'January');
          if (jan) jan.click();
        }, 200);
      }
    });
    await randomDelay(800, 1200);
    
    await page.evaluate(() => {
      const dayBtn = document.querySelector('[aria-label="Day"]');
      if (dayBtn) {
        dayBtn.click();
        setTimeout(() => {
          const d15 = Array.from(document.querySelectorAll('*')).find(el => el.textContent?.trim() === '15');
          if (d15) d15.click();
        }, 200);
      }
    });
    await randomDelay(800, 1200);
    
    await page.evaluate(() => {
      const yearBtn = document.querySelector('[aria-label="Year"]');
      if (yearBtn) {
        yearBtn.click();
        setTimeout(() => {
          const y95 = Array.from(document.querySelectorAll('*')).find(el => el.textContent?.trim() === '1995');
          if (y95) y95.click();
        }, 200);
      }
    });
    await randomDelay(1500, 2500);
    
    const dobCheck = await page.evaluate(() => {
      const m = document.querySelector('[aria-label="Month"]')?.textContent?.trim();
      const d = document.querySelector('[aria-label="Day"]')?.textContent?.trim();
      const y = document.querySelector('[aria-label="Year"]')?.textContent?.trim();
      return { month: m, day: d, year: y };
    });
    
    log(`DOB: ${dobCheck.month} / ${dobCheck.day} / ${dobCheck.year}`);
    
    const terms = await page.$('input[type="checkbox"]');
    if (terms) {
      await terms.click();
      await randomDelay(500, 1000);
    }
    
    log('Submitting...');
    await randomDelay(2000, 4000);
    await humanClick(page, 'button[type="submit"]');
    await randomDelay(1000, 2000);
    
    await randomDelay(8000, 12000);
    
    const rateLimitAfter = await page.evaluate(() => {
      return document.body.innerText.includes('rate limited') || 
             document.body.innerText.includes('being rate limited');
    });
    
    if (rateLimitAfter) {
      log('Rate limited after submit');
      await browser.close();
      return;
    }
    
    const captcha = await page.$('iframe[src*="hcaptcha"]');
    if (captcha) {
      log('Post-submit captcha detected');
      const frame = await captcha.contentFrame();
      const solved = await solve(frame, page);
      if (!solved) {
        log('Captcha solve failed');
      }
      await randomDelay(5000, 8000);
    }
    
    const phone = await page.$('text=Verify your phone') || await page.$('input[type="tel"]');
    if (phone) {
      log('Phone required');
      await browser.close();
      return;
    }
    
    await randomDelay(3000, 5000);
    
    const url = page.url();
    log(`URL: ${url}`);
    
    const token = await extractToken(page);
    
    if (token && token.length > 50) {
      log('Token extracted!');
      parentPort.postMessage({ type: 'token', token, email });
    } else {
      log('No token extracted');
    }
    
    await browser.close();
    
  } catch (err) {
    log(`Error: ${err.message.slice(0, 150)}`);
    parentPort.postMessage({ type: 'error', error: err.message });
    if (browser) await browser.close().catch(() => {});
  }
}

function main() {
  log('Worker started');
  
  async function loop() {
    while (true) {
      try {
        await createAccount();
        const delay = isDirectMode() ? 120000 : 45000 + Math.random() * 45000;
        log(`Wait ${Math.round(delay/1000)}s...`);
        await new Promise(r => setTimeout(r, delay));
      } catch (err) {
        log(`Loop error: ${err.message}`);
        await new Promise(r => setTimeout(r, 60000));
      }
    }
  }
  
  setTimeout(loop, 1000);
}

main();
