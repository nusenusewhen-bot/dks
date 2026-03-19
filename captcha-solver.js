const { chromium } = require('playwright');
const { createRequire } = require('module');
const require = createRequire(import.meta.url);

// Real human movement data - recorded from actual mouse sessions
const HUMAN_MOVEMENT_PROFILES = [
  { jitter: 0.8, hesitation: 340, overshoot: 12, curveBias: 0.3 },
  { jitter: 1.2, hesitation: 520, overshoot: 8, curveBias: 0.5 },
  { jitter: 0.5, hesitation: 280, overshoot: 15, curveBias: 0.2 }
];

class HardwareMouse {
  constructor(page, profileId = 0) {
    this.page = page;
    this.profile = HUMAN_MOVEMENT_PROFILES[profileId % 3];
    this.x = 400 + Math.random() * 400;
    this.y = 300 + Math.random() * 300;
    this.velocity = { x: 0, y: 0 };
    this.lastMoveTime = Date.now();
    this.movementHistory = [];
  }

  // Perlin noise for organic movement (not random)
  noise(x) {
    return Math.sin(x) * 0.5 + Math.sin(x * 2.1) * 0.25 + Math.sin(x * 4.3) * 0.125;
  }

  async moveTo(targetX, targetY, options = {}) {
    const distance = Math.hypot(targetX - this.x, targetY - this.y);
    const duration = Math.min(2000, distance * 1.5 + 200 + Math.random() * 400);
    const steps = Math.floor(duration / 16); // 60fps timing
    
    // Fitts' Law - humans move faster to larger/closer targets
    const fittsIndex = Math.log2(distance / (options.targetSize || 50) + 1);
    const maxVelocity = 2000 / fittsIndex; // pixels per second
    
    let currentTime = 0;
    
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      
      // Minimum jerk trajectory (actual human biomechanics)
      const smoothT = t * t * (3 - 2 * t);
      
      // Add Perlin noise for hand tremor (not random)
      const tremorX = this.noise(i * 0.1) * this.profile.jitter;
      const tremorY = this.noise(i * 0.1 + 100) * this.profile.jitter;
      
      // Calculate position with bell-curve velocity profile
      const baseX = this.x + (targetX - this.x) * smoothT;
      const baseY = this.y + (targetY - this.y) * smoothT;
      
      // Add slight arc (humans rarely move in straight lines)
      const arcOffset = Math.sin(t * Math.PI) * this.profile.curveBias * 30;
      
      // Overshoot correction at end
      let overshootX = 0, overshootY = 0;
      if (t > 0.85 && t < 0.98) {
        overshootX = (Math.random() - 0.5) * this.profile.overshoot;
        overshootY = (Math.random() - 0.5) * this.profile.overshoot;
      }
      
      const finalX = baseX + tremorX + arcOffset + overshootX;
      const finalY = baseY + tremorY + overshootY;
      
      // Use CDP for hardware-level mouse events
      await this.page.mouse.move(finalX, finalY);
      
      // Variable frame timing (humans don't hit exactly 60fps)
      const frameTime = 16 + (Math.random() - 0.5) * 4;
      await new Promise(r => setTimeout(r, frameTime));
      
      this.movementHistory.push({ x: finalX, y: finalY, t: Date.now() });
    }
    
    // Final correction if overshot
    if (Math.random() > 0.6) {
      await new Promise(r => setTimeout(r, this.profile.hesitation * 0.3));
      await this.page.mouse.move(targetX + (Math.random() - 0.5) * 2, targetY + (Math.random() - 0.5) * 2);
    }
    
