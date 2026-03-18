const { workerData, parentPort } = require('worker_threads');
const { chromium } = require('playwright');
const { getWorkingProxy, isDirectMode, getProxyCount } = require('./proxies');
const { getTempEmail, checkInbox } = require('./email');
const { generateInsaneFPS, injectFPS } = require('./utils');

function log(msg) {
  parentPort.postMessage({ type: 'log', data: `[W${workerData.workerId}] ${msg}` });
}

async function randomDelay(min, max) {
  return new Promise(r => setTimeout(r, min + Math.random() * (max - min)));
}

async function humanType(page, selector, text) {
  const el = await page.$(selector);
  if (!el) {
    log(`Element not found: ${selector}`);
    return;
  }
  await el.click();
  await randomDelay(200, 400);
  
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Delete');
  await randomDelay(100, 200);
  
  for (let i = 0; i < text.length; i++) {
    await page.keyboard.press(text[i]);
    const delay = 50 + Math.random() * 100;
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
  
  await page.mouse.move(x, y, { steps: 10 });
  await randomDelay(100, 300);
  await page.mouse.down();
  await randomDelay(50, 150);
  await page.mouse.up();
  
  return true;
}

async function extractToken(page) {
  await randomDelay(2000, 3000);
  
  const token = await page.evaluate(() => {
    try {
      const ls = window.localStorage?.getItem('token');
      if (ls) return ls;
      const ss = window.sessionStorage?.getItem('token');
      if (ss) return ss;
      const cookie = document.cookie.match(/token=([^;]+)/);
      if (cookie) return cookie[1];
      return null;
    } catch (e) {
      return null;
    }
  });
  
  return token;
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
    
    // Longer initial delay
    await randomDelay(3000, 5000);
    
    log('Loading Discord...');
    await page.goto('https://discord.com/register', { 
      waitUntil: 'networkidle',
      timeout: 30000 
    });
    
    // Wait for page to fully load
    await randomDelay(3000, 5000);
    
    // Check for rate limit immediately
    const rateLimited = await page.$('text=rate limited') || await page.$('text=You are being rate limited');
    if (rateLimited) {
      log('Rate limited on load - IP flagged');
      await browser.close();
      return;
    }
    
    // Check for captcha immediately
    const captchaImmediate = await page.$('iframe[src*="hcaptcha"]') || await page.$('[data-sitekey]');
    if (captchaImmediate) {
      log('Immediate captcha - bot detected');
      await browser.close();
      return;
    }
    
    log('Filling form...');
    
    // Slower form fill with more delays
    await humanType(page, 'input[name="email"]', email);
    await randomDelay(1000, 2000);
    
    const username = `user_${Math.floor(Math.random() * 100000000)}`;
    await humanType(page, 'input[name="username"]', username);
    await randomDelay(1000, 2000);
    
    const password = `Pass${Math.random().toString(36).slice(2, 12)}!`;
    await humanType(page, 'input[name="password"]', password);
    await randomDelay(1000, 2000);
    
    // DOB with delays
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
    
    // Verify DOB
    const dobCheck = await page.evaluate(() => {
      const m = document.querySelector('[aria-label="Month"]')?.textContent?.trim();
      const d = document.querySelector('[aria-label="Day"]')?.textContent?.trim();
      const y = document.querySelector('[aria-label="Year"]')?.textContent?.trim();
      return { month: m, day: d, year: y };
    });
    
    log(`DOB: ${dobCheck.month} / ${dobCheck.day} / ${dobCheck.year}`);
    
    // Check terms
    const terms = await page.$('input[type="checkbox"]');
    if (terms) {
      await terms.click();
      await randomDelay(500, 1000);
    }
    
    // Submit with delay
    log('Submitting...');
    await randomDelay(2000, 3000);
    await humanClick(page, 'button[type="submit"]');
    await randomDelay(1000, 2000);
    
    // Wait for response
    await randomDelay(8000, 12000);
    
    // Check for rate limit after submit
    const rateLimitAfter = await page.evaluate(() => {
      return document.body.innerText.includes('rate limited') || 
             document.body.innerText.includes('being rate limited');
    });
    
    if (rateLimitAfter) {
      log('Rate limited after submit');
      await browser.close();
      return;
    }
    
    // Check for captcha
    const captcha = await page.$('iframe[src*="hcaptcha"]');
    if (captcha) {
      log('Captcha - waiting 45s...');
      await randomDelay(45000, 50000);
    }
    
    // Check for phone
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

(async function main() {
  log('Worker started');
  while (true) {
    await createAccount();
    // Longer wait between accounts to avoid rate limit
    const delay = 120000 + Math.random() * 60000; // 2-3 minutes
    log(`Wait ${Math.round(delay/1000)}s...`);
    await randomDelay(delay, delay);
  }
})();
