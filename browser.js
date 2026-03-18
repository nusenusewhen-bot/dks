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
  await page.click(selector);
  await randomDelay(50, 150);
  for (let i = 0; i < text.length; i += Math.random() > 0.7 ? 2 : 1) {
    const chars = text.slice(i, i + (Math.random() > 0.7 ? 2 : 1));
    await page.keyboard.insertText(chars);
    await randomDelay(20, 80);
  }
}

async function humanClick(page, selector) {
  const el = await page.$(selector);
  if (!el) return;
  const box = await el.boundingBox();
  if (box) {
    const x = box.x + box.width / 2 + (Math.random() * 6 - 3);
    const y = box.y + box.height / 2 + (Math.random() * 6 - 3);
    await page.mouse.move(x, y, { steps: 3 });
    await randomDelay(30, 100);
    await page.mouse.click(x, y);
  } else {
    await el.click();
  }
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
        '--window-size=1366,768',
        '--disable-background-networking',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-breakpad',
        '--disable-client-side-phishing-detection',
        '--disable-component-update',
        '--disable-default-apps',
        '--disable-features=TranslateUI',
        '--disable-hang-monitor',
        '--disable-ipc-flooding-protection',
        '--disable-popup-blocking',
        '--disable-prompt-on-repost',
        '--disable-renderer-backgrounding',
        '--disable-sync',
        '--force-color-profile=srgb',
        '--metrics-recording-only',
        '--safebrowsing-disable-auto-update',
        '--password-store=basic',
        '--use-mock-keychain'
      ]
    };
    
    if (proxy) {
      launchOptions.proxy = { server: `http://${proxy}` };
    }
    
    browser = await chromium.launch(launchOptions);
    
    const fingerprint = generateInsaneFPS();
    
    const context = await browser.newContext({
      viewport: fingerprint.viewport,
      screen: fingerprint.screen,
      userAgent: fingerprint.userAgent,
      locale: fingerprint.locale,
      timezoneId: fingerprint.timezone,
      geolocation: fingerprint.geolocation,
      permissions: ['notifications'],
      colorScheme: 'light',
      extraHTTPHeaders: {
        'Accept-Language': fingerprint.acceptLanguage,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Cache-Control': 'max-age=0'
      }
    });
    
    const page = await context.newPage();
    await injectFPS(page, fingerprint);
    
    log('Navigating...');
    await page.goto('https://discord.com/register', { 
      waitUntil: 'domcontentloaded',
      timeout: 20000 
    });
    
    await randomDelay(1000, 2000);
    
    const blocked = await page.$('text=Sorry, something went wrong') 
      || await page.$('text=You are being rate limited')
      || await page.$('text=Access denied');
      
    if (blocked) {
      log('Blocked - closing');
      await browser.close();
      return;
    }
    
    // Fast form fill
    await humanType(page, 'input[name="email"]', email);
    await randomDelay(300, 600);
    
    const username = `User${Math.floor(Math.random() * 10000000)}`;
    await humanType(page, 'input[name="username"]', username);
    await randomDelay(300, 600);
    
    const password = `Pass${Math.random().toString(36).slice(2, 10)}!`;
    await humanType(page, 'input[name="password"]', password);
    await randomDelay(300, 500);
    
    // FIXED DATE PICKER - Discord uses custom dropdowns now
    // Click Month dropdown
    await page.click('[aria-label="Month"]');
    await randomDelay(200, 400);
    // Select January from the dropdown list
    await page.click('text=January');
    await randomDelay(200, 400);
    
    // Click Day dropdown
    await page.click('[aria-label="Day"]');
    await randomDelay(200, 400);
    // Select 15
    await page.click('text=15');
    await randomDelay(200, 400);
    
    // Click Year dropdown
    await page.click('[aria-label="Year"]');
    await randomDelay(200, 400);
    // Select 1995
    await page.click('text=1995');
    await randomDelay(400, 800);
    
    await humanClick(page, 'button[type="submit"]');
    
    await randomDelay(3000, 5000);
    
    // Check results fast
    const captcha = await page.$('iframe[src*="hcaptcha"]');
    if (captcha) {
      log('Captcha - waiting 30s...');
      await randomDelay(30000, 35000);
    }
    
    const phoneRequired = await page.$('text=Verify your phone');
    if (phoneRequired) {
      log('Phone verify - abort');
      await browser.close();
      return;
    }
    
    await randomDelay(2000, 3000);
    
    const token = await page.evaluate(() => {
      return localStorage.getItem('token') || sessionStorage.getItem('token');
    });
    
    if (token && token.length > 50) {
      log('Token extracted!');
      parentPort.postMessage({ type: 'token', token, email });
    } else {
      log('No token extracted');
    }
    
    await browser.close();
    
  } catch (err) {
    log(`Error: ${err.message.slice(0, 100)}`);
    parentPort.postMessage({ type: 'error', error: err.message });
    if (browser) await browser.close().catch(() => {});
  }
}

(async function main() {
  log('Worker started');
  while (true) {
    await createAccount();
    // Shorter delays for faster cycling
    const delay = isDirectMode() ? 60000 : 25000 + Math.random() * 35000;
    log(`Wait ${Math.round(delay/1000)}s...`);
    await randomDelay(delay, delay);
  }
})();