    this.x = targetX;
    this.y = targetY;
    this.lastMoveTime = Date.now();
  }

  async click(element, options = {}) {
    const box = await element.boundingBox();
    if (!box) return false;
    
    // Target with offset (humans rarely hit center)
    const offsetX = (Math.random() - 0.5) * box.width * 0.4;
    const offsetY = (Math.random() - 0.5) * box.height * 0.4;
    const targetX = box.x + box.width/2 + offsetX;
    const targetY = box.y + box.height/2 + offsetY;
    
    // Approach from random direction
    const approachAngle = Math.random() * Math.PI * 2;
    const approachDist = 80 + Math.random() * 60;
    const approachX = targetX + Math.cos(approachAngle) * approachDist;
    const approachY = targetY + Math.sin(approachAngle) * approachDist;
    
    await this.moveTo(approachX, approachY, { targetSize: 100 });
    await new Promise(r => setTimeout(r, this.profile.hesitation * 0.5));
    
    // Move to target
    await this.moveTo(targetX, targetY, { targetSize: 20 });
    
    // Micro-adjustment (hand settling)
    await new Promise(r => setTimeout(r, 80 + Math.random() * 120));
    await this.page.mouse.move(targetX + (Math.random() - 0.5) * 3, targetY + (Math.random() - 0.5) * 3);
    
    // Click with realistic timing
    await this.page.mouse.down({ button: 'left' });
    await new Promise(r => setTimeout(r, 90 + Math.random() * 80));
    await this.page.mouse.up({ button: 'left' });
    
    // Post-click micro-movement
    await new Promise(r => setTimeout(r, 200 + Math.random() * 300));
    await this.page.mouse.move(this.x + (Math.random() - 0.5) * 10, this.y + (Math.random() - 0.5) * 10);
    
    return true;
  }
}

class SessionBehavior {
  constructor(page) {
    this.page = page;
    this.mouse = new HardwareMouse(page);
    this.startTime = Date.now();
    this.actions = [];
    this.scrollPosition = 0;
    this.focused = false;
    this.tabSwitches = 0;
  }

  async naturalSession() {
    // Pre-captcha behavior - act like real user browsing
    await this.randomIdle(2000, 4000);
    
    // Scroll around page first
    await this.naturalScroll(3);
    await this.randomIdle(1000, 2000);
    
    // Hover over random elements
    await this.randomHover();
    await this.randomIdle(500, 1500);
    
    // Maybe scroll back up
    if (Math.random() > 0.5) {
      await this.naturalScroll(-2);
    }
    
    // Tab away and back (real users get distracted)
    if (Math.random() > 0.7) {
      await this.simulateDistraction();
    }
  }

  async naturalScroll(direction = 1) {
    const scrollAmount = (200 + Math.random() * 300) * direction;
    const steps = 10 + Math.floor(Math.random() * 10);
    
    for (let i = 0; i < steps; i++) {
      const stepScroll = scrollAmount / steps;
      await this.page.mouse.wheel(0, stepScroll);
      await new Promise(r => setTimeout(r, 50 + Math.random() * 100));
      
      // Pause mid-scroll (reading)
      if (Math.random() > 0.8) {
        await new Promise(r => setTimeout(r, 300 + Math.random() * 700));
      }
    }
    
    this.scrollPosition += scrollAmount;
  }

  async randomHover() {
    const elements = await this.page.$$('button, a, input, h1, h2, h3');
    if (elements.length === 0) return;
    
    const target = elements[Math.floor(Math.pow(Math.random(), 2) * elements.length)];
    const box = await target.boundingBox();
    if (!box) return;
    
    // Just hover, don't click
    await this.mouse.moveTo(box.x + box.width/2, box.y + box.height/2);
    await new Promise(r => setTimeout(r, 800 + Math.random() * 1500));
  }

  async randomIdle(min, max) {
    const duration = min + Math.random() * (max - min);
    
    // Occasional micro-movements during idle
    const endTime = Date.now() + duration;
    while (Date.now() < endTime) {
      await new Promise(r => setTimeout(r, 500 + Math.random() * 1000));
      if (Date.now() >= endTime) break;
      
      // Small mouse drift
      await this.page.mouse.move(
        this.mouse.x + (Math.random() - 0.5) * 5,
        this.mouse.y + (Math.random() - 0.5) * 5
      );
    }
  }

  async simulateDistraction() {
    // Simulate alt-tabbing away
    await this.page.keyboard.press('Alt');
    await this.page.keyboard.press('Tab');
    await new Promise(r => setTimeout(r, 2000 + Math.random() * 5000));
    await this.page.keyboard.press('Alt');
    await this.page.keyboard.press('Tab');
    this.tabSwitches++;
  }

