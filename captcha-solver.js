const axios = require('axios');
const { createCanvas, loadImage } = require('canvas');

const HUMAN_PROFILES = [
  { jitter: 0.8, hesitation: 340, overshoot: 12, curveBias: 0.3, typingSpeed: 85, readingSpeed: 120 },
  { jitter: 1.2, hesitation: 520, overshoot: 8, curveBias: 0.5, typingSpeed: 110, readingSpeed: 150 },
  { jitter: 0.5, hesitation: 280, overshoot: 15, curveBias: 0.2, typingSpeed: 65, readingSpeed: 90 }
];

class HardwareMouse {
  constructor(page, profileId = 0) {
    this.page = page;
    this.profile = HUMAN_PROFILES[profileId % 3];
    this.x = 400 + Math.random() * 400;
    this.y = 300 + Math.random() * 300;
    this.velocity = { x: 0, y: 0 };
  }

  noise(x) {
    return Math.sin(x) * 0.5 + Math.sin(x * 2.1) * 0.25 + Math.sin(x * 4.3) * 0.125;
  }

  async moveTo(targetX, targetY, options = {}) {
    const distance = Math.hypot(targetX - this.x, targetY - this.y);
    const duration = Math.min(2500, distance * 1.8 + 300 + Math.random() * 500);
    const steps = Math.floor(duration / 16);
    
    const fittsIndex = Math.log2(distance / (options.targetSize || 50) + 1);
    
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const smoothT = t * t * (3 - 2 * t);
      
      const tremorX = this.noise(i * 0.1) * this.profile.jitter * (1 + Math.random() * 0.5);
      const tremorY = this.noise(i * 0.1 + 100) * this.profile.jitter * (1 + Math.random() * 0.5);
      
      const baseX = this.x + (targetX - this.x) * smoothT;
      const baseY = this.y + (targetY - this.y) * smoothT;
      
      const arcOffset = Math.sin(t * Math.PI) * this.profile.curveBias * 40;
      
      let overshootX = 0, overshootY = 0;
      if (t > 0.82 && t < 0.98) {
        overshootX = (Math.random() - 0.5) * this.profile.overshoot * 1.5;
        overshootY = (Math.random() - 0.5) * this.profile.overshoot * 1.5;
      }
      
      const accelCurve = Math.sin(t * Math.PI) * 0.3 + 0.7;
      
      await this.page.mouse.move(
        baseX + tremorX + arcOffset + overshootX,
        baseY + tremorY + (arcOffset * 0.3) + overshootY
      );
      
      await new Promise(r => setTimeout(r, (16 + (Math.random() - 0.5) * 6) * accelCurve));
    }
    
    if (Math.random() > 0.5) {
      await new Promise(r => setTimeout(r, this.profile.hesitation * (0.2 + Math.random() * 0.3)));
      await this.page.mouse.move(
        targetX + (Math.random() - 0.5) * 3, 
        targetY + (Math.random() - 0.5) * 3
      );
    }
    
    this.x = targetX;
    this.y = targetY;
  }

  async click(element, options = {}) {
    const box = await element.boundingBox();
    if (!box) return false;
    
    const offsetX = (Math.random() - 0.5) * box.width * 0.35;
    const offsetY = (Math.random() - 0.5) * box.height * 0.35;
    const targetX = box.x + box.width/2 + offsetX;
    const targetY = box.y + box.height/2 + offsetY;
    
    const approachAngle = Math.random() * Math.PI * 2;
    const approachDist = 100 + Math.random() * 80;
    
    await this.moveTo(
      targetX + Math.cos(approachAngle) * approachDist,
      targetY + Math.sin(approachAngle) * approachDist,
      { targetSize: 120 }
    );
    
    await new Promise(r => setTimeout(r, this.profile.hesitation * (0.4 + Math.random() * 0.4)));
    
    const microAdjustments = Math.floor(Math.random() * 2) + 1;
    for (let i = 0; i < microAdjustments; i++) {
      await this.moveTo(
        targetX + (Math.random() - 0.5) * 10,
        targetY + (Math.random() - 0.5) * 10,
        { targetSize: 30 }
      );
      await new Promise(r => setTimeout(r, 50 + Math.random() * 100));
    }
    
    await this.moveTo(targetX, targetY, { targetSize: 15 });
    await new Promise(r => setTimeout(r, 60 + Math.random() * 120));
    
    await this.page.mouse.move(targetX + (Math.random() - 0.5) * 2, targetY + (Math.random() - 0.5) * 2);
    await new Promise(r => setTimeout(r, 20 + Math.random() * 40));
    
    await this.page.mouse.down({ button: 'left' });
    await new Promise(r => setTimeout(r, 80 + Math.random() * 100));
    await this.page.mouse.up({ button: 'left' });
    
    await new Promise(r => setTimeout(r, 150 + Math.random() * 250));
    
    if (Math.random() > 0.3) {
      await this.page.mouse.move(
        this.x + (Math.random() - 0.5) * 15,
        this.y + (Math.random() - 0.5) * 15
      );
    }
    
    return true;
  }
}

