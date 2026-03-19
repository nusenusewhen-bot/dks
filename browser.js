const { workerData, parentPort } = require('worker_threads');
const { chromium } = require('playwright');
const { getWorkingProxy, isDirectMode, getProxyCount } = require('./proxies');
const { getTempEmail, checkInbox } = require('./email');
const { generateInsaneFPS, injectFPS } = require('./utils');
const { HardwareMouse, SessionBehavior, VisualCaptchaSolver } = require('./captcha-solver');

function log(msg) {
  parentPort.postMessage({ type: 'log', data: `[W${workerData.workerId}] ${msg}` });
}

async function randomDelay(min, max) {
  return new Promise(r => setTimeout(r, min + Math.random() * (max - min)));
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
        '--lang=en-US,en',
        '--timezone=America/New_York'
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
      locale: 'en-US',
      timezoneId: 'America/New_York',
      geolocation: fingerprint.geolocation,
      permissions: ['notifications'],
      colorScheme: 'light',
      deviceScaleFactor: 1,
      hasTouch: false
    });
    
    // Stealth injection
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      Object.defineProperty(navigator, 'plugins', { 
        get: () => [
          { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer' },
          { name: 'Native Client', filename: 'native-client.dll' }
        ] 
      });
      Object.defineProperty(navigator, 'permissions', {
        get: () => ({ query: async () => ({ state: 'prompt' }) })
      });
      
      const originalGetImageData = CanvasRenderingContext2D.prototype.getImageData;
      CanvasRenderingContext2D.prototype.getImageData = function(...args) {
        const imageData = originalGetImageData.apply(this, args);
        for (let i = 0; i < imageData.data.length; i += 4) {
          imageData.data[i] += Math.floor(Math.random() * 2);
        }
        return imageData;
      };
      
      Object.defineProperty(navigator, 'language', { get: () => 'en-US' });
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
    });
    
    const page = await context.newPage();
    
    // Warm up with fake referrer
    log('Warming up session...');
    await page.goto('https://google.com', { waitUntil: 'networkidle', timeout: 30000 });
    await randomDelay(2000, 4000);
    
    // Navigate to Discord organically
    await page.goto('https://discord.com', { waitUntil: 'networkidle', timeout: 30000 });
    await randomDelay(1500, 2500);
    
    // Click register
    const registerBtn = await page.$('a[href="/register"]');
    if (!registerBtn) {
      log('Register button not found');
      await browser.close();
      return;
    }
    
    // Initialize session behavior
    const session = new SessionBehavior(page);
    await session.mouse.click(registerBtn);
    await page.waitForLoadState('networkidle');
    
    // Natural session behavior
    log('Simulating natural behavior...');
    await session.naturalSession();
    
    // Fill form
    log('Filling form...');
    const username = `user_${Math.floor(Math.random() * 100000000)}`;
    const password = `Pass${Math.random().toString(36).slice(2, 12)}!`;
    
    await session.typeLikeHuman('input[name="email"]', email);
    await session.randomIdle(800, 1500);
    
    await session.typeLikeHuman('input[name="username"]', username);
    await session.randomIdle(600, 1200);
    
    await session.typeLikeHuman('input[name="password"]', password);
    await session.randomIdle(1000, 2000);
    
    // Set DOB
    log('Setting DOB...');
    await page.click('[aria-label="Month"]');
    await randomDelay(300, 500);
    await page.click('text=January');
    await session.randomIdle(300, 600);
    
    await page.click('[aria-label="Day"]');
    await randomDelay(200, 400);
    await page.click('text=15');
    await session.randomIdle(400, 800);
    
    await page.click('[aria-label="Year"]');
    await randomDelay(400, 600);
    await page.click('text=1995');
    
    // Check terms
    await session.randomIdle(1000, 2000);
    const terms = await page.$('input[type="checkbox"]');
    if (terms) await terms.click();
    
    // Submit
    await session.randomIdle(1500, 3000);
    log('Submitting...');
    await session.mouse.click(await page.$('button[type="submit"]'));
    
    // Wait for captcha or redirect
    await randomDelay(4000, 6000);
    
    // Check for captcha
    const captchaFrame = await page.$('iframe[src*="hcaptcha"]');
    if (captchaFrame) {
      log('Captcha detected, solving...');
      const frame = await captchaFrame.contentFrame();
      const solver = new VisualCaptchaSolver(page, session);
      const solved = await solver.solve(frame);
      
      if (solved) {
        log('Captcha passed');
      } else {
        log('Captcha failed');
      }
      
      await randomDelay(5000, 8000);
    }
    
    // Check for phone verification
    const phone = await page.$('text=Verify your phone') || await page.$('input[type="tel"]');
    if (phone) {
      log('Phone required, aborting');
      await browser.close();
      return;
    }
    
    // Extract token
    const token = await page.evaluate(() => {
      try {
        return localStorage.getItem('token') || 
               sessionStorage.getItem('token') || 
               document.cookie.match(/token=([^;]+)/)?.[1];
      } catch (e) { return null; }
    });
    
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
