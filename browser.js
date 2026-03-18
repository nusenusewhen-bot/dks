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
  
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Delete');
  await randomDelay(50, 150);
  
  for (let i = 0; i < text.length; i++) {
    await page.keyboard.press(text[i]);
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
  await randomDelay(1000, 2000);
  
  const token = await page.evaluate(() => {
    try {
      if (window.localStorage) {
        const t = window.localStorage.getItem('token');
        if (t) return t;
      }
      if (window.sessionStorage) {
        const t = window.sessionStorage.getItem('token');
        if (t) return t;
      }
      
      const cookies = document.cookie;
      const match = cookies.match(/token=([^;]+)/);
      if (match) return match[1];
      
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
    
    // Inject anti-detection BEFORE navigation
    await injectFPS(page, fingerprint);
    
    log('Loading Discord...');
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
      log('Blocked');
      await browser.close();
      return;
    }
    
    log('Filling form...');
    
    // Email
    await humanType(page, 'input[name="email"]', email);
    await randomDelay(500, 1000);
    
    // Username
    const username = `user_${Math.floor(Math.random() * 100000000)}`;
    await humanType(page, 'input[name="username"]', username);
    await randomDelay(500, 1000);
    
    // Password
    const password = `Pass${Math.random().toString(36).slice(2, 12)}!`;
    await humanType(page, 'input[name="password"]', password);
    await randomDelay(500, 1000);
    
    // FIXED DATE PICKER - Use JavaScript to set values directly
    log('Setting DOB via JS...');
    
    await page.evaluate(() => {
      // Try to find and click the dropdowns programmatically
      const monthBtn = document.querySelector('[aria-label="Month"]');
      if (monthBtn) {
        monthBtn.click();
        setTimeout(() => {
          const jan = Array.from(document.querySelectorAll('div, span, li')).find(el => el.textContent === 'January');
          if (jan) jan.click();
        }, 100);
      }
    });
    
    await randomDelay(500, 800);
    
    await page.evaluate(() => {
      const dayBtn = document.querySelector('[aria-label="Day"]');
      if (dayBtn) {
        dayBtn.click();
        setTimeout(() => {
          const day15 = Array.from(document.querySelectorAll('div, span, li')).find(el => el.textContent === '15');
          if (day15) day15.click();
        }, 100);
      }
    });
    
    await randomDelay(500, 800);
    
    await page.evaluate(() => {
      const yearBtn = document.querySelector('[aria-label="Year"]');
      if (yearBtn) {
        yearBtn.click();
        setTimeout(() => {
          const year95 = Array.from(document.querySelectorAll('div, span, li')).find(el => el.textContent === '1995');
          if (year95) year95.click();
        }, 100);
      }
    });
    
    await randomDelay(1000, 1500);
    
    // Verify DOB was set
    const dobCheck = await page.evaluate(() => {
      const m = document.querySelector('[aria-label="Month"]')?.textContent?.trim();
      const d = document.querySelector('[aria-label="Day"]')?.textContent?.trim();
      const y = document.querySelector('[aria-label="Year"]')?.textContent?.trim();
      return { month: m, day: d, year: y };
    });
    
    log(`DOB set: ${dobCheck.month} / ${dobCheck.day} / ${dobCheck.year}`);
    
    // Check if DOB actually set, if not try alternative method
    if (!dobCheck.day || dobCheck.day === 'Day' || !dobCheck.year || dobCheck.year === 'Year') {
      log('DOB not set properly, trying alternative...');
      
      // Try using keyboard navigation
      await page.click('[aria-label="Month"]');
      await randomDelay(200, 400);
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
      await randomDelay(200, 400);
      
      await page.click('[aria-label="Day"]');
      await randomDelay(200, 400);
      for (let i = 0; i < 15; i++) await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
      await randomDelay(200, 400);
      
      await page.click('[aria-label="Year"]');
      await randomDelay(200, 400);
      for (let i = 0; i < 30; i++) await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
      await randomDelay(500, 800);
    }
    
    // Check terms checkbox
    const terms = await page.$('input[type="checkbox"]');
    if (terms) {
      await terms.click();
      await randomDelay(300, 600);
    }
    
    // Submit
    log('Submitting...');
    await humanClick(page, 'button[type="submit"]');
    await randomDelay(500, 1000);
    await page.keyboard.press('Enter');
    
    await randomDelay(6000, 10000);
    
    // Check for errors
    const errorText = await page.evaluate(() => {
      const errors = document.querySelectorAll('[class*="error"], [class*="Error"]');
      return Array.from(errors).map(e => e.textContent).join(', ');
    });
    
    if (errorText) {
      log(`Errors: ${errorText.slice(0, 100)}`);
    }
    
    // Check for captcha
    const captcha = await page.$('iframe[src*="hcaptcha"]') 
      || await page.$('iframe[src*="recaptcha"]');
    
    if (captcha) {
      log('Captcha - waiting 45s...');
      await randomDelay(45000, 50000);
    }
    
    // Check for phone verify
    const phone = await page.$('text=Verify your phone') || await page.$('input[type="tel"]');
    if (phone) {
      log('Phone required');
      await browser.close();
      return;
    }
    
    await randomDelay(3000, 5000);
    
    const url = page.url();
    log(`Final URL: ${url}`);
    
    // Extract token
    const token = await extractToken(page);
    
    if (token && token.length > 50) {
      log('Token extracted!');
      parentPort.postMessage({ type: 'token', token, email });
    } else {
      log('No token');
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