class SessionBehavior {
  constructor(page, profileId = 0) {
    this.page = page;
    this.mouse = new HardwareMouse(page, profileId);
    this.profile = HUMAN_PROFILES[profileId % 3];
    this.startTime = Date.now();
    this.interactionCount = 0;
  }

  async naturalWarmup() {
    const patterns = [
      async () => {
        await this.randomIdle(2000, 4000);
        await this.naturalScroll(2 + Math.floor(Math.random() * 3));
        await this.randomHover();
        await this.randomIdle(800, 1500);
      },
      async () => {
        await this.randomIdle(1500, 3000);
        await this.randomHover();
        await this.naturalScroll(1);
        await this.randomIdle(500, 1200);
        await this.randomHover();
      },
      async () => {
        await this.naturalScroll(31 + Math.random() * 0.5);
      const tremorY = this.noise(i * 0.1 + 100) * this.profile.jitter * (1 + Math.random() * 0.5);
      
      const baseX = this.x + (targetX - this.x) * smoothT;
      const baseY = this.y + (targetY - this.y) * smoothT;
      
      const arcOffset = Math.sin(t * Math.PI) * this.profile.curveBias * 40;
      
      let overshootX = 0, overshootY = 0;
      if (t > 0.82 && t < 0.98) {
        overshootX = (Math.random() - 0.5) * this.profile.overshoot * 1.5;
        overshootY = (Math.random() - 0.5) * this.profile.overshoot * 1.5;
      }
      
      const accelCurve = Math.sin(t * Math.PI) * 0.3 + 0.7;
      
      await this.page.mouse.move(
        baseX + tremorX + arcOffset + overshootX,
        baseY + tremorY + (arcOffset * 0.3) + overshootY
      );
      
      await new Promise(r => setTimeout(r, (16 + (Math.random() - 0.5) * 6) * accelCurve));
    }
    
    if (Math.random() > 0.5) {
      await new Promise(r => setTimeout(r, this.profile.hesitation * (0.2 + Math.random() * 0.3)));
      await this.page.mouse.move(
        targetX + (Math.random() - 0.5) * 3, 
        targetY + (Math.random() - 0.5) * 3
      );
    }
    
    this.x = targetX;
    this.y = targetY;
  }

  async click(element, options = {}) {
    const box = await element.boundingBox();
    if (!box) return false;
    
    const offsetX = (Math.random() - 0.5) * box.width * 0.35;
    const offsetY = (Math.random() - 0.5) * box.height * 0.35;
    const targetX = box.x + box.width/2 + offsetX;
    const targetY = box.y + box.height/2 + offsetY;
    
    const approachAngle = Math.random() * Math.PI * 2;
    const approachDist = 100 + Math.random() * 80;
    
    await this.moveTo(
      targetX + Math.cos(approachAngle) * approachDist,
      targetY + Math.sin(approachAngle) * approachDist,
      { targetSize: 120 }
    );
    
    await new Promise(r => setTimeout(r, this.profile.hesitation * (0.4 + Math.random() * 0.4)));
    
    const microAdjustments = Math.floor(Math.random() * 2) + 1;
    for (let i = 0; i < microAdjustments; i++) {
      await this.moveTo(
        targetX + (Math.random() - 0.5) * 10,
        targetY + (Math.random() - 0.5) * 10,
        { targetSize: 30 }
      );
      await new Promise(r => setTimeout(r, 50 + Math.random() * 100));
    }
    
    await this.moveTo(targetX, targetY, { targetSize: 15 });
    await new Promise(r => setTimeout(r, 60 + Math.random() * 120));
    
    await this.page.mouse.move(targetX + (Math.random() - 0.5) * 2, targetY + (Math.random() - 0.5) * 2);
    await new Promise(r => setTimeout(r, 20 + Math.random() * 40));
    
    await this.page.mouse.down({ button: 'left' });
    await new Promise(r => setTimeout(r, 80 + Math.random() * 100));
    await this.page.mouse.up({ button: 'left' });
    
    await new Promise(r => setTimeout(r, 150 + Math.random() * 250));
    
    if (Math.random() > 0.3) {
      await this.page.mouse.move(
        this.x + (Math.random() - 0.5) * 15,
        this.y + (Math.random() - 0.5) * 15
      );
    }
    
    return true;
  }
}

class SessionBehavior {
  constructor(page, profileId = 0) {
    this.page = page;
    this.mouse = new HardwareMouse(page, profileId);
    this.profile = HUMAN_PROFILES[profileId % 3];
    this.startTime = Date.now();
    this.interactionCount = 0;
  }

