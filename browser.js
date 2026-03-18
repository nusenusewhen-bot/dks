const { workerData, parentPort } = require('worker_threads');
const { chromium } = require('playwright');
const { getWorkingProxy } = require('./proxies');
const { getTempEmail, checkInbox } = require('./email');
const { generateInsaneFPS, injectFPS } = require('./utils');

function log(msg) {
  parentPort.postMessage({ type: 'log', data: `[Worker ${workerData.workerId}] ${msg}` });
}

async function createAccount() {
  let browser;
  try {
    const proxy = await getWorkingProxy();
    if (!proxy) {
      log('No working proxy, waiting...');
      await new Promise(r => setTimeout(r, 30000));
      return;
    }
    
    const email = await getTempEmail();
    log(`Proxy: ${proxy} | Email: ${email}`);
    
    // Enhanced browser launch with stealth
    browser = await chromium.launch({
      headless: false,
      proxy: { server: `http://${proxy}` },
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-features=IsolateOrigins,site-per-process',
        '--disable-site-isolation-trials',
        '--disable-web-security',
        '--disable-features=BlockInsecurePrivateNetworkRequests',
        '--disable-features=InterestCohort',
        '--disable-features=FencedFrame',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-gpu',
        '--window-size=1366,768',
        '--start-maximized',
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
        '--enable-automation',
        '--password-store=basic',
        '--use-mock-keychain'
      ]
    });

    // Create context with insane FPS
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
      reducedMotion: 'no-preference',
      forcedColors: 'none',
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

    // Inject FPS before any navigation
    const page = await context.newPage();
    await injectFPS(page, fingerprint);
    
    // Set extra headers for every request
    await page.route('**/*', async (route, request) => {
      const headers = {
        ...request.headers(),
        'sec-ch-ua': fingerprint.secChUa,
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': `"${fingerprint.platform}"`
      };
      await route.continue({ headers });
    });

    // Navigate with human-like behavior
    log('Navigating to Discord...');
    await page.goto('https://discord.com', { 
      waitUntil: 'domcontentloaded',
      timeout: 30000 
    });
    
    // Random mouse movements
    await humanLikeMouseMove(page);
    
    await page.goto('https://discord.com/register', { 
      waitUntil: 'networkidle',
      timeout: 30000 
    });
    
    await randomDelay(2000, 4000);
    
    // Check for blocks
    const blocked = await page.$('text=Sorry, something went wrong') 
      || await page.$('text=You are being rate limited')
      || await page.$('text=Access denied');
      
    if (blocked) {
      log('Proxy/IP blocked by Discord');
      await browser.close();
      return;
    }
    
    // Fill form with human timing
    log('Filling registration form...');
    
    await humanType(page, 'input[name="email"]', email);
    await randomDelay(800, 1500);
    
    const username = generateUsername();
    await humanType(page, 'input[name="username"]', username);
    await randomDelay(600, 1200);
    
    const password = generatePassword();
    await humanType(page, 'input[name="password"]', password);
    await randomDelay(500, 1000);
    
    // Date of birth with realistic clicking
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
    
    // Submit
    await humanClick(page, 'button[type="submit"]');
    log('Form submitted, waiting for response...');
    
    await randomDelay(4000, 6000);
    
    // Handle captcha
    const captcha = await page.$('iframe[src*="hcaptcha"]') 
      || await page.$('iframe[src*="recaptcha"]');
      
    if (captcha) {
      log('Captcha detected - attempting bypass or waiting...');
      // Try to solve or wait for manual
      await handleCaptcha(page);
    }
    
    // Check for phone verification
    const phoneRequired = await page.$('text=Verify your phone number')
      || await page.$('input[type="tel"]');
      
    if (phoneRequired) {
      log('Phone verification required - aborting');
      await browser.close();
      return;
    }
    
    // Check for email verification page
    const verifyPage = await page.$('text=Verify your email')
      || await page.$('text=Check your email');
      
    if (verifyPage) {
      log('Email verification sent - waiting for confirmation...');
    }
    
    await randomDelay(3000, 5000);
    
    // Extract token
    const token = await page.evaluate(() => {
      // Try multiple sources
      return localStorage.getItem('token') 
        || sessionStorage.getItem('token')
        || document.cookie.match(/token=([^;]+)/)?.[1];
    });
    
    if (token && token.length > 50) {
      log('Token extracted successfully!');
      parentPort.postMessage({ type: 'token', token, email });
      
      // Background email check
      setTimeout(async () => {
        for (let i = 0; i < 10; i++) {
          const verifyLink = await checkInbox(email);
          if (verifyLink) {
            log(`Verification link: ${verifyLink}`);
            break;
          }
          await new Promise(r => setTimeout(r, 30000));
        }
      }, 0);
    } else {
      log('Failed to extract token - checking for issues...');
      const pageContent = await page.content();
      if (pageContent.includes('captcha') || pageContent.includes('CAPTCHA')) {
        log('Captcha blocked registration');
      } else if (pageContent.includes('rate limited')) {
        log('Rate limited');
      }
    }
    
    await browser.close();
    
  } catch (err) {
    log(`Error: ${err.message}`);
    parentPort.postMessage({ type: 'error', error: err.message });
    if (browser) await browser.close().catch(() => {});
  }
}

