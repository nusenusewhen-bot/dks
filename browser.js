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
  if (!el) return;
  
  // Focus with click
  await el.click();
  await randomDelay(150, 350);
  
  // Clear existing
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Delete');
  await randomDelay(100, 200);
  
  // Type with human variation
  for (let i = 0; i < text.length; i++) {
    // Occasional typo and correction
    if (Math.random() > 0.98 && i > 0) {
      await page.keyboard.press('Backspace');
      await randomDelay(100, 200);
    }
    
    await page.keyboard.press(text[i]);
    
    // Variable delay: fast typing with occasional pauses
    const baseDelay = 30 + Math.random() * 70;
    const pause = Math.random() > 0.95 ? 200 + Math.random() * 300 : 0;
    await new Promise(r => setTimeout(r, baseDelay + pause));
  }
}

async function humanClick(page, selector) {
  const el = await page.$(selector);
  if (!el) return false;
  
  const box = await el.boundingBox();
  if (!box) return false;
  
  // Random point in element
  const x = box.x + 5 + Math.random() * (box.width - 10);
  const y = box.y + 5 + Math.random() * (box.height - 10);
  
  // Move with curve
  await page.mouse.move(x, y, { steps: 10 + Math.floor(Math.random() * 10) });
  await randomDelay(100, 300);
  
  // Click with variation
  await page.mouse.down();
  await randomDelay(50, 150);
  await page.mouse.up();
  
  return true;
}

async function extractToken(page) {
  await randomDelay(2000, 4000);
  
  return await page.evaluate(() => {
    try {
      // Check all possible token locations
      const sources = [
        () => window.localStorage?.getItem('token'),
        () => window.sessionStorage?.getItem('token'),
        () => {
          const match = document.cookie.match(/token=([^;]+)/);
          return match ? match[1] : null;
        },
        () => {
          // Webpack module extraction
          const w = window.webpackChunkdiscord_app;
          if (w) {
            for (const id in w) {
              try {
                const m = w[id];
                if (m?.exports?.default?.getToken) {
                  return m.exports.default.getToken();
                }
              } catch(e) {}
            }
          }
          return null;
        },
        () => window.DiscordNative?.user?.token,
        () => window.__INITIAL_STATE__?.token
      ];
      
      for (const fn of sources) {
        try {
          const t = fn();
          if (t && t.length > 50) return t;
        } catch(e) {}
      }
      return null;
    } catch(e) {
      return null;
    }
  });
}

