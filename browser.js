const { solve } = require('./captcha-solver');

// In createAccount, where captcha is detected:
const captcha = await page.$('iframe[src*="hcaptcha"]');
if (captcha) {
  log('Captcha detected - solving...');
  
  const frame = await captcha.contentFrame();
  const result = await solve(frame, page);
  
  if (result) {
    log('Captcha solved!');
  } else {
    log('Captcha solve failed - waiting...');
    await randomDelay(30000, 45000);
  }
  
  await randomDelay(3000, 5000);
}