// Human-like typing
async function humanType(page, selector, text) {
  await page.click(selector);
  await randomDelay(100, 300);
  
  for (const char of text) {
    await page.keyboard.press(char);
    await randomDelay(50, 150);
  }
}

// Human-like click with random offset
async function humanClick(page, selector) {
  const element = await page.$(selector);
  if (!element) return;
  
  const box = await element.boundingBox();
  if (box) {
    const x = box.x + box.width / 2 + (Math.random() * 10 - 5);
    const y = box.y + box.height / 2 + (Math.random() * 10 - 5);
    await page.mouse.move(x, y, { steps: 10 });
    await randomDelay(100, 300);
    await page.mouse.click(x, y);
  } else {
    await element.click();
  }
}

// Random mouse movements
async function humanLikeMouseMove(page) {
  for (let i = 0; i < 5; i++) {
    const x = Math.random() * 1366;
    const y = Math.random() * 768;
    await page.mouse.move(x, y, { steps: 5 + Math.floor(Math.random() * 10) });
    await randomDelay(100, 400);
  }
}

// Handle captcha (basic implementation)
async function handleCaptcha(page) {
  // Wait for manual solve in non-headless
  log('Waiting 45s for captcha solve...');
  await randomDelay(45000, 50000);
  
  // Check if solved
  const stillThere = await page.$('iframe[src*="hcaptcha"]');
  if (!stillThere) {
    log('Captcha appears solved');
  }
}

function generateUsername() {
  const adjectives = ['Quick', 'Fast', 'Cool', 'Pro', 'Super', 'Mega', 'Ultra', 'Hyper'];
  const nouns = ['Gamer', 'Player', 'User', 'Dev', 'Coder', 'Ninja', 'Ghost', 'Shadow'];
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const num = Math.floor(Math.random() * 10000);
  return `${adj}${noun}${num}`;
}

function generatePassword() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  let pass = '';
  for (let i = 0; i < 16; i++) {
    pass += chars[Math.floor(Math.random() * chars.length)];
  }
  return pass;
}

function randomDelay(min, max) {
  return new Promise(r => setTimeout(r, min + Math.random() * (max - min)));
}

// Main loop
(async function main() {
  log('Worker started');
  while (true) {
    await createAccount();
    const delay = 45000 + Math.random() * 90000; // 45s to 2.5min between accounts
    log(`Waiting ${Math.round(delay/1000)}s...`);
    await randomDelay(delay, delay + 30000);
  }
})();
