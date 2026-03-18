const { workerData, parentPort } = require('worker_threads');
const { chromium } = require('playwright');
const { getWorkingProxy } = require('./proxies');
const { getTempEmail, checkInbox } = require('./email');
const { generateSuperFingerprint, injectFPS } = require('./utils');

function log(msg) {
  parentPort.postMessage({ type: 'log', data: msg });
}

async function createAccount() {
  try {
    const proxy = await getWorkingProxy();
    if (!proxy) {
      log('No working proxy, waiting...');
      await new Promise(r => setTimeout(r, 30000));
      return;
    }
    
    const email = await getTempEmail();
    log(`Using proxy: ${proxy}, email: ${email}`);
    
    const browser = await chromium.launch({
      headless: false,
      proxy: { server: `http://${proxy}` },
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-web-security',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-gpu',
        '--window-size=1280,720'
      ]
    });

    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      locale: 'en-US',
      timezoneId: 'America/New_York'
    });

    const page = await context.newPage();
    
    const fingerprint = generateSuperFingerprint();
    await injectFPS(page, fingerprint);
    
    await page.goto('https://discord.com/register', { 
      waitUntil: 'domcontentloaded',
      timeout: 30000 
    });
    
    await page.waitForTimeout(2000 + Math.random() * 3000);
    
    const blocked = await page.$('text=Sorry, something went wrong');
    if (blocked) {
      log('Proxy blocked by Discord');
      await browser.close();
      return;
    }
    
    await page.fill('input[name="email"]', email);
    await page.waitForTimeout(500 + Math.random() * 1000);
    
    const username = `user${Math.floor(Math.random() * 10000000)}`;
    await page.fill('input[name="username"]', username);
    await page.waitForTimeout(300 + Math.random() * 800);
    
    const password = `Pass${Math.random().toString(36).slice(2, 10)}!`;
    await page.fill('input[name="password"]', password);
    await page.waitForTimeout(400 + Math.random() * 600);
    
    await page.click('[aria-label="Month"]');
    await page.click('[data-value="1"]');
    await page.waitForTimeout(200);
    
    await page.click('[aria-label="Day"]');
    await page.click('[data-value="15"]');
    await page.waitForTimeout(200);
    
    await page.click('[aria-label="Year"]');
    await page.click('[data-value="1995"]');
    await page.waitForTimeout(500);
    
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000);
    
    const captcha = await page.$('iframe[src*="hcaptcha"]');
    if (captcha) {
      log('Captcha detected - needs solving');
      await page.waitForTimeout(45000);
    }
    
    const phoneCheck = await page.$('text=Verify your phone number');
    if (phoneCheck) {
      log('Phone verification required - skipping');
      await browser.close();
      return;
    }
    
    await page.waitForTimeout(2000);
    const token = await page.evaluate(() => {
      return localStorage.getItem('token');
    });
    
    if (token && token.length > 50) {
      parentPort.postMessage({ type: 'token', token, email });
      log('Token extracted successfully');
      
      setTimeout(async () => {
        const verifyLink = await checkInbox(email);
        if (verifyLink) {
          log(`Verification link found: ${verifyLink}`);
        }
      }, 60000);
    } else {
      log('Failed to extract token');
    }
    
    await browser.close();
    
  } catch (err) {
    parentPort.postMessage({ type: 'error', error: err.message });
  }
}

// WRAP THE LOOP IN AN ASYNC IIFE
(async function main() {
  while (true) {
    await createAccount();
    const delay = 30000 + Math.random() * 60000;
    log(`Waiting ${Math.round(delay/1000)}s before next attempt...`);
    await new Promise(r => setTimeout(r, delay));
  }
})();