  async naturalWarmup() {
    const patterns = [
      async () => {
        await this.randomIdle(2000, 4000);
        await this.naturalScroll(2 + Math.floor(Math.random() * 3));
        await this.randomHover();
        await this.randomIdle(800, 1500);
      },
      async () => {
        await this.randomIdle(1500, 3000);
        await this.randomHover();
        await this.naturalScroll(1);
        await this.randomIdle(500, 1200);
        await this.randomHover();
      },
      async () => {
        await this.naturalScroll(3);
        await this.randomIdle(1000, 2000);
        await this.simulateReading();
      }
    ];
    
    const pattern = patterns[Math.floor(Math.random() * patterns.length)];
    await pattern();
    
    if (Math.random() > 0.6) {
      await this.simulateDistraction();
    }
  }

  async naturalScroll(direction = 1, intensity = 1) {
    const baseAmount = 150 + Math.random() * 250;
    const scrollAmount = baseAmount * direction * intensity;
    const steps = 8 + Math.floor(Math.random() * 12);
    
    for (let i = 0; i < steps; i++) {
      const stepScroll = (scrollAmount / steps) * (0.8 + Math.random() * 0.4);
      await this.page.mouse.wheel(0, stepScroll);
      
      const pauseChance = 0.15 + (i / steps) * 0.2;
      if (Math.random() < pauseChance) {
        await new Promise(r => setTimeout(r, 200 + Math.random() * 600));
      } else {
        await new Promise(r => setTimeout(r, 30 + Math.random() * 80));
      }
    }
  }

  async randomHover() {
    const elements = await this.page.$$('button, a, input, h1, h2, h3, label, div[role="button"]');
    if (elements.length === 0) return;
    
    const weights = elements.map((_, i) => 1 / (i + 1));
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    let random = Math.random() * totalWeight;
    
    let selectedIndex = 0;
    for (let i = 0; i < weights.length; i++) {
      random -= weights[i];
      if (random <= 0) {
        selectedIndex = i;
        break;
      }
    }
    
    const target = elements[selectedIndex];
    const box = await target.boundingBox();
    if (!box) return;
    
    await this.mouse.moveTo(box.x + box.width/2, box.y + box.height/2);
    await new Promise(r => setTimeout(r, 600 + Math.random() * 1400));
    
    if (Math.random() > 0.7) {
      await this.page.mouse.move(
        box.x + box.width/2 + (Math.random() - 0.5) * 30,
        box.y + box.height/2 + (Math.random() - 0.5) * 20
      );
      await new Promise(r => setTimeout(r, 300 + Math.random() * 500));
    }
  }

  async simulateReading() {
    const readTime = 3000 + Math.random() * 4000;
    const endTime = Date.now() + readTime;
    
    while (Date.now() < endTime) {
      await new Promise(r => setTimeout(r, 400 + Math.random() * 800));
      
      const action = Math.random();
      if (action < 0.3) {
        await this.page.mouse.move(
          this.mouse.x + (Math.random() - 0.5) * 100,
          this.mouse.y + (Math.random() - 0.5) * 50
        );
      } else if (action < 0.5) {
        await this.naturalScroll(1, 0.5);
      }
    }
  }

  async randomIdle(min, max) {
    const duration = min + Math.random() * (max - min);
    const endTime = Date.now() + duration;
    
    while (Date.now() < endTime) {
      const remaining = endTime - Date.now();
      const nextPause = Math.min(500 + Math.random() * 1000, remaining);
      
      await new Promise(r => setTimeout(r, nextPause));
      
      if (Date.now() >= endTime) break;
      
      const driftX = (Math.random() - 0.5) * 8;
      const driftY = (Math.random() - 0.5) * 8;
      await this.page.mouse.move(this.mouse.x + driftX, this.mouse.y + driftY);
    }
  }

  async simulateDistraction() {
    const distractionType = Math.random();
    
    if (distractionType < 0.4) {
      await this.page.keyboard.press('Alt+Tab');
      await new Promise(r => setTimeout(r, 1500 + Math.random() * 4000));
      await this.page.keyboard.press('Alt+Tab');
    } else if (distractionType < 0.7) {
      await this.page.mouse.move(
        this.mouse.x + (Math.random() - 0.5) * 200,
        this.mouse.y + (Math.random() - 0.5) * 150
      );
      await new Promise(r => setTimeout(r, 2000 + Math.random() * 3000));
    } else {
      await this.naturalScroll(-1, 0.3);
      await new Promise(r => setTimeout(r, 1000 + Math.random() * 2000));
      await this.naturalScroll(1, 0.3);
    }
  }

