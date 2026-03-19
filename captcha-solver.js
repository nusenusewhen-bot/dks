const axios = require('axios');

function log(msg) {
  console.log(`[CAPTCHA] ${msg}`);
}

class UltimateCaptchaSolver {
  constructor() {
    this.challengeTypes = {
      IMAGE_CLASSIFICATION: 'image_classification',
      PUZZLE_DRAG: 'puzzle_drag',
      PUZZLE_SLIDE: 'puzzle_slide',
      LOGICAL_QUESTION: 'logical_question',
      SPATIAL_REASONING: 'spatial_reasoning'
    };
  }

  async solve(frame, page) {
    const challengeType = await this.detectChallengeType(frame);
    log(`Type: ${challengeType}`);

    switch(challengeType) {
      case this.challengeTypes.IMAGE_CLASSIFICATION:
        return await this.solveImageClassification(frame);
      case this.challengeTypes.PUZZLE_DRAG:
        return await this.solvePuzzleDrag(frame, page);
      case this.challengeTypes.PUZZLE_SLIDE:
        return await this.solvePuzzleSlide(frame, page);
      case this.challengeTypes.LOGICAL_QUESTION:
        return await this.solveLogicalQuestion(frame);
      case this.challengeTypes.SPATIAL_REASONING:
        return await this.solveSpatialReasoning(frame, page);
      default:
        return await this.solveGeneric(frame, page);
    }
  }

