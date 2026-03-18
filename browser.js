const { solveCaptcha } = require('./captcha-solver');

// In createAccount function, replace captcha handling:
const captcha = await page.$('iframe[src*="hcaptcha"]');
if (captcha) {
  log('Captcha detected - solving...');
  const solved = await solveCaptcha(page);
  if (solved) {
    log('Captcha solved!');
    await randomDelay(3000, 5000);
  } else {
    log('Captcha solve failed - waiting manual...');
    await randomDelay(45000, 50000);
  }
}
