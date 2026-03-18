const browser = await chromium.launch({
  headless: false, // Must be false for xvfb
  args: [
    '--disable-blink-features=AutomationControlled',
    '--disable-web-security',
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-accelerated-2d-canvas',
    '--no-first-run',
    '--no-zygote',
    '--single-process', // Required for Railway
    '--disable-gpu'
  ]
});