async function solveCaptchaChallenge(page) {
  log('Attempting captcha solve...');
  
  try {
    // Wait for challenge iframe
    const challengeFrame = await page.waitForSelector('iframe[src*="challenge"]', { timeout: 10000 }).catch(() => null);
    if (!challengeFrame) {
      // Maybe checkbox only
      return true;
    }
    
    const frame = await challengeFrame.contentFrame();
    if (!frame) return false;
    
    // Get challenge text
    const prompt = await frame.evaluate(() => {
      return document.querySelector('.prompt-text')?.textContent || '';
    });
    
    log(`Challenge: ${prompt}`);
    
    // Simple image click strategy - click images that might match
    // This is basic - real solver needs ML
    const images = await frame.$$('.task-image');
    log(`Found ${images.length} images`);
    
    // Random selection strategy (not real solution)
    // In production, analyze images with CNN
    const toClick = [];
    for (let i = 0; i < images.length; i++) {
      // Simulate analysis delay
      await randomDelay(800, 1500);
      
      // Random "detection" - replace with actual ML
      if (Math.random() > 0.5) {
        toClick.push(i);
        await images[i].click();
        await randomDelay(300, 600);
      }
    }
    
    log(`Selected ${toClick.length} images`);
    
    // Click verify
    await randomDelay(1000, 2000);
    const verifyBtn = await frame.$('.button-submit');
    if (verifyBtn) await verifyBtn.click();
    
    // Wait for result
    await randomDelay(5000, 8000);
    
    // Check if still there
    const stillThere = await page.$('iframe[src*="challenge"]').catch(() => null);
    return !stillThere;
    
  } catch (e) {
    log(`Captcha error: ${e.message}`);
    return false;
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
        '--disable-features=IsolateOrigins,site-per-process,InterestCohort',
        '--disable-web-security',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-gpu',
        '--window-size=1920,1080',
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
        '--password-store=basic',
        '--use-mock-keychain',
        '--disable-features=AudioServiceOutOfProcess'
      ]
    };
    
    if (proxy) {
      launchOptions.proxy = { server: `http://${proxy}` };
    }
    
    browser = await chromium.launch(launchOptions);
    
    const fingerprint = generateInsaneFPS();
    
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      screen: { width: 1920, height: 1080 },
      userAgent: fingerprint.userAgent,
      locale: fingerprint.locale,
      timezoneId: fingerprint.timezone,
      geolocation: fingerprint.geolocation,
      permissions: ['notifications'],
      colorScheme: 'light'
    });
    
    const page = await context.newPage();
    
    // Inject stealth scripts
    await injectFPS(page, fingerprint);
    
    // Additional evasions
    await page.addInitScript(() => {
      // Override notification permission
      const originalNotification = window.Notification;
      Object.defineProperty(window, 'Notification', {
        get: () => originalNotification,
        set: () => {}
      });
      Object.defineProperty(Notification, 'permission', {
        get: () => 'default'
      });
      
      // Hide webdriver
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined
      });
      
      // Override plugins length
      Object.defineProperty(navigator, 'plugins', {
        get: () => {
          const plugins = [
            { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer' },
            { name: 'Native Client', filename: 'internal-nacl-plugin' },
            { name: 'Widevine Content Decryption Module', filename: 'widevinecdmadapter.dll' }
          ];
          plugins.length = 3;
          plugins.item = (i) => plugins[i];
          plugins.namedItem = (name) => plugins.find(p => p.name === name);
          return plugins;
        }
      });
    });
    
    // Initial human behavior
    await randomDelay(3000, 5000);
    
    log('Navigating...');
    
    // Visit main page first (more natural)
    await page.goto('https://discord.com/', { 
      waitUntil: 'domcontentloaded',
      timeout: 30000 
    });
    
    // Random mouse movement
    for (let i = 0; i < 8; i++) {
      await page.mouse.move(
        300 + Math.random() * 800,
        200 + Math.random() * 500,
        { steps: 5 }
      );
      await randomDelay(200, 600);
    }
    
    // Click "Open Discord in browser" or go directly to register
    const openBtn = await page.$('text=Open Discord in your browser');
    if (openBtn) {
      await humanClick(page, 'text=Open Discord in your browser');
      await randomDelay(3000, 5000);
    }
    
    // Navigate to register
    await page.goto('https://discord.com/register', {
      waitUntil: 'networkidle',
      timeout: 30000
    });
    
    await randomDelay(3000, 5000);
    
    // Check for instant blocks
    const pageText = await page.evaluate(() => document.body.innerText);
    
    if (pageText.includes('rate limited') || pageText.includes('Access denied')) {
      log('IP blocked - closing');
      await browser.close();
      return;
    }
    
    // Check for captcha immediately
    const instantCaptcha = await page.$('iframe[src*="hcaptcha"]');
    if (instantCaptcha) {
      log('Instant captcha - high bot score');
      // Try to solve or abort
      const solved = await solveCaptchaChallenge(page);
      if (!solved) {
        log('Could not solve instant captcha');
        await browser.close();
        return;
      }
    }
    
    log('Filling form...');
    
    // Fill with natural timing
    await humanType(page, 'input[name="email"]', email);
    await randomDelay(1000, 2000);
    
    const username = `user_${Math.floor(Math.random() * 100000000)}`;
    await humanType(page, 'input[name="username"]', username);
    await randomDelay(1000, 2000);
    
    const password = `Pass${Math.random().toString(36).slice(2, 12)}!@#`;
    await humanType(page, 'input[name="password"]', password);
    await randomDelay(1000, 2000);
    
    // DOB with verification
    log('Setting DOB...');
    
    // Month
    await humanClick(page, '[aria-label="Month"]');
    await randomDelay(500, 1000);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await randomDelay(500, 800);
    
    // Day
    await humanClick(page, '[aria-label="Day"]');
    await randomDelay(500, 1000);
    for (let i = 0; i < 15; i++) {
      await page.keyboard.press('ArrowDown');
      await randomDelay(50, 100);
    }
    await page.keyboard.press('Enter');
    await randomDelay(500, 800);
    
    // Year
    await humanClick(page, '[aria-label="Year"]');
    await randomDelay(500, 1000);
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press('ArrowDown');
      await randomDelay(30, 80);
    }
    await page.keyboard.press('Enter');
    await randomDelay(1000, 1500);
    
    // Verify DOB
    const dob = await page.evaluate(() => {
      const m = document.querySelector('[aria-label="Month"]')?.textContent?.trim();
      const d = document.querySelector('[aria-label="Day"]')?.textContent?.trim();
      const y = document.querySelector('[aria-label="Year"]')?.textContent?.trim();
      return { m, d, y };
    });
    
    log(`DOB: ${dob.m} / ${dob.d} / ${dob.y}`);
    
    // Terms checkbox
    const terms = await page.$('input[type="checkbox"]');
    if (terms) {
      await humanClick(page, 'input[type="checkbox"]');
      await randomDelay(500, 1000);
    }
    
    // Submit
    log('Submitting...');
    await randomDelay(2000, 4000);
    await humanClick(page, 'button[type="submit"]');
    await randomDelay(1000, 2000);
    
    // Wait for processing
    await randomDelay(8000, 12000);
    
    // Handle post-submit captcha
    const postCaptcha = await page.$('iframe[src*="hcaptcha"]');
    if (postCaptcha) {
      log('Post-submit captcha detected');
      const solved = await solveCaptchaChallenge(page);
      if (!solved) {
        log('Captcha solve failed');
      }
      await randomDelay(5000, 8000);
    }
    
    // Check for phone verification
    const phoneCheck = await page.$('text=Verify your phone') 
      || await page.$('input[type="tel"]');
    
    if (phoneCheck) {
      log('Phone verification required');
      await browser.close();
      return;
    }
    
    // Check for success (redirect to app or channels)
    const url = page.url();
    log(`Final URL: ${url}`);
    
    if (!url.includes('/register')) {
      log('Possible success - redirected');
    }
    
    // Extract token
    const token = await extractToken(page);
    
    if (token && token.length > 50) {
      log('Token extracted!');
      parentPort.postMessage({ type: 'token', token, email });
      
      // Background email check
      setTimeout(async () => {
        for (let i = 0; i < 5; i++) {
          const link = await checkInbox(email);
          if (link) {
            log(`Verify: ${link}`);
            break;
          }
          await new Promise(r => setTimeout(r, 30000));
        }
      }, 0);
    } else {
      log('No token found');
      
      // Debug info
      const debug = await page.evaluate(() => ({
        url: location.href,
        hasLS: !!window.localStorage,
        hasSS: !!window.sessionStorage,
        body: document.body.innerText.slice(0, 300)
      }));
      log(`Debug: ${JSON.stringify(debug)}`);
    }
    
    await browser.close();
    
  } catch (err) {
    log(`Error: ${err.message.slice(0, 150)}`);
    parentPort.postMessage({ type: 'error', error: err.message });
    if (browser) await browser.close().catch(() => {});
  }
}

// Main loop - no top-level await
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