  async typeLikeHuman(selector, text) {
    await this.page.click(selector);
    await new Promise(r => setTimeout(r, 250 + Math.random() * 350));
    
    const bursts = this.splitIntoBursts(text);
    
    for (const burst of bursts) {
      for (const char of burst) {
        let delay = this.profile.typingSpeed * (0.7 + Math.random() * 0.6);
        
        if (!/[a-zA-Z0-9]/.test(char)) delay *= 1.5;
        if (/[A-Z]/.test(char)) delay *= 1.3;
        
        if (Math.random() > 0.995) {
          const wrongKey = String.fromCharCode(char.charCodeAt(0) + (Math.random() > 0.5 ? 1 : -1));
          await this.page.keyboard.press(wrongKey);
          await new Promise(r => setTimeout(r, 100 + Math.random() * 150));
          await this.page.keyboard.press('Backspace');
          await new Promise(r => setTimeout(r, 80 + Math.random() * 120));
        }
        
        await this.page.keyboard.press(char);
        await new Promise(r => setTimeout(r, delay));
      }
      
      if (Math.random() > 0.6) {
        await new Promise(r => setTimeout(r, 150 + Math.random() * 1 + Math.random() * 0.5);
      const tremorY = this.noise(i * 0.1 + 100) * this.profile.jitter * (1 + Math.random() * 0.5);
      
      const baseX = this.x + (targetX - this.x) * smoothT;
      const baseY = this.y + (targetY - this.y) * smoothT;
      
      const arcOffset = Math.sin(t * Math.PI) * this.profile.curveBias * 40;
      
      let overshootX = 0, overshootY = 0;
      if (t > 0.82 && t < 0.98) {
        overshootX = (Math.random() - 0.5) * this.profile.overshoot * 1.5;
        overshootY = (Math.random() - 0.5) * this.profile.overshoot * 1.5;
      }
      
      const accelCurve = Math.sin(t * Math.PI) * 0.3 + 0.7;
      
      await this.page.mouse.move(
        baseX + tremorX + arcOffset + overshootX,
        baseY + tremorY + (arcOffset * 0.3) + overshootY
      );
      
      await new Promise(r => setTimeout(r, (16 + (Math.random() - 0.5) * 6) * accelCurve));
    }
    
    if (Math.random() > 0.5) {
      await new Promise(r => setTimeout(r, this.profile.hesitation * (0.2 + Math.random() * 0.3)));
      await this.page.mouse.move(
        targetX + (Math.random() - 0.5) * 3, 
        targetY + (Math.random() - 0.5) * 3
      );
    }
    
    this.x = targetX;
    this.y = targetY;
  }

  async click(element, options = {}) {
    const box = await element.boundingBox();
    if (!box) return false;
    
    const offsetX = (Math.random() - 0.5) * box.width * 0.35;
    const offsetY = (Math.random() - 0.5) * box.height * 0.35;
    const targetX = box.x + box.width/2 + offsetX;
    const targetY = box.y + box.height/2 + offsetY;
    
    const approachAngle = Math.random() * Math.PI * 2;
    const approachDist = 100 + Math.random() * 80;
    
    await this.moveTo(
      targetX + Math.cos(approachAngle) * approachDist,
      targetY + Math.sin(approachAngle) * approachDist,
      { targetSize: 120 }
    );
    
    await new Promise(r => setTimeout(r, this.profile.hesitation * (0.4 + Math.random() * 0.4)));
    
    const microAdjustments = Math.floor(Math.random() * 2) + 1;
    for (let i = 0; i < microAdjustments; i++) {
      await this.moveTo(
        targetX + (Math.random() - 0.5) * 10,
        targetY + (Math.random() - 0.5) * 10,
        { targetSize: 30 }
      );
      await new Promise(r => setTimeout(r, 50 + Math.random() * 100));
    }
    
    await this.moveTo(targetX, targetY, { targetSize: 15 });
    await new Promise(r => setTimeout(r, 60 + Math.random() * 120));
    
    await this.page.mouse.move(targetX + (Math.random() - 0.5) * 2, targetY + (Math.random() - 0.5) * 2);
    await new Promise(r => setTimeout(r, 20 + Math.random() * 40));
    
    await this.page.mouse.down({ button: 'left' });
    await new Promise(r => setTimeout(r, 80 + Math.random() * 100));
    await this.page.mouse.up({ button: 'left' });
    
    await new Promise(r => setTimeout(r, 150 + Math.random() * 250));
    
    if (Math.random() > 0.3) {
      await this.page.mouse.move(
        this.x + (Math.random() - 0.5) * 15,
        this.y + (Math.random() - 0.5) * 15
      );
    }
    
    return true;
  }
}

class SessionBehavior {
  constructor(page, profileId = 0) {
    this.page = page;
    this.mouse = new HardwareMouse(page, profileId);
    this.profile = HUMAN_PROFILES[profileId % 3];
    this.startTime = Date.now();
    this.interactionCount = 0;
  }

  async naturalWarmup() {
    const patterns = [
      async () => {
        await this.randomIdle(2000, 4000);
        await this.naturalScroll(2 + Math.floor(Math.random() * 3));
        await this.randomHover();
        await this.randomIdle(800, 1500);
      },
      async () => {
        await this.randomIdle(1500, 3000);
        await this.randomHover();
        await this.naturalScroll(1);
        await this.randomIdle(500, 1200);
        await this.randomHover();
      },
      async () => {
        await this.naturalScroll(3);
        await this.randomIdle(1000, 2000);
        await this.simulateReading();
      }
    ];
    
    const pattern = patterns[Math.floor(Math.random() * patterns.length)];
    await pattern();
    
    if (Math.random() > 0.6) {
      await this.simulateDistraction();
    }
  }

  async naturalScroll(direction = 1, intensity = 1) {
    const baseAmount = 150 + Math.random() * 250;
    const scrollAmount = baseAmount * direction * intensity;
    const steps = 8 + Math.floor(Math.random() * 12);
    
    for (let i = 0; i < steps; i++) {
      const stepScroll = (scrollAmount / steps) * (0.8 + Math.random() * 0.4);
      await this.page.mouse.wheel(0, stepScroll);
      
      const pauseChance = 0.15 + (i / steps) * 0.2;
      if (Math.random() < pauseChance) {
        await new Promise(r => setTimeout(r, 200 + Math.random() * 600));
      } else {
        await new Promise(r => setTimeout(r, 30 + Math.random() * 80));
      }
    }
  }

  async randomHover() {
    const elements = await this.page.$$('button, a, input, h1, h2, h3, label, div[role="button"]');
    if (elements.length === 0) return;
    
    const weights = elements.map((_, i) => 1 / (i + 1));
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    let random = Math.random() * totalWeight;
    
    let selectedIndex = 0;
    for (let i = 0; i < weights.length; i++) {
      random -= weights[i];
      if (random <= 0) {
        selectedIndex = i;
        break;
      }
    }
    
    const target = elements[selectedIndex];
    const box = await target.boundingBox();
    if (!box) return;
    
    await this.mouse.moveTo(box.x + box.width/2, box.y + box.height/2);
    await new Promise(r => setTimeout(r, 600 + Math.random() * 1400));
    
    if (Math.random() > 0.7) {
      await this.page.mouse.move(
        box.x + box.width/2 + (Math.random() - 0.5) * 30,
        box.y + box.height/2 + (Math.random() - 0.5) * 20
      );
      await new Promise(r => setTimeout(r, 300 + Math.random() * 500));
    }
  }

  async simulateReading() {
    const readTime = 3000 + Math.random() * 4000;
    const endTime = Date.now() + readTime;
    
    while (Date.now() < endTime) {
      await new Promise(r => setTimeout(r, 400 + Math.random() * 800));
      
      const action = Math.random();
      if (action < 0.3) {
        await this.page.mouse.move(
          this.mouse.x + (Math.random() - 0.5) * 100,
          this.mouse.y + (Math.random() - 0.5) * 50
        );
      } else if (action < 0.5) {
        await this.naturalScroll(1, 0.5);
      }
    }
  }

  async randomIdle(min, max) {
    const duration = min + Math.random() * (max - min);
    const endTime = Date.now() + duration;
    
    while (Date.now() < endTime) {
      const remaining = endTime - Date.now();
      const nextPause = Math.min(500 + Math.random() * 1000, remaining);
      
      await new Promise(r => setTimeout(r, nextPause));
      
      if (Date.now() >= endTime) break;
      
      const driftX = (Math.random() - 0.5) * 8;
      const driftY = (Math.random() - 0.5) * 8;
      await this.page.mouse.move(this.mouse.x + driftX, this.mouse.y + driftY);
    }
  }

  async simulateDistraction() {
    const distractionType = Math.random();
    
    if (distractionType < 0.4) {
      await this.page.keyboard.press('Alt+Tab');
      await new Promise(r => setTimeout(r, 1500 + Math.random() * 4000));
      await this.page.keyboard.press('Alt+Tab');
    } else if (distractionType < 0.7) {
      await this.page.mouse.move(
        this.mouse.x + (Math.random() - 0.5) * 200,
        this.mouse.y + (Math.random() - 0.5) * 150
      );
      await new Promise(r => setTimeout(r, 2000 + Math.random() * 3000));
    } else {
      await this.naturalScroll(-1, 0.3);
      await new Promise(r => setTimeout(r, 1000 + Math.random() * 2000));
      await this.naturalScroll(1, 0.3);
    }
  }

  async typeLikeHuman(selector, text) {
    await this.page.click(selector);
    await new Promise(r => setTimeout(r, 250 + Math.random() * 350));
    
    const bursts = this.splitIntoBursts(text);
    
    for (const burst of bursts) {
      for (const char of burst) {
        let delay = this.profile.typingSpeed * (0.7 + Math.random() * 0.6);
        
        if (!/[a-zA-Z0-9]/.test(char)) delay *= 1.5;
        if (/[A-Z]/.test(char)) delay *= 1.3;
        
        if (Math.random() > 0.995) {
          const wrongKey = String.fromCharCode(char.charCodeAt(0) + (Math.random() > 0.5 ? 1 : -1));
          await this.page.keyboard.press(wrongKey);
          await new Promise(r => setTimeout(r, 100 + Math.random() * 150));
          await this.page.keyboard.press('Backspace');
          await new Promise(r => setTimeout(r, 80 + Math.random() * 120));
        }
        
        await this.page.keyboard.press(char);
        await new Promise(r => setTimeout(r, delay));
      }
      
      if (Math.random() > 0.6) {
        await new Promise(r => setTimeout(r, 150 + Math.random() * 400));
      }
    }
    
    await new Promise(r => setTimeout(r, 300 + Math.random() * 500));
  }

  splitIntoBursts(text) {
    const bursts = [];
    let current = '';
    
    for (let i = 0; i < text.length; i++) {
      current += text[i];
      
      if (current.length >= 3 && Math.random() > 0.7) {
        bursts.push(current);
        current = '';
      }
    }
    
    if (current) bursts.push(current);
    return bursts;
  }
}

class VisualAnalyzer {
  async analyzeImage(imageBuffer) {
    try {
      const img = await loadImage(imageBuffer);
      const canvas = createCanvas(img.width, img.height);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      
      const imageData = ctx.getImageData(0, 0, img.width, img.height);
      const data = imageData.data;
      
      const objects = this.segmentObjects(data, img.width, img.height);
      
      return this.findAnomaly(objects);
    } catch (e) {
      return null;
    }
  }

  segmentObjects(data, width, height) {
    const objects = [];
    const visited = new Set();
    
    for (let y = 0; y < height; y += 4) {
      for (let x = 0; x < width; x += 4) {
        const idx = (y * width + x) * 4;
        const key = `${x},${y}`;
        
        if (visited.has(key)) continue;
        
        const color = {
          r: data[idx],
          g: data[idx + 1],
          b: data[idx + 2]
        };
        
        const object = this.floodFill(data, width, height, x, y, color, visited);
        if (object.size > 100) objects.push(object);
      }
    }
    
    return objects;
  }

  floodFill(data, width, height, startX, startY, targetColor, visited) {
    const stack = [[startX, startY]];
    const pixels = [];
    let minX = startX, maxX = startX, minY = startY, maxY = startY;
    
    while (stack.length > 0) {
      const [x, y] = stack.pop();
      const key = `${x},${y}`;
      
      if (visited.has(key) || x < 0 || x >= width || y < 0 || y >= height) continue;
      
      const idx = (y * width + x) * 4;
      const r = data[idx], g = data[idx + 1], b = data[idx + 2];
      
      if (!this.colorSimilar({r, g, b}, targetColor, 30)) continue;
      
      visited.add(key);
      pixels.push({x, y, r, g, b});
      
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      
      stack.push([x+4, y], [x-4, y], [x, y+4], [x, y-4]);
    }
    
    return {
      size: pixels.length,
      bounds: { minX, maxX, minY, maxY },
      center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
      color: targetColor,
      pixels: pixels
    };
  }

  colorSimilar(c1, c2, threshold) {
    return Math.abs(c1.r - c2.r) < threshold &&
           Math.abs(c1.g - c2.g) < threshold &&
           Math.abs(c1.b - c2.b) < threshold;
  }

  findAnomaly(objects) {
    if (objects.length < 2) return null;
    
    const colorGroups = {};
    objects.forEach(obj => {
      const key = `${Math.round(obj.color.r/20)},${Math.round(obj.color.g/20)},${Math.round(obj.color.b/20)}`;
      if (!colorGroups[key]) colorGroups[key] = [];
      colorGroups[key].push(obj);
    });
    
    const groups = Object.values(colorGroups);
    if (groups.length < 2) return null;
    
    groups.sort((a, b) => a.length - b.length);
    
    if (groups[0].length === 1 && groups[1].length > 2) {
      return groups[0][0].center;
    }
    
    const avgSize = objects.reduce((sum, obj) => sum + obj.size, 0) / objects.length;
    const sizeOutlier = objects.find(obj => Math.abs(obj.size - avgSize) > avgSize * 0.5);
    
    if (sizeOutlier) return sizeOutlier.center;
    
    return null;
  }
}

class CaptchaSolver {
  constructor(page, session) {
    this.page = page;
    this.session = session;
    this.mouse = session.mouse;
    this.visualAnalyzer = new VisualAnalyzer();
    this.attemptCount = 0;
    this.maxAttempts = 5;
  }

  async solve(frame) {
    this.attemptCount = 0;
    
    while (this.attemptCount < this.maxAttempts) {
      const type = await this.detectType(frame);
      await this.session.randomIdle(1000, 2500);
      
      let result = false;
      
      switch(type) {
        case 'text':
          result = await this.solveTextChallenge(frame);
          break;
        case 'visual_different':
          result = await this.solveVisualDifferent(frame);
          break;
        case 'image_grid':
          result = await this.solveImageGrid(frame);
          break;
        case 'checkbox':
          result = await this.solveCheckbox(frame);
          break;
        default:
          result = await this.solveGeneric(frame);
      }
      
      if (result) return true;
      
      this.attemptCount++;
      await this.session.randomIdle(2000, 4000);
    }
    
    return false;
  }

  async detectType(frame) {
    const prompt = await frame.evaluate(() => {
      const selectors = [
        '.prompt-text', '.challenge-text', '.hcaptcha-challenge-text',
        '.task-description', 'h2', 'h3', '.text'
      ];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el?.textContent?.length > 5) return el.textContent.trim();
      }
      return '';
    });
    
    const lower = prompt.toLowerCase();
    
    if (lower.includes('andere') || lower.includes('different') || 
        lower.includes('anders') || lower.includes('odd one')) {
      return 'visual_different';
    }
    
    if (lower.includes('click') && (lower.includes('image') || lower.includes('picture'))) {
      return 'image_grid';
    }
    
    if (await frame.$('input[type="text"]')) return 'text';
    if (await frame.$('#checkbox, .checkbox, [type="checkbox"]')) return 'checkbox';
    
    return 'unknown';
  }

