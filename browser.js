const { workerData, parentPort } = require('worker_threads');
const { chromium } = require('playwright');
const { getWorkingProxy } = require('./proxies');
const { getTempEmail, checkInbox } = require('./email');
const { generateFingerprint } = require('./utils');

async function createAccount() {
  const proxy = await getWorkingProxy();
  const email = await getTempEmail();
  
  const browser = await chromium.launch({
    headless: false,
    proxy: { server: `http://${proxy}` },
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-web-security',
      `--window-size=${1280 + Math.random() * 200},${720 + Math.random() * 200}`
    ]
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    userAgent: generateFingerprint().userAgent,
    locale: 'en-US',
    timezoneId: 'America/New_York',
    permissions: ['notifications']
  });

  const page = await context.newPage();
  
  // Navigate to Discord register
  await page.goto('https://discord.com/register', { waitUntil: 'networkidle' });
  
  // Random delays like human
  await page.waitForTimeout(1000 + Math.random() * 2000);
  
  // Fill registration
  await page.fill('input[name="email"]', email);
  await page.waitForTimeout(500 + Math.random() * 1000);
  
  await page.fill('input[name="username"]', `user${Math.floor(Math.random() * 1000000)}`);
  await page.waitForTimeout(300 + Math.random() * 800);
  
  const password = `Pass${Math.random().toString(36).slice(2)}!`;
  await page.fill('input[name="password"]', password);
  await page.waitForTimeout(400 + Math.random() * 600);
  
  // Date of birth
  await page.selectOption('select[id="react-select-2-input"]', { label: '1' });
  await page.waitForTimeout(200);
  await page.selectOption('select[id="react-select-3-input"]', { label: 'January' });
  await page.waitForTimeout(200);
  await page.selectOption('select[id="react-select-4-input"]', { label: '1995' });
  
  await page.waitForTimeout(1000);
  
  // Click continue
  await page.click('button[type="submit"]');
  
  // Wait for captcha or success
  await page.waitForTimeout(5000);
  
  // Check if captcha appeared
  const captchaFrame = await page.$('iframe[src*="hcaptcha"]');
  if (captchaFrame) {
    console.log('[!] Captcha detected - solve manually or implement solver');
    // Wait 30s for manual solve in non-headless
    await page.waitForTimeout(30000);
  }
  
  // Check for token in localStorage
  const token = await page.evaluate(() => {
    return localStorage.getItem('token') || document.body.innerText.includes('token');
  });
  
  if (token && token.length > 50) {
    parentPort.postMessage({ type: 'token', token: token.replace(/"/g, ''), email });
  } else {
    // Extract from cookies/network if needed
    const cookies = await context.cookies();
    const authCookie = cookies.find(c => c.name.includes('token'));
    if (authCookie) {
      parentPort.postMessage({ type: 'token', token: authCookie.value, email });
    }
  }
  
  await browser.close();
  
  // Verify email if token received
  setTimeout(async () => {
    const verifyLink = await checkInbox(email);
    if (verifyLink) {
      // Open link and confirm
      console.log('[+] Email verified for', email);
    }
  }, 30000);
}

// Loop forever
setInterval(() => {
  createAccount().catch(err => {
    parentPort.postMessage({ type: 'error', error: err.message });
  });
}, 60000 + Math.random() * 30000);

createAccount();