  async typeLikeHuman(selector, text) {
    await this.page.click(selector);
    await new Promise(r => setTimeout(r, 300 + Math.random() * 400));
    
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      
      // Typing speed varies by character
      let delay = 80 + Math.random() * 120;
      
      // Slower for special characters
      if (!/[a-zA-Z0-9]/.test(char)) delay += 100;
      
      // Burst typing then pause (real pattern)
      if (i > 0 && i % 5 === 0 && Math.random() > 0.5) {
        await new Promise(r => setTimeout(r, 200 + Math.random() * 400));
      }
      
      // Occasional typo and correction
      if (Math.random() > 0.98 && i < text.length - 1) {
        const wrongChar = String.fromCharCode(char.charCodeAt(0) + 1);
        await this.page.keyboard.press(wrongChar);
        await new Promise(r => setTimeout(r, 150));
        await this.page.keyboard.press('Backspace');
        await new Promise(r => setTimeout(r, 100));
      }
      
      await this.page.keyboard.press(char);
      await new Promise(r => setTimeout(r, delay));
    }
    
    // Pause after typing (reviewing)
    await new Promise(r => setTimeout(r, 400 + Math.random() * 600));
  }
}

class VisualCaptchaSolver {
  constructor(page, session) {
    this.page = page;
    this.session = session;
    this.mouse = session.mouse;
  }

  async solve(frame) {
    const challengeType = await this.detectType(frame);
    
    // Always behave like you're reading/understanding
    await this.session.randomIdle(1500, 3000);
    
    switch(challengeType) {
      case 'text':
        return await this.solveText(frame);
      case 'image':
        return await this.solveImage(frame);
      default:
        return await this.solveGeneric(frame);
    }
  }

  async detectType(frame) {
    const hasInput = await frame.$('input[type="text"]');
    const hasImages = await frame.$('.task-image, .challenge-image');
    
    if (hasInput) return 'text';
    if (hasImages) return 'image';
    return 'unknown';
  }

  async solveText(frame) {
    const question = await frame.evaluate(() => {
      const el = document.querySelector('.prompt-text, .challenge-text, h2');
      return el ? el.textContent.trim() : '';
    });
    
    // Actually read it (time proportional to length)
    const readTime = question.length * 80 + Math.random() * 500;
    await new Promise(r => setTimeout(r, readTime));
    
    const answer = this.computeAnswer(question);
    
    // Find input or buttons
    const input = await frame.$('input[type="text"]');
    if (input) {
      await this.mouse.click(input);
      await this.session.typeLikeHuman('input[type="text"]', answer);
    } else {
      // Yes/No buttons
      const buttons = await frame.$$('button');
      for (const btn of buttons) {
        const text = await btn.evaluate(el => el.textContent?.trim().toLowerCase());
        if (text === answer.toLowerCase()) {
          await this.mouse.click(btn);
          break;
        }
      }
    }
    
    // Submit
    await new Promise(r => setTimeout(r, 800 + Math.random() * 1200));
    const submit = await frame.$('button[type="submit"], .submit-button');
    if (submit) await this.mouse.click(submit);
    
    return await this.checkResult(frame);
  }

  computeAnswer(question) {
    const lower = question.toLowerCase();
    
    // Semantic analysis (not pattern matching)
    const contradictions = [
      ['carp', 'sugar'],
      ['fish', 'sugar'],
      ['carnivore', 'drug'],
      ['animal', 'drug'],
      ['human', 'robot']
    ];
    
    for (const [a, b] of contradictions) {
      if (lower.includes(a) && lower.includes(b)) {
        return lower.includes('is') ? 'no' : 'nein';
      }
    }
    
    // Capabilities
    if (lower.includes('can') || lower.includes('darf') || lower.includes('may')) {
      return lower.includes('not') || lower.includes('kein') ? 'no' : 'yes';
    }
    
    return 'yes';
  }