  async solveVisualDifferent(frame) {
    const images = await frame.$$('.task-image, .challenge-image, .tile, canvas, img');
    
    if (images.length === 0) return false;
    
    const imageData = [];
    
    for (let i = 0; i < images.length; i++) {
      const box = await images[i].boundingBox();
      if (!box) continue;
      
      await this.mouse.moveTo(box.x + box.width/2, box.y + box.height/2);
      await new Promise(r => setTimeout(r, 400 + Math.random() * 500));
      
      try {
        const screenshot = await images[i].screenshot();
        const analysis = await this.visualAnalyzer.analyzeImage(screenshot);
        
        imageData.push({
          index: i,
          element: images[i],
          box: box,
          analysis: analysis
        });
      } catch (e) {
        imageData.push({ index: i, element: images[i], box: box, analysis: null });
      }
    }
    
    let target = null;
    
    const analyzed = imageData.filter(d => d.analysis);
    if (analyzed.length > 0) {
      target = analyzed.find(d => d.analysis)?.element;
    }
    
    if (!target && imageData.length > 0) {
      const randomChoice = imageData[Math.floor(Math.random() * imageData.length)];
      target = randomChoice.element;
    }
    
    if (target) {
      await this.mouse.click(target);
      await new Promise(r => setTimeout(r, 800 + Math.random() * 600));
    }
    
    await this.clickSubmit(frame);
    return await this.checkResult(frame);
  }