  async detectChallengeType(frame) {
    const prompt = await frame.evaluate(() => {
      const selectors = [
        '.prompt-text',
        '.challenge-text',
        '.hcaptcha-challenge-text',
        '.task-description',
        '[data-testid="challenge-prompt"]',
        'h2',
        'h3',
        '.text'
      ];
      
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el && el.textContent.length > 10) {
          return el.textContent;
        }
      }
      return '';
    });

    const lower = prompt.toLowerCase();
    log(`Prompt: ${prompt.slice(0, 100)}`);

    if (lower.includes('drag') && lower.includes('piece')) {
      return this.challengeTypes.PUZZLE_DRAG;
    }
    if (lower.includes('slide') || (lower.includes('drag') && lower.includes('slider'))) {
      return this.challengeTypes.PUZZLE_SLIDE;
    }
    if (lower.includes('which') || lower.includes('what') || lower.includes('doesn\'t') || lower.includes('without') || lower.includes('choose')) {
      return this.challengeTypes.LOGICAL_QUESTION;
    }
    if (lower.includes('fill') && lower.includes('space')) {
      return this.challengeTypes.SPATIAL_REASONING;
    }
    if (lower.includes('click') || lower.includes('select') || lower.includes('images') || lower.includes('pictures')) {
      return this.challengeTypes.IMAGE_CLASSIFICATION;
    }
    
    return this.challengeTypes.IMAGE_CLASSIFICATION;
  }

  async solveImageClassification(frame) {
    log('Solving image classification...');
    
    // Try multiple selector strategies
    const selectors = [
      '.task-image',
      '.challenge-image',
      '.h-captcha-image',
      '.tile',
      '[data-testid="challenge-image"]',
      'img[src*="hcaptcha"]',
      '.grid img',
      '.images img',
      '[class*="image"]',
      '[class*="tile"]',
      'div[role="button"]',
      '.box',
      '.item'
    ];

    let images = [];
    
    for (const selector of selectors) {
      images = await frame.$$(selector);
      if (images.length > 0) {
        log(`Found ${images.length} images with selector: ${selector}`);
        break;
      }
    }

    if (images.length === 0) {
      // Ultimate fallback - get all clickable elements
      log('Using fallback click strategy');
      const clickable = await frame.$$('div, span, img, [role="button"], button, [tabindex]');
      
      // Filter visible elements
      const visible = [];
      for (const el of clickable.slice(0, 20)) {
        const box = await el.boundingBox();
        if (box && box.width > 50 && box.height > 50) {
          visible.push(el);
        }
      }
      
      log(`Found ${visible.length} visible clickable elements`);
      
      // Click 2-4 random elements
      const toClick = Math.min(Math.floor(Math.random() * 3) + 2, visible.length);
      for (let i = 0; i < toClick; i++) {
        const idx = Math.floor(Math.random() * visible.length);
        await visible[idx].click();
        await new Promise(r => setTimeout(r, 600 + Math.random() * 600));
      }
    } else {
      // Click 2-4 random images
      const toClick = Math.min(Math.floor(Math.random() * 3) + 2, images.length);
      log(`Clicking ${toClick} images`);
      
      for (let i = 0; i < toClick; i++) {
        const idx = Math.floor(Math.random() * images.length);
        await images[idx].click();
        await new Promise(r => setTimeout(r, 700 + Math.random() * 500));
      }
    }

    await this.clickVerify(frame);
    return await this.checkSuccess(frame);
  }

  async solvePuzzleDrag(frame, page) {
    log('Solving puzzle drag...');
    
    const selectors = [
      '.puzzle-piece',
      '.drag-piece',
      '.draggable',
      '.piece',
      '[draggable="true"]',
      '.tile',
      '.block'
    ];

    let pieces = [];
    for (const selector of selectors) {
      pieces = await frame.$$(selector);
      if (pieces.length > 0) {
        log(`Found ${pieces.length} pieces with: ${selector}`);
        break;
      }
    }

    const targetSelectors = [
      '.drop-zone',
      '.puzzle-slot',
      '.target-zone',
      '.slot',
      '.target',
      '[class*="drop"]',
      '[class*="target"]'
    ];

    let targets = [];
    for (const selector of targetSelectors) {
      targets = await frame.$$(selector);
      if (targets.length > 0) break;
    }

    log(`Pieces: ${pieces.length}, Targets: ${targets.length}`);

    for (let i = 0; i < Math.min(pieces.length, targets.length); i++) {
      const pieceBox = await pieces[i].boundingBox();
      const targetBox = await targets[i]?.boundingBox();
      
      if (pieceBox && targetBox) {
        await this.performDrag(frame, pieceBox, targetBox);
        await new Promise(r => setTimeout(r, 600 + Math.random() * 600));
      }
    }

    await this.clickVerify(frame);
    return await this.checkSuccess(frame);
  }

  async solvePuzzleSlide(frame, page) {
    log('Solving slider...');
    
    const sliderSelectors = ['.slider', '.puzzle-slider', '.handle', '.knob', '[class*="slider"]'];
    const trackSelectors = ['.slider-track', '.track', '.rail', '.bar', '[class*="track"]'];

    let slider = null;
    let track = null;

    for (const sel of sliderSelectors) {
      slider = await frame.$(sel);
      if (slider) break;
    }

    for (const sel of trackSelectors) {
      track = await frame.$(sel);
      if (track) break;
    }
    
    if (!slider || !track) {
      log('Slider elements not found');
      return false;
    }

    const sliderBox = await slider.boundingBox();
    const trackBox = await track.boundingBox();

    if (!sliderBox || !trackBox) return false;

    const distance = trackBox.width - sliderBox.width;
    log(`Sliding ${distance}px`);
    
    await this.performSlide(frame, sliderBox, distance);
    
    await this.clickVerify(frame);
    return await this.checkSuccess(frame);
  }

  async performSlide(frame, startBox, distance) {
    const startX = startBox.x + startBox.width / 2;
    const startY = startBox.y + startBox.height / 2;
    const endX = startX + distance;
    
    await frame.evaluate(({x, y}) => {
      const el = document.elementFromPoint(x, y);
      if (el) {
        el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: x, clientY: y }));
      }
    }, { x: startX, y: startY });

    await new Promise(r => setTimeout(r, 150 + Math.random() * 200));

    const steps = 25;
    for (let i = 0; i <= steps; i++) {
      const progress = i / steps;
      const eased = 1 - Math.pow(1 - progress, 3);
      const currentX = startX + (distance * eased);
      
      await frame.evaluate(({x, y}) => {
        const el = document.elementFromPoint(x, y);
        if (el) {
          el.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: x, clientY: y }));
        }
      }, { x: currentX, y: startY });

      await new Promise(r => setTimeout(r, 15 + Math.random() * 25));
    }

    await frame.evaluate(({x, y}) => {
      const el = document.elementFromPoint(x, y);
      if (el) {
        el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: x, clientY: y }));
      }
    }, { x: endX, y: startY });
  }

  async solveLogicalQuestion(frame) {
    log('Solving logical question...');
    
    const question = await frame.evaluate(() => {
      const selectors = ['.prompt-text', '.question-text', 'h2', 'h3', '.challenge-text', '.text'];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el && el.textContent.length > 10) return el.textContent;
      }
      return '';
    });

    log(`Question: ${question}`);
    
    const answer = this.parseLogicalQuestion(question);
    
    const optionSelectors = [
      '.option',
      '.answer-option',
      '.choice',
      '[role="button"]',
      'button',
      '.tile',
      '.box',
      '.item',
      'div[tabindex]'
    ];

    let options = [];
    for (const sel of optionSelectors) {
      options = await frame.$$(sel);
      if (options.length >= 2) {
        log(`Found ${options.length} options with: ${sel}`);
        break;
      }
    }
    
    for (const option of options) {
      const text = await option.evaluate(el => el.textContent.toLowerCase());
      
      if (this.matchesAnswer(text, answer)) {
        log(`Clicking answer: ${text.slice(0, 30)}`);
        await option.click();
        await new Promise(r => setTimeout(r, 600 + Math.random() * 600));
        break;
      }
    }

    await this.clickVerify(frame);
    return await this.checkSuccess(frame);
  }

  parseLogicalQuestion(question) {
    const lower = question.toLowerCase();
    
    if ((lower.includes('legs') || lower.includes('leg')) && 
        (lower.includes('doesn\'t') || lower.includes('without') || lower.includes('no ') || lower.includes('none'))) {
      return { type: 'animal', feature: 'no_legs', examples: ['snake', 'fish', 'worm', 'eel', 'jellyfish', 'whale', 'dolphin'] };
    }
    
    if (lower.includes('fly') && (lower.includes('can\'t') || lower.includes('cannot') || lower.includes('doesn\'t'))) {
      return { type: 'animal', feature: 'no_fly', examples: ['penguin', 'ostrich', 'chicken', 'kiwi', 'emu'] };
    }
    
    if (lower.includes('swim') && (lower.includes('can\'t') || lower.includes('cannot'))) {
      return { type: 'animal', feature: 'no_swim', examples: ['elephant', 'giraffe', 'kangaroo', 'monkey', 'human'] };
    }
    
    if (lower.includes('living') || lower.includes('alive') || lower.includes('life')) {
      return { type: 'object', feature: 'non_living', examples: ['rock', 'car', 'table', 'chair', 'computer', 'phone', 'book'] };
    }

    if (lower.includes('eat') || lower.includes('food')) {
      return { type: 'object', feature: 'no_eat', examples: ['rock', 'paper', 'plastic', 'metal', 'stone'] };
    }

    if (lower.includes('breathe') || lower.includes('breath')) {
      return { type: 'object', feature: 'no_breathe', examples: ['rock', 'car', 'table', 'water', 'sand'] };
    }

    return { type: 'unknown', feature: 'unknown', examples: [] };
  }

  matchesAnswer(text, answer) {
    if (!text || !answer.examples) return false;
    
    for (const example of answer.examples) {
      if (text.includes(example)) return true;
    }
    return false;
  }

  async solveSpatialReasoning(frame, page) {
    log('Solving spatial reasoning...');
    
    const pieceSelectors = [
      '.available-piece',
      '.draggable-piece',
      '.piece',
      '.block',
      '.tile',
      '[draggable="true"]'
    ];

    const cellSelectors = [
      '.grid-cell',
      '.pattern-cell',
      '.cell',
      '.slot',
      '.space',
      '.empty',
      '[class*="cell"]'
    ];

    let pieces = [];
    let cells = [];

    for (const sel of pieceSelectors) {
      pieces = await frame.$$(sel);
      if (pieces.length > 0) break;
    }

    for (const sel of cellSelectors) {
      cells = await frame.$$(sel);
      if (cells.length > 0) break;
    }

    log(`Pieces: ${pieces.length}, Cells: ${cells.length}`);
    
    for (let i = 0; i < Math.min(pieces.length, cells.length); i++) {
      const pieceBox = await pieces[i].boundingBox();
      const cellBox = await cells[i].boundingBox();
      
      if (pieceBox && cellBox) {
        await this.performDrag(frame, pieceBox, cellBox);
        await new Promise(r => setTimeout(r, 600 + Math.random() * 600));
      }
    }

    await this.clickVerify(frame);
    return await this.checkSuccess(frame);
  }

  async performDrag(frame, from, to) {
    await frame.evaluate(({fromX, fromY, toX, toY}) => {
      const startEl = document.elementFromPoint(fromX, fromY);
      if (startEl) {
        startEl.dispatchEvent(new MouseEvent('mousedown', { 
          bubbles: true, 
          clientX: fromX, 
          clientY: fromY,
          button: 0
        }));
      }
      
      const steps = 15;
      for (let i = 1; i <= steps; i++) {
        const x = fromX + (toX - fromX) * (i / steps);
        const y = fromY + (toY - fromY) * (i / steps);
        document.dispatchEvent(new MouseEvent('mousemove', { 
          bubbles: true, 
          clientX: x, 
          clientY: y 
        }));
      }
      
      const endEl = document.elementFromPoint(toX, toY);
      if (endEl) {
        endEl.dispatchEvent(new MouseEvent('mouseup', { 
          bubbles: true, 
          clientX: toX, 
          clientY: toY,
          button: 0
        }));
        endEl.dispatchEvent(new MouseEvent('click', { 
          bubbles: true, 
          clientX: toX, 
          clientY: toY 
        }));
      }
    }, {
      fromX: from.x + from.width/2,
      fromY: from.y + from.height/2,
      toX: to.x + to.width/2,
      toY: to.y + to.height/2
    });
  }

  async clickVerify(frame) {
    await new Promise(r => setTimeout(r, 1000 + Math.random() * 1000));
    
    const verifySelectors = [
      '.button-submit',
      '.submit-button',
      '[type="submit"]',
      '.verify-button',
      '.check-button',
      'button:has-text("Verify")',
      'button:has-text("Submit")',
      'button:has-text("Check")',
      '.button:has-text("Go")',
      '[class*="submit"]',
      '[class*="verify"]'
    ];

    let verifyBtn = null;
    for (const sel of verifySelectors) {
      verifyBtn = await frame.$(sel);
      if (verifyBtn) {
        log(`Found verify button: ${sel}`);
        break;
      }
    }

    if (verifyBtn) {
      await verifyBtn.click();
    } else {
      // Try clicking by coordinates (bottom center of challenge)
      const box = await frame.boundingBox();
      if (box) {
        await frame.evaluate(({x, y}) => {
          const el = document.elementFromPoint(x, y);
          if (el) el.click();
        }, { x: box.x + box.width/2, y: box.y + box.height - 50 });
      }
    }
  }

  async checkSuccess(frame) {
    await new Promise(r => setTimeout(r, 4000 + Math.random() * 2000));
    
    const stillThere = await frame.evaluate(() => {
      const indicators = [
        '.hcaptcha-challenge',
        '.challenge-container',
        '.challenge',
        '.h-captcha',
        '.task-image',
        '.puzzle-piece',
        '[class*="challenge"]'
      ];
      
      for (const sel of indicators) {
        if (document.querySelector(sel)) return true;
      }
      return false;
    });
    
    const success = !stillThere;
    log(success ? 'Challenge completed!' : 'Still on challenge');
    return success;
  }

  async solveGeneric(frame, page) {
    log('Using generic solver...');
    
    // Click random interactive elements
    const elements = await frame.$$('div, span, img, button, [role="button"], [tabindex]');
    const visible = [];
    
    for (const el of elements.slice(0, 15)) {
      const box = await el.boundingBox();
      if (box && box.width > 40 && box.height > 40) {
        visible.push(el);
      }
    }
    
    const toClick = Math.min(Math.floor(Math.random() * 3) + 2, visible.length);
    for (let i = 0; i < toClick; i++) {
      const idx = Math.floor(Math.random() * visible.length);
      await visible[idx].click();
      await new Promise(r => setTimeout(r, 500 + Math.random() * 500));
    }
    
    await this.clickVerify(frame);
    return await this.checkSuccess(frame);
  }
}

module.exports = {
  UltimateCaptchaSolver,
  solve: async (frame, page) => {
    const solver = new UltimateCaptchaSolver();
    return await solver.solve(frame, page);
  }
};