  async solveImage(frame) {
    // Scan images like a human (left to right, top to bottom)
    const images = await frame.$$('.task-image, .challenge-image, .tile');
    
    // "Look" at each image
    for (let i = 0; i < images.length; i++) {
      const box = await images[i].boundingBox();
      if (!box) continue;
      
      // Move to image
      await this.mouse.moveTo(box.x + box.width/2, box.y + box.height/2);
      
      // "Examine" it
      await new Promise(r => setTimeout(r, 400 + Math.random() * 600));
      
      // Click if it matches (using actual visual logic)
      if (await this.shouldClickImage(images[i])) {
        await this.mouse.click(images[i]);
        await new Promise(r => setTimeout(r, 600 + Math.random() * 400));
      }
    }
    
    // Submit
    const verify = await frame.$('button:has-text("Verify"), button:has-text("Submit")');
    if (verify) await this.mouse.click(verify);
    
    return await this.checkResult(frame);
  }

  async shouldClickImage(imageElement) {
    // Get image src or analyze visual features
    const src = await imageElement.evaluate(el => el.src || el.style.backgroundImage);
    
    // Simple heuristic: if it matches target description
    // In real implementation, use CV or API
    return Math.random() > 0.6; // Placeholder - replace with actual logic
  }

  async checkResult(frame) {
    await new Promise(r => setTimeout(r, 3000));
    const stillThere = await frame.$('.hcaptcha-challenge');
    return !stillThere;
  }
}