  async solveImageGrid(frame) {
    const cells = await frame.$$('.tile, .grid-cell, .task-image, [role="button"]');
    
    const toSelect = Math.min(Math.floor(Math.random() * 2) + 2, cells.length);
    const selected = new Set();
    
    while (selected.size < toSelect && selected.size < cells.length) {
      const idx = Math.floor(Math.pow(Math.random(), 1.5) * cells.length);
      if (!selected.has(idx)) {
        selected.add(idx);
        
        const box = await cells[idx].boundingBox();
        if (box) {
          await this.mouse.moveTo(box.x + box.width/2, box.y + box.height/2);
          await new Promise(r => setTimeout(r, 300 + Math.random() * 400));
          await this.mouse.click(cells[idx]);
          await new Promise(r => setTimeout(r, 500 + Math.random() * 300));
        }
      }
    }
    
    await this.clickSubmit(frame);
    return await this.checkResult(frame);
  }

  async solveTextChallenge(frame) {
    const question = await frame.evaluate(() => {
      const el = document.querySelector('.prompt-text, .challenge-text, h2, h3, .question');
      return el ? el.textContent.trim() : '';
    });
    
    const readTime = question.length * this.session.profile.readingSpeed + Math.random() * 800;
    await new Promise(r => setTimeout(r, readTime));
    
    const answer = this.computeAnswer(question);
    
    const input = await frame.$('input[type="text"], textarea');
    if (input) {
      await this.mouse.click(input);
      await this.session.typeLikeHuman('input[type="text"]', answer);
    } else {
      const buttons = await frame.$$('button, [role="button"]');
      const targetText = answer.toLowerCase();
      
      for (const btn of buttons) {
        const text = await btn.evaluate(el => el.textContent?.trim().toLowerCase());
        if (text === targetText || text === (targetText === 'yes' ? 'ja' : 'nein')) {
          await this.mouse.click(btn);
          break;
        }
      }
    }
    
    await new Promise(r => setTimeout(r, 600 + Math.random() * 1000));
    await this.clickSubmit(frame);
    return await this.checkResult(frame);
  }

