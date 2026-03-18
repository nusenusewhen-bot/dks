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

// Extract token with multiple methods
async function extractToken(page) {
  // Method 1: Try localStorage with existence check
  const token1 = await page.evaluate(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage.getItem('token') || null;
      }
      return null;
    } catch (e) {
      return null;
    }
  });
  
  if (token1 && token1.length > 50) return token1;
  
  // Method 2: Try sessionStorage
  const token2 = await page.evaluate(() => {
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        return window.sessionStorage.getItem('token') || null;
      }
      return null;
    } catch (e) {
      return null;
    }
  });
  
  if (token2 && token2.length > 50) return token2;
  
  // Method 3: Check cookies
  const cookies = await page.context().cookies();
  const tokenCookie = cookies.find(c => c.name === 'token' || c.name.includes('auth'));
  if (tokenCookie && tokenCookie.value.length > 50) return tokenCookie.value;
  
  // Method 4: Try to get from window object or webpack
  const token3 = await page.evaluate(() => {
    try {
      // Look for token in various global locations
      if (window.__INITIAL_STATE__?.token) return window.__INITIAL_STATE__.token;
      if (window.GLOBAL_ENV?.token) return window.GLOBAL_ENV.token;
      if (window.DiscordNative?.token) return window.DiscordNative.token;
      
      // Try to find in any global var
      for (let key in window) {
        try {
          if (typeof window[key] === 'string' && window[key].length > 50 && window[key].includes('.')) {
            return window[key];
          }
        } catch (e) {}
      }
      return null;
    } catch (e) {
      return null;
    }
  });
  
  if (token3 && token3.length > 50) return token3;
  
  return null;
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
      waitUntil: 'networkidle',
      timeout: 25000 
    });
    
    await randomDelay(1500, 2500);
    
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
    
    // FIXED DATE PICKER - Discord uses custom dropdowns
    await page.click('[aria-label="Month"]');
    await randomDelay(200, 400);
    await page.click('text=January');
    await randomDelay(200, 400);
    
    await page.click('[aria-label="Day"]');
    await randomDelay(200, 400);
    await page.click('text=15');
    await randomDelay(200, 400);
    
    await page.click('[aria-label="Year"]');
    await randomDelay(200, 400);
    await page.click('text=1995');
    await randomDelay(400, 800);
    
    await humanClick(page, 'button[type="submit"]');
    
    await randomDelay(4000, 6000);
    
    // Check for captcha
    const captcha = await page.$('iframe[src*="hcaptcha"]');
    if (captcha) {
      log('Captcha detected - waiting...');
      await randomDelay(30000, 35000);
    }
    
    // Check for phone verification
    const phoneRequired = await page.$('text=Verify your phone') 
      || await page.$('input[type="tel"]');
    if (phoneRequired) {
      log('Phone verify required - aborting');
      await browser.close();
      return;
    }
    
    // Wait for navigation or token
    await randomDelay(3000, 5000);
    
    // Try to extract token multiple times
    let token = null;
    for (let i = 0; i < 3; i++) {
      token = await extractToken(page);
      if (token) break;
      await randomDelay(2000, 3000);
    }
    
    if (token && token.length > 50) {
      log('Token extracted successfully!');
      parentPort.postMessage({ type: 'token', token, email });
      
      // Background email check
      setTimeout(async () => {
        for (let i = 0; i < 5; i++) {
          const verifyLink = await checkInbox(email);
          if (verifyLink) {
            log(`Verification: ${verifyLink}`);
            break;
          }
          await new Promise(r => setTimeout(r, 30000));
        }
      }, 0);
    } else {
      log('No token found');
      // Debug - check what page we're on
      const url = page.url();
      log(`Current URL: ${url}`);
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
    const delay = isDirectMode() ? 60000 : 25000 + Math.random() * 35000;
    log(`Wait ${Math.round(delay/1000)}s...`);
    await randomDelay(delay, delay);
  }
})();