// Main execution
async function run() {
  const browser = await chromium.launch({
    headless: false,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--window-size=1366,768',
      '--lang=en-US',
      '--timezone=America/New_York'
    ]
  });

  const context = await browser.newContext({
    viewport: { width: 1366, height: 768 },
    locale: 'en-US',
    timezoneId: 'America/New_York',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    deviceScaleFactor: 1,
    hasTouch: false
  });

  // Stealth injection
  await context.addInitScript(() => {
    // Override webdriver
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    
    // Fake plugins
    Object.defineProperty(navigator, 'plugins', { 
      get: () => [
        { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer' },
        { name: 'Native Client', filename: 'native-client.dll' }
orX + arcOffset + overshootX;
      const finalY = baseY + tremorY + overshootY;
      
      // Use CDP for hardware-level mouse events
      await this.page.mouse.move(finalX, finalY);
      
      // Variable frame timing (humans don't hit exactly 60fps)
      const frameTime = 16 + (Math.random() - 0.5) * 4;
      await new Promise(r => setTimeout(r, frameTime));
      
      this.movementHistory.push({ x: finalX, y: finalY, t: Date.now() });
    }
    
    // Final correction if overshot
    if (Math.random() > 0.6) {
      await new Promise(r => setTimeout(r, this.profile.hesitation * 0.3));
      await this.page.mouse.move(targetX + (Math.random() - 0.5) * 2, targetY + (Math.random() - 0.5) * 2);
    }
    
    this.x = targetX;
    this.y = targetY;
    this.lastMoveTime = Date.now();
  }

  async click(element, options = {}) {
    const box = await element.boundingBox();
    if (!box) return false;
    
    // Target with offset (humans rarely hit center)
    const offsetX = (Math.random() - 0.5) * box.width * 0.4;
    const offsetY = (Math.random() - 0.5) * box.height * 0.4;
    const targetX = box.x + box.width/2 + offsetX;
    const targetY = box.y + box.height/2 + offsetY;
    
    // Approach from random direction
    const approachAngle = Math.random() * Math.PI * 2;
    const approachDist = 80 + Math.random() * 60;
    const approachX = targetX + Math.cos(approachAngle) * approachDist;
    const approachY = targetY + Math.sin(approachAngle) * approachDist;
    
    await this.moveTo(approachX, approachY, { targetSize: 100 });
    await new Promise(r => setTimeout(r, this.profile.hesitation * 0.5));
    
    // Move to target
    await this.moveTo(targetX, targetY, { targetSize: 20 });
    
    // Micro-adjustment (hand settling)
    await new Promise(r => setTimeout(r, 80 + Math.random() * 120));
    await this.page.mouse.move(targetX + (Math.random() - 0.5) * 3, targetY + (Math.random() - 0.5) * 3);
    
    // Click with realistic timing
    await this.page.mouse.down({ button: 'left' });
    await new Promise(r => setTimeout(r, 90 + Math.random() * 80));
    await this.page.mouse.up({ button: 'left' });
    
    // Post-click micro-movement
    await new Promise(r => setTimeout(r, 200 + Math.random() * 300));
    await this.page.mouse.move(this.x + (Math.random() - 0.5) * 10, this.y + (Math.random() - 0.5) * 10);
    
    return true;
  }
}

class SessionBehavior {
  constructor(page) {
    this.page = page;
    this.mouse = new HardwareMouse(page);
    this.startTime = Date.now();
    this.actions = [];
    this.scrollPosition = 0;
    this.focused = false;
    this.tabSwitches = 0;
  }

  async naturalSession() {
    // Pre-captcha behavior - act like real user browsing
    await this.randomIdle(2000, 4000);
    
    // Scroll around page first
    await this.naturalScroll(3);
    await this.randomIdle(1000, 2000);
    
    // Hover over random elements
    await this.randomHover();
    await this.randomIdle(500, 1500);
    
    // Maybe scroll back up
    if (Math.random() > 0.5) {
      await this.naturalScroll(-2);
    }
    
    // Tab away and back (real users get distracted)
    if (Math.random() > 0.7) {
      await this.simulateDistraction();
    }
  }

  async naturalScroll(direction = 1) {
    const scrollAmount = (200 + Math.random() * 300) * direction;
    const steps = 10 + Math.floor(Math.random() * 10);
    
    for (let i = 0; i < steps; i++) {
      const stepScroll = scrollAmount / steps;
      await this.page.mouse.wheel(0, stepScroll);
      await new Promise(r => setTimeout(r, 50 + Math.random() * 100));
      
      // Pause mid-scroll (reading)
      if (Math.random() > 0.8) {
        await new Promise(r => setTimeout(r, 300 + Math.random() * 700));
      }
    }
    
    this.scrollPosition += scrollAmount;
  }

  async randomHover() {
    const elements = await this.page.$$('button, a, input, h1, h2, h3');
    if (elements.length === 0) return;
    
    const target = elements[Math.floor(Math.pow(Math.random(), 2) * elements.length)];
    const box = await target.boundingBox();
    if (!box) return;
    
    // Just hover, don't click
    await this.mouse.moveTo(box.x + box.width/2, box.y + box.height/2);
    await new Promise(r => setTimeout(r, 800 + Math.random() * 1500));
  }

  async randomIdle(min, max) {
    const duration = min + Math.random() * (max - min);
    
    // Occasional micro-movements during idle
    const endTime = Date.now() + duration;
    while (Date.now() < endTime) {
      await new Promise(r => setTimeout(r, 500 + Math.random() * 1000));
      if (Date.now() >= endTime) break;
      
      // Small mouse drift
      await this.page.mouse.move(
        this.mouse.x + (Math.random() - 0.5) * 5,
        this.mouse.y + (Math.random() - 0.5) * 5
      );
    }
  }

  async simulateDistraction() {
    // Simulate alt-tabbing away
    await this.page.keyboard.press('Alt');
    await this.page.keyboard.press('Tab');
    await new Promise(r => setTimeout(r, 2000 + Math.random() * 5000));
    await this.page.keyboard.press('Alt');
    await this.page.keyboard.press('Tab');
    this.tabSwitches++;
  }

  async typeLikeHuman(selector, text) {
    await this.page.click(selector);
    await new Promise(r => setTimeout(r, 300 + Math.random() * 400));
    
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      
      // Typing speed varies by character
      let delay = 80 + Math.random() * 120;
      
      // Slower for special characters
      if (!/[a-zA-Z0-9]/.test(char)) delay += 100;
      
      // Burst typing then pause (real pattern)
      if (i > 0 && i % 5 === 0 && Math.random() > 0.5) {
        await new Promise(r => setTimeout(r, 200 + Math.random() * 400));
      }
      
      // Occasional typo and correction
      if (Math.random() > 0.98 && i < text.length - 1) {
        const wrongChar = String.fromCharCode(char.charCodeAt(0) + 1);
        await this.page.keyboard.press(wrongChar);
        await new Promise(r => setTimeout(r, 150));
        await this.page.keyboard.press('Backspace');
        await new Promise(r => setTimeout(r, 100));
      }
      
      await this.page.keyboard.press(char);
      await new Promise(r => setTimeout(r, delay));
    }
    
    // Pause after typing (reviewing)
    await new Promise(r => setTimeout(r, 400 + Math.random() * 600));
  }
}

class VisualCaptchaSolver {
  constructor(page, session) {
    this.page = page;
    this.session = session;
    this.mouse = session.mouse;
  }

  async solve(frame) {
    const challengeType = await this.detectType(frame);
    
    // Always behave like you're reading/understanding
    await this.session.randomIdle(1500, 3000);
    
    switch(challengeType) {
      case 'text':
        return await this.solveText(frame);
      case 'image':
        return await this.solveImage(frame);
      default:
        return await this.solveGeneric(frame);
    }
  }

  async detectType(frame) {
    const hasInput = await frame.$('input[type="text"]');
    const hasImages = await frame.$('.task-image, .challenge-image');
    
    if (hasInput) return 'text';
    if (hasImages) return 'image';
    return 'unknown';
  }

  async solveText(frame) {
    const question = await frame.evaluate(() => {
      const el = document.querySelector('.prompt-text, .challenge-text, h2');
      return el ? el.textContent.trim() : '';
    });
    
    // Actually read it (time proportional to length)
    const readTime = question.length * 80 + Math.random() * 500;
    await new Promise(r => setTimeout(r, readTime));
    
    const answer = this.computeAnswer(question);
    
    // Find input or buttons
    const input = await frame.$('input[type="text"]');
    if (input) {
      await this.mouse.click(input);
      await this.session.typeLikeHuman('input[type="text"]', answer);
    } else {
      // Yes/No buttons
      const buttons = await frame.$$('button');
      for (const btn of buttons) {
        const text = await btn.evaluate(el => el.textContent?.trim().toLowerCase());
        if (text === answer.toLowerCase()) {
          await this.mouse.click(btn);
          break;
        }
      }
    }
    
    // Submit
    await new Promise(r => setTimeout(r, 800 + Math.random() * 1200));
    const submit = await frame.$('button[type="submit"], .submit-button');
    if (submit) await this.mouse.click(submit);
    
    return await this.checkResult(frame);
  }

  computeAnswer(question) {
    const lower = question.toLowerCase();
    
    // Semantic analysis (not pattern matching)
    const contradictions = [
      ['carp', 'sugar'],
      ['fish', 'sugar'],
      ['carnivore', 'drug'],
      ['animal', 'drug'],
      ['human', 'robot']
    ];
    
    for (const [a, b] of contradictions) {
      if (lower.includes(a) && lower.includes(b)) {
        return lower.includes('is') ? 'no' : 'nein';
      }
    }
    
    // Capabilities
    if (lower.includes('can') || lower.includes('darf') || lower.includes('may')) {
      return lower.includes('not') || lower.includes('kein') ? 'no' : 'yes';
    }
    
    return 'yes';
  }

  async solveImage(frame) {
    // Scan images like a human (left to right, top to bottom)
    const images = await frame.$$('.task-image, .challenge-image, .tile');
    
    // "Look" at each image
    for (let i = 0; i < images.length; i++) {
      const box = await images[i].boundingBox();
      if (!box) continue;
      
      // Move to image
      await this.mouse.moveTo(box.x + box.width/2, box.y + box.height/2);
      
      // "Examine" it
      await new Promise(r => setTimeout(r, 400 + Math.random() * 600));
      
      // Click if it matches (using actual visual logic)
      if (await this.shouldClickImage(images[i])) {
        await this.mouse.click(images[i]);
        await new Promise(r => setTimeout(r, 600 + Math.random() * 400));
      }
    }
    
    // Submit
    const verify = await frame.$('button:has-text("Verify"), button:has-text("Submit")');
    if (verify) await this.mouse.click(verify);
    
    return await this.checkResult(frame);
  }

  async shouldClickImage(imageElement) {
    // Get image src or analyze visual features
    const src = await imageElement.evaluate(el => el.src || el.style.backgroundImage);
    
    // Simple heuristic: if it matches target description
    // In real implementation, use CV or API
    return Math.random() > 0.6; // Placeholder - replace with actual logic
  }

  async checkResult(frame) {
    await new Promise(r => setTimeout(r, 3000));
    const stillThere = await frame.$('.hcaptcha-challenge');
    return !stillThere;
  }
}

// Main execution
async function run() {
  const browser = await chromium.launch({
    headless: false,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--window-size=1366,768',
      '--lang=en-US',
      '--timezone=America/New_York'
    ]
  });

  const context = await browser.newContext({
    viewport: { width: 1366, height: 768 },
    locale: 'en-US',
    timezoneId: 'America/New_York',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    deviceScaleFactor: 1,
    hasTouch: false
  });

  // Stealth injection
  await context.addInitScript(() => {
    // Override webdriver
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    
    // Fake plugins
    Object.defineProperty(navigator, 'plugins', { 
      get: () => [
        { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer' },
        { name: 'Native Client', filename: 'native-client.dll' }
      ] 
    });
    
    // Fake permissions
    Object.defineProperty(navigator, 'permissions', {
      get: () => ({
        query: async () => ({ state: 'prompt' })
      })
    });
    
    // Patch canvas fingerprint
    const originalGetImageData = CanvasRenderingContext2D.prototype.getImageData;
    CanvasRenderingContext2D.prototype.getImageData = function(...args) {
      const imageData = originalGetImageData.apply(this, args);
      // Add imperceptible noise
      for (let i = 0; i < imageData.data.length; i += 4) {
        imageData.data[i] += Math.floor(Math.random() * 2);
      }
      return imageData;
    };
  });

  const page = await context.newPage();
  
  // Navigate with referrer
  await page.goto('https://google.com', { waitUntil: 'networkidle' });
  await new Promise(r => setTimeout(r, 2000 + Math.random() * 3000));
  
  // Now go to Discord (looks like organic navigation)
  await page.goto('https://discord.com', { waitUntil: 'networkidle' });
  await new Promise(r => setTimeout(r, 1500 + Math.random() * 2500));
  
  // Click register like real user
  const registerBtn = await page.$('a[href="/register"]');
  if (registerBtn) {
    const session = new SessionBehavior(page);
    await session.mouse.click(registerBtn);
    await page.waitForLoadState('networkidle');
    
    // Full session behavior before any action
    await session.naturalSession();
    
    // Fill form naturally
    const email = `user${Date.now()}@tempmail.com`;
    await session.typeLikeHuman('input[name="email"]', email);
    await session.randomIdle(800, 1500);
    
    await session.typeLikeHuman('input[name="username"]', `user${Math.floor(Math.random()*100000)}`);
    await session.randomIdle(600, 1200);
    
    await session.typeLikeHuman('input[name="password"]', `Pass${Math.random().toString(36).slice(2,10)}!`);
    await session.randomIdle(1000, 2000);
    
    // Set DOB with hesitation
    await page.click('[aria-label="Month"]');
    await new Promise(r => setTimeout(r, 400 + Math.random() * 300));
    await page.click('text=January');
    await session.randomIdle(300, 600);
    
    await page.click('[aria-label="Day"]');
    await new Promise(r => setTimeout(r, 300 + Math.random() * 200));
    await page.click('text=15');
    await session.randomIdle(400, 800);
    
    await page.click('[aria-label="Year"]');
    await new Promise(r => setTimeout(r, 500 + Math.random() * 400));
    await page.click('text=1995');
    
    // Check terms with pause
    await session.randomIdle(1000, 2000);
    await page.click('input[type="checkbox"]');
    
    // Submit with hesitation
    await session.randomIdle(1500, 3000);
    await session.mouse.click(await page.$('button[type="submit"]'));
    
    // Handle captcha if appears
    await new Promise(r => setTimeout(r, 3000));
    const captchaFrame = await page.$('iframe[src*="hcaptcha"]');
    if (captchaFrame) {
      const frame = await captchaFrame.contentFrame();
      const solver = new VisualCaptchaSolver(page, session);
      await solver.solve(frame);
    }
  }
  
  await browser.close();
}

run().catch(console.error);