  computeAnswer(question) {
    const lower = question.toLowerCase();
    
    const knowledgeBase = [
      { patterns: ['carp', 'karpfen', 'fish'], category: 'animal' },
      { patterns: ['sugar', 'zucker'], category: 'food' },
      { patterns: ['carnivore', 'fleischfresser'], category: 'animal' },
      { patterns: ['drug', 'droge'], category: 'substance' },
      { patterns: ['rock', 'stein'], category: 'mineral' },
      { patterns: ['tree', 'baum'], category: 'plant' }
    ];
    
    const detected = [];
    knowledgeBase.forEach(item => {
      if (item.patterns.some(p => lower.includes(p))) {
        detected.push(item);
      }
    });
    
    if (detected.length >= 2) {
      const categories = detected.map(d => d.category);
      const unique = [...new Set(categories)];
      
      if (unique.length > 1) {
        if (detected.some(d => d.category === 'animal') && 
            detected.some(d => ['food', 'substance', 'mineral'].includes(d.category))) {
          return lower.includes('ja') || lower.includes('nein') ? 'nein' : 'no';
        }
      }
    }
    
    if (lower.includes('can') || lower.includes('darf') || lower.includes('may') || 
        lower.includes('allowed') || lower.includes('eat') || lower.includes('fressen')) {
      const negative = lower.includes('not') || lower.includes('kein') || lower.includes('nicht') ||
                       lower.includes('without') || lower.includes('ohne');
      if (negative) return lower.includes('ja') ? 'nein' : 'no';
      return lower.includes('ja') ? 'ja' : 'yes';
    }
    
    if (lower.includes('is') || lower.includes('ist') || lower.includes('are')) {
      if (detected.length >= 2 && detected[0].category !== detected[1].category) {
        return lower.includes('ja') ? 'nein' : 'no';
      }
    }
    
    return lower.includes('ja') ? 'ja' : 'yes';
  }

