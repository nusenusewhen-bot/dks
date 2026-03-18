const { solve } = require('./captcha-solver');

// In createAccount, replace captcha handling:
const captcha = await page.$('iframe[src*="hcaptcha"]');
if (captcha) {
  log('Captcha detected - solving...');
  const result = await solve(page, {
    useExternalAPI: false, // Set true with apiKey for fallback
    timeout: 120000
  });
  
  if (result.success) {
    log(`Captcha solved! (${result.method})`);
  } else {
    log(`Captcha failed: ${result.error}`);
    await randomDelay(30000, 45000); // Manual fallback
  }
}
