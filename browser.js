const { workerData, parentPort } = require('worker_threads');
const { chromium } = require('playwright');
const { getWorkingProxy, isDirectMode } = require('./proxies');
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
  await randomDelay(100, 300);
  for (const char of text) {
    await page.keyboard.press(char);
    await randomDelay(30, 120);
  }
}

async function humanClick(page, selector) {
  const el = await page.$(selector);
  if (!el) return;
  const box = await el.boundingBox();
  if (box) {
    const x = box.x + box.width / 2 + (Math.random() * 10 - 5);
    const y = box.y + box.height / 2 + (Math.random() * 10 - 5);
    await page.mouse.move(x, y, { steps: 5 + Math.floor(Math.random() * 5) });
    await randomDelay(50, 200);
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
      log(`Using proxy: ${proxy} | Email: ${email}`);
    } else {
      log(`DIRECT CONNECTION | Email: ${email}`);
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
    
    await page.route('**/*', async (route, request) => {
      const headers = {
        ...request.headers(),
        'sec-ch-ua': fingerprint.secChUa,
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': `"${fingerprint.platformInfo}"`
      };
      await route.continue({ headers });
    });
    
    log('Navigating to Discord...');
    await page.goto('https://discord.com', { 
      waitUntil: 'domcontentloaded',
      timeout: 30000 
    });
    
    for (let i = 0; i < 3; i++) {
      const x = Math.random() * 1366;
      const y = Math.random() * 768;
      await page.mouse.move(x, y, { steps: 5 });
      await randomDelay(200, 500);
    }
    
    await page.goto('https://discord.com/register', { 
      waitUntil: 'networkidle',
      timeout: 30000 
    });
    
    await randomDelay(2000, 4000);
    
    const blocked = await page.$('text=Sorry, something went wrong') 
      || await page.$('text=You are being rate limited')
      || await page.$('text=Access denied')
      || await page.$('text=The web server reported a bad gateway');
      
    if (blocked) {
      log('IP/Proxy blocked by Discord - closing');
      await browser.close();
      return;
    }
    
    log('Filling registration form...');
    
    await humanType(page, 'input[name="email"]', email);
    await randomDelay(800, 1500);
    
    const username = `User${Math.floor(Math.random() * 10000000)}`;
    await humanType(page, 'input[name="username"]', username);
    await randomDelay(600, 1200);
    
    const password = `Pass${Math.random().toString(36).slice(2, 10)}!`;
    await humanType(page, 'input[name="password"]', password);
    await randomDelay(500, 1000);
    
    await humanClick(page, '[aria-label="Month"]');
    await randomDelay(200, 400);
    await humanClick(page, '[data-value="1"]');
    await randomDelay(300, 600);
    
    await humanClick(page, '[aria-label="Day"]');
    await randomDelay(200, 400);
    await humanClick(page, '[data-value="15"]');
    await randomDelay(300, 600);
    
    await humanClick(page, '[aria-label="Year"]');
    await randomDelay(200, 400);
    await humanClick(page, '[data-value="1995"]');
    await randomDelay(800, 1500);
    
    log('Submitting form...');
    await humanClick(page, 'button[type="submit"]');
    
    await randomDelay(4000, 6000);
    
    const captcha = await page.$('iframe[src*="hcaptcha"]') 
      || await page.$('iframe[src*="recaptcha"]')
      || await page.$('.h-captcha')
      || await page.$('[data-sitekey]');
      
    if (captcha) {
      log('Captcha detected - waiting 45s for solve...');
      await randomDelay(45000, 50000);
    }
    
    const phoneRequired = await page.$('text=Verify your phone number')
      || await page.$('input[type="tel"]')
      || await page.$('text=Phone number');
      
    if (phoneRequired) {
      log('Phone verification required - aborting');
      await browser.close();
      return;
    }
    
    const verifyPage = await page.$('text=Verify your email')
      || await page.$('text=Check your email');
      
    if (verifyPage) {
      log('Email verification sent');
    }
    
    await randomDelay(3000, 5000);
    
    const token = await page.evaluate(() => {
      return localStorage.getItem('token') 
        || sessionStorage.getItem('token')
        || document.cookie.match(/token=([^;]+)/)?.[1];
    });
    
    if (token && token.length > 50) {
      log('Token extracted successfully!');
      parentPort.postMessage({ type: 'token', token, email });
      
      setTimeout(async () => {
        for (let i = 0; i < 5; i++) {
          const verifyLink = await checkInbox(email);
          if (verifyLink) {
            log(`Verification link: ${verifyLink}`);
            break;
          }
          await new Promise(r => setTimeout(r, 30000));
        }
      }, 0);
    } else {
      log('Failed to extract token');
      const content = await page.content();
      if (content.includes('captcha')) log('Blocked by captcha');
      if (content.includes('rate limit')) log('Rate limited');
    }
    
    await browser.close();
    
  } catch (err) {
    log(`Error: ${err.message}`);
    parentPort.postMessage({ type: 'error', error: err.message });
    if (browser) await browser.close().catch(() => {});
  }
}

(async function main() {
  log('Worker started');
  while (true) {
    await createAccount();
    const delay = isDirectMode() ? 120000 + Math.random() * 60000 : 45000 + Math.random() * 90000;
    log(`Waiting ${Math.round(delay/1000)}s...`);
    await randomDelay(delay, delay);
  }
})();
