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
  await randomDelay(100, 250);
  
  // Clear existing text first
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Delete');
  await randomDelay(50, 150);
  
  // Type with variable speed
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    await page.keyboard.press(char);
    
    // Variable delay: 30-150ms, occasionally longer "thinking" pauses
    const delay = Math.random() > 0.9 ? 200 + Math.random() * 300 : 30 + Math.random() * 80;
    await new Promise(r => setTimeout(r, delay));
  }
}

async function humanClick(page, selector) {
  const el = await page.$(selector);
  if (!el) {
    log(`Click element not found: ${selector}`);
    return false;
  }
  
  const box = await el.boundingBox();
  if (!box) {
    log(`Element not visible: ${selector}`);
    return false;
  }
  
  // Random point within element
  const x = box.x + 10 + Math.random() * (box.width - 20);
  const y = box.y + 10 + Math.random() * (box.height - 20);
  
  // Move with curve
  await page.mouse.move(x, y, { steps: 8 + Math.floor(Math.random() * 8) });
  await randomDelay(80, 200);
  await page.mouse.down();
  await randomDelay(20, 80);
  await page.mouse.up();
  
  return true;
}

// Extract token with multiple methods
async function extractToken(page) {
  // Wait for page to stabilize
  await randomDelay(1000, 2000);
  
  const token = await page.evaluate(() => {
    try {
      // Check multiple sources
      const sources = [
        () => window.localStorage ? window.localStorage.getItem('token') : null,
        () => window.sessionStorage ? window.sessionStorage.getItem('token') : null,
        () => {
          // Look for token in webpack modules
          const modules = window.webpackChunkdiscord_app;
          if (modules) {
            for (let id in modules) {
              try {
                const mod = modules[id];
                if (mod && mod.exports && mod.exports.default && mod.exports.default.getToken) {
                  return mod.exports.default.getToken();
                }
              } catch (e) {}
            }
          }
          return null;
        },
        () => {
          // Check for user object
          if (window.DiscordNative && window.DiscordNative.user) {
            return window.DiscordNative.user.token;
          }
          return null;
        }
      ];
      
      for (const fn of sources) {
        try {
          const result = fn();
          if (result && typeof result === 'string' && result.length > 50) {
            return result;
          }
        } catch (e) {}
      }
      
      return null;
    } catch (e) {
      return null;
    }
  });
  
  if (token) return token;
  
  // Check cookies as fallback
  try {
    const cookies = await page.evaluate(() => document.cookie);
    const tokenMatch = cookies.match(/token=([^;]+)/);
    if (tokenMatch) return tokenMatch[1];
  } catch (e) {}
  
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
        '--disable-features=AudioServiceOutOfProcess',
        '--disable-features=IsolateOrigins',
        '--disable-features=site-per-process'
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
      colorScheme: 'light',
      extraHTTPHeaders: {
        'Accept-Language': fingerprint.acceptLanguage,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
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
    
    // Inject anti-detection
    await injectFPS(page, fingerprint);
    
    // Additional evasion
    await page.addInitScript(() => {
      // Override permissions
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters) => (
        parameters.name === 'notifications' 
          ? Promise.resolve({ state: Notification.permission, onchange: null })
          : originalQuery(parameters)
      );
    });
    
    // Navigate with retry
    log('Loading Discord...');
    let retries = 3;
    while (retries > 0) {
      try {
        await page.goto('https://discord.com/', { 
          waitUntil: 'domcontentloaded',
          timeout: 20000 
        });
        break;
      } catch (e) {
        retries--;
        if (retries === 0) throw e;
        await randomDelay(2000, 4000);
      }
    }
    
    // Human-like behavior
    await randomDelay(1500, 3000);
    
    // Move mouse randomly
    for (let i = 0; i < 5; i++) {
      await page.mouse.move(
        200 + Math.random() * 800,
        200 + Math.random() * 600,
        { steps: 5 }
      );
      await randomDelay(200, 500);
    }
    
    // Click register button or navigate directly
    const registerBtn = await page.$('text=Sign Up') || await page.$('text=Register');
    if (registerBtn) {
      await humanClick(page, 'text=Sign Up');
      await randomDelay(2000, 4000);
    } else {
      await page.goto('https://discord.com/register', {
        waitUntil: 'networkidle',
        timeout: 25000
      });
    }
    
    await randomDelay(2000, 4000);
    
    // Check for blocks
    const blocked = await page.$('text=Sorry, something went wrong') 
      || await page.$('text=You are being rate limited')
      || await page.$('text=Access denied')
      || await page.$('text=Verify you are human');
      
    if (blocked) {
      const text = await blocked.textContent();
      log(`Blocked: ${text}`);
      await browser.close();
      return;
    }
    
    // Check if captcha appears immediately
    const captchaImmediate = await page.$('iframe[src*="hcaptcha"]') 
      || await page.$('iframe[src*="recaptcha"]')
      || await page.$('[data-sitekey]');
    
    if (captchaImmediate) {
      log('Immediate captcha - bot detected');
      // Try to solve or wait
      await randomDelay(35000, 45000);
    }
    
    log('Filling form...');
    
    // Fill email
    await humanType(page, 'input[name="email"]', email);
    await randomDelay(400, 800);
    
    // Fill username
    const username = `User${Math.floor(Math.random() * 100000000)}`;
    await humanType(page, 'input[name="username"]', username);
    await randomDelay(400, 800);
    
    // Fill password
    const password = `Pass${Math.random().toString(36).slice(2, 12)}!@`;
    await humanType(page, 'input[name="password"]', password);
    await randomDelay(400, 800);
    
    // Date of birth - Discord uses custom dropdowns
    log('Setting DOB...');
    
    // Month
    await humanClick(page, '[aria-label="Month"]');
    await randomDelay(300, 600);
    await humanClick(page, 'text=January');
    await randomDelay(300, 600);
    
    // Day
    await humanClick(page, '[aria-label="Day"]');
    await randomDelay(300, 600);
    await humanClick(page, 'text=15');
    await randomDelay(300, 600);
    
    // Year
    await humanClick(page, '[aria-label="Year"]');
    await randomDelay(300, 600);
    await humanClick(page, 'text=1995');
    await randomDelay(600, 1200);
    
    // Verify values are set
    const dobSet = await page.evaluate(() => {
      const month = document.querySelector('[aria-label="Month"]')?.textContent;
      const day = document.querySelector('[aria-label="Day"]')?.textContent;
      const year = document.querySelector('[aria-label="Year"]')?.textContent;
      return { month, day, year };
    });
    log(`DOB: ${dobSet.month} ${dobSet.day}, ${dobSet.year}`);
    
    // Check terms checkbox if exists
    const terms = await page.$('input[type="checkbox"]');
    if (terms) {
      await humanClick(page, 'input[type="checkbox"]');
      await randomDelay(300, 600);
    }
    
    // Submit form
    log('Submitting...');
    const submitSuccess = await humanClick(page, 'button[type="submit"]');
    
    if (!submitSuccess) {
      log('Submit button not found, trying Enter key');
      await page.keyboard.press('Enter');
    }
    
    await randomDelay(5000, 8000);
    
    // Check for errors
    const errorEl = await page.$('[class*="error"]') 
      || await page.$('text=Invalid')
      || await page.$('text=required')
      || await page.$('text=incorrect');
    
    if (errorEl) {
      const errorText = await errorEl.textContent();
      log(`Form error: ${errorText}`);
    }
    
    // Check for captcha after submit
    const captcha = await page.$('iframe[src*="hcaptcha"]') 
      || await page.$('iframe[src*="recaptcha"]')
      || await page.$('[data-sitekey]')
      || await page.$('text=Verify you are human');
    
    if (captcha) {
      log('Post-submit captcha - waiting 45s...');
      await randomDelay(45000, 50000);
    }
    
    // Check for phone verification
    const phoneRequired = await page.$('text=Verify your phone') 
      || await page.$('input[type="tel"]')
      || await page.$('text=Phone number');
    
    if (phoneRequired) {
      log('Phone verification required');
      await browser.close();
      return;
    }
    
    // Wait for redirect or success
    await randomDelay(4000, 6000);
    
    // Check current URL
    const currentUrl = page.url();
    log(`URL after submit: ${currentUrl}`);
    
    // If still on register, something went wrong
    if (currentUrl.includes('/register')) {
      // Check for any visible errors
      const pageText = await page.evaluate(() => document.body.innerText);
      if (pageText.includes('captcha') || pageText.includes('CAPTCHA')) {
        log('Captcha blocking registration');
      } else if (pageText.includes('rate limit')) {
        log('Rate limited');
      } else {
        log('Still on register page - possible failure');
      }
    }
    
    // Try to extract token
    log('Extracting token...');
    let token = null;
    
    for (let attempt = 0; attempt < 5; attempt++) {
      token = await extractToken(page);
      if (token) break;
      await randomDelay(2000, 4000);
    }
    
    if (token && token.length > 50) {
      log('Token extracted!');
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
      log('No token extracted');
      
      // Debug: take screenshot of final state
      const pageContent = await page.evaluate(() => {
        return {
          url: window.location.href,
          hasLocalStorage: !!window.localStorage,
          hasSessionStorage: !!window.sessionStorage,
          bodyText: document.body.innerText.slice(0, 500)
        };
      });
      log(`Debug: ${JSON.stringify(pageContent)}`);
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
    const delay = isDirectMode() ? 90000 : 30000 + Math.random() * 30000;
    log(`Wait ${Math.round(delay/1000)}s...`);
    await randomDelay(delay, delay);
  }
})();