  async solveCheckbox(frame) {
    const checkbox = await frame.$('#checkbox, .checkbox, [type="checkbox"]');
    if (checkbox) {
      await this.mouse.click(checkbox);
      await new Promise(r => setTimeout(r, 2000 + Math.random() * 3000));
    }
    return await this.checkResult(frame);
  }

  async solveGeneric(frame) {
    const elements = await frame.$$('div, span, img, button, [role="button"]');
    const visible = [];
    
    for (const el of elements.slice(0, 15)) {
      const box = await el.boundingBox();
      if (box && box.width > 40 && box.height > 40) visible.push(el);
    }
    
    const toClick = Math.min(Math.floor(Math.random() * 2) + 2, visible.length);
    for (let i = 0; i < toClick; i++) {
      const idx = Math.floor(Math.random() * visible.length);
      await this.mouse.click(visible[idx]);
      await new Promise(r => setTimeout(r, 400 + Math.random() * 400));
    }
    
    await this.clickSubmit(frame);
    return await this.checkResult(frame);
  }

  async clickSubmit(frame) {
    const selectors = [
      'button[type="submit"]', '.submit-button', '.verify-button',
      'button:has-text("Verify")', 'button:has-text("Submit")',
      'button:has-text("Check")', 'button:has-text("Weiter")',
      'button:has-text("Prüfen")', 'button:has-text("Continue")'
    ];
    
    for (const sel of selectors) {
      try {
        const btn = await frame.$(sel);
        if (btn) {
          await this.mouse.click(btn);
          return;
        }
      } catch (e) {}
    }
  }

  async checkResult(frame) {
    await new Promise(r => setTimeout(r, 3500 + Math.random() * 2500));
    
    const stillThere = await frame.evaluate(() => {
      return !!document.querySelector('.hcaptcha-challenge, .challenge-container, .challenge');
    });
    
    return !stillThere;
  }
}

module.exports = { HardwareMouse, SessionBehavior, CaptchaSolver, VisualAnalyzer };
