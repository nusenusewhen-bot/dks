const { workerData, parentPort } = require('worker_threads');
const { chromium } = require('playwright');
const { getWorkingProxy, isDirectMode, getProxyCount } = require('./proxies');
const { getTempEmail } = require('./email');
const { generateInsaneFPS, injectFPS } = require('./utils');
const { SessionBehavior, CaptchaSolver } = require('./captcha-solver');

function log(msg) {
  parentPort.postMessage({ type: 'log', data: `[W${workerData.workerId}] ${msg}` });
}

async function delay(min, max) {
  return new Promise(r => setTimeout(r, min + Math.random() * (max - min)));
}

async function createAccount() {
  let browser;
  try {
    const proxy = await getWorkingProxy();
    const email = await getTempEmail();
    
    log(proxy ? `Proxy: ${proxy} | Pool: ${getProxyCount()} | Email: ${email}` : `DIRECT | Email: ${email}`);
    
    browser = await chromium.launch({
      headless: false,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-features=IsolateOrigins,site-per-process',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--window-size=1366,768',
        '--lang=en-US,en'
      ],
      proxy: proxy ? { server: `http://${proxy}` } : undefined
    });

    const fingerprint = generateInsaneFPS();
    
    const context = await browser.newContext({
      viewport: { width: 1366, height: 768 },
      locale: 'en-US',
      timezoneId: 'America/New_York',
      userAgent: fingerprint.userAgent,
      geolocation: fingerprint.geolocation,
      colorScheme: 'light'
    });

    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      Object.defineProperty(navigator, 'plugins', { 
        get: () => [
          { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
          { name: 'Native Client', filename: 'native-client.dll', description: 'Native Client module' }
        ] 
      });
      Object.defineProperty(navigator, 'mimeTypes', {
        get: () => [
          { type: 'application/pdf', suffixes: 'pdf', description: 'Portable Document Format' },
          { type: 'application/x-google-chrome-pdf', suffixes: 'pdf', description: 'Portable Document Format' }
        ]
      });
      Object.defineProperty(navigator, 'language', { get: () => 'en-US' });
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
      Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });
      Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 4 });
      
      const canvasProto = CanvasRenderingContext2D.prototype;
      const origGetImageData = canvasProto.getImageData;
      canvasProto.getImageData = function(...args) {
        const data = origGetImageData.apply(this, args);
        for (let i = 0; i < data.data.length; i += 4) {
          data.data[i] = Math.min(255, data.data[i] + (Math.random() > 0.5 ? 1 : 0));
        }
        return data;
      };
    });

    const page = await context.newPage();
    
    log('Warming up session...');
    await page.goto('https://google.com', { waitUntil: 'networkidle', timeout: 30000 });
    await delay(2000, 4000);
    
    await page.goto('https://discord.com', { waitUntil: 'networkidle', timeout: 30000 });
    await delay(1500, 2500);
    
    const registerBtn = await page.$('a[href="/register"]');
    if (!registerBtn) {
      log('Register button not found');
      await browser.close();
      return;
    }

    const session = new SessionBehavior(page, workerData.workerId);
    await session.mouse.click(registerBtn);
    await page.waitForLoadState('networkidle');
    
    log('Simulating natural behavior...');
    await session.naturalWarmup();
    
    log('Filling registration form...');
    const username = `user_${Math.floor(Math.random() * 100000000)}`;
    const password = `Pass${Math.random().toString(36).slice(2, 12)}!`;
    
    await session.typeLikeHuman('input[name="email"]', email);
    await delay(800, 1500);
    
    await session.typeLikeHuman('input[name="username"]', username);
    await delay(600, 1200);
    
    await session.typeLikeHuman('input[name="password"]', password);
    await delay(1000, 2000);
    
    log('Setting date of birth...');
    await page.click('[aria-label="Month"]');
    await delay(300, 500);
    await page.click('text=January');
    await session.randomIdle(300, 600);
    
    await page.click('[aria-label="Day"]');
    await delay(200, 400);
    await page.click('text=15');
    await session.randomIdle(400, 800);
    
    await page.click('[aria-label="Year"]');
    await delay(400, 600);
    await page.click('text=1995');
    
    await session.randomIdle(1000, 2000);
    const terms = await page.$('input[type="checkbox"]');
    if (terms) await terms.click();
    
    await session.randomIdle(1500, 3000);
    log('Submitting registration...');
    await session.mouse.click(await page.$('button[type="submit"]'));
    
    await delay(4000, 6000);
    
    let captchaAttempts = 0;
    const maxCaptchaAttempts = 3;
    
    while (captchaAttempts < maxCaptchaAttempts) {
      const captchaFrame = await page.$('iframe[src*="hcaptcha"]');
      if (!captchaFrame) break;
      
      log(`Captcha detected (attempt ${captchaAttempts + 1}/${maxCaptchaAttempts})`);
      const frame = await captchaFrame.contentFrame();
      const solver = new CaptchaSolver(page, session);
      const solved = await solver.solve(frame);
      
      if (solved) {
        log('Captcha solved successfully');
        break;
      } else {
        log('Captcha attempt failed');
        captchaAttempts++;
        await delay(3000, 5000);
      }
    }
    
    await delay(3000, 5000);
    
    const phone = await page.$('text=Verify your phone') || await page.$('input[type="tel"]');
    if (phone) {
      log('Phone verification required - aborting');
      await browser.close();
      return;
    }
    
    const token = await page.evaluate(() => {
      try {
        return localStorage.getItem('token') || 
               sessionStorage.getItem('token') || 
               document.cookie.match(/token=([^;]+)/)?.[1];
      } catch (e) { 
        return null; 
      }
    });
    
    if (token && token.length > 50) {
      log('Token successfully extracted!');
      parentPort.postMessage({ type: 'token', token, email, username });
    } else {
      log('Failed to extract token');
    }
    
    await browser.close();
    
  } catch (err) {
    log(`Error: ${err.message.slice(0, 200)}`);
    parentPort.postMessage({ type: 'error', error: err.message });
    if (browser) await browser.close().catch(() => {});
  }
}

function main() {
  log('Worker initialized');
  
  async function loop() {
    while (true) {
      try {
        await createAccount();
        const waitTime = isDirectMode() ? 120000 : 45000 + Math.random() * 45000;
        log(`Waiting ${Math.round(waitTime/1000)}s before next attempt...`);
        await delay(waitTime, waitTime);
      } catch (err) {
        log(`Loop error: ${err.message}`);
        await delay(60000, 90000);
      }
    }
  }
  
  setTimeout(loop, 1000 + Math.random() * 2000);
}

main();
