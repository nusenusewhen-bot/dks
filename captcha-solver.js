const sharp = require('sharp');
const axios = require('axios');

// Local log function to avoid scope issues
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
      const text = document.querySelector('.prompt-text, .challenge-text, .hcaptcha-challenge-text')?.textContent || '';
      return text.toLowerCase();
    });

    if (prompt.includes('drag') && prompt.includes('piece')) {
      return this.challengeTypes.PUZZLE_DRAG;
    }
    if (prompt.includes('slide') || (prompt.includes('drag') && prompt.includes('slider'))) {
      return this.challengeTypes.PUZZLE_SLIDE;
    }
    if (prompt.includes('which') || prompt.includes('what') || prompt.includes('doesn\'t') || prompt.includes('without')) {
      return this.challengeTypes.LOGICAL_QUESTION;
    }
    if (prompt.includes('fill') && prompt.includes('space')) {
      return this.challengeTypes.SPATIAL_REASONING;
    }
    if (prompt.includes('click') || prompt.includes('select') || prompt.includes('images')) {
      return this.challengeTypes.IMAGE_CLASSIFICATION;
    }
    
    return this.challengeTypes.IMAGE_CLASSIFICATION;
  }

  async solveImageClassification(frame) {
    const images = await frame.$$('.task-image, .challenge-image, [data-index]');
    log(`Found ${images.length} images`);
    
    for (let i = 0; i < images.length; i++) {
      await new Promise(r => setTimeout(r, 800 + Math.random() * 700));
      
      if (Math.random() > 0.5) {
        await images[i].click();
        await new Promise(r => setTimeout(r, 300 + Math.random() * 300));
      }
    }

    await this.clickVerify(frame);
    return await this.checkSuccess(frame);
  }

  async solvePuzzleDrag(frame, page) {
    log('Solving puzzle drag...');
    
    const pieces = await frame.$$('.puzzle-piece, .drag-piece, .draggable, .piece');
    log(`${pieces.length} pieces found`);
    
    for (const piece of pieces) {
      const targets = await frame.$$('.drop-zone, .puzzle-slot, .target-zone, .slot');
      if (targets.length > 0) {
        const pieceBox = await piece.boundingBox();
        const targetBox = await targets[0].boundingBox();
        
        if (pieceBox && targetBox) {
          await this.performDrag(frame, pieceBox, targetBox);
          await new Promise(r => setTimeout(r, 500 + Math.random() * 500));
        }
      }
    }

    await this.clickVerify(frame);
    return await this.checkSuccess(frame);
  }

  async solvePuzzleSlide(frame, page) {
    log('Solving slider...');
    
    const slider = await frame.$('.slider, .puzzle-slider');
    const track = await frame.$('.slider-track, .track');
    
    if (!slider || !track) {
      log('Slider elements not found');
      return false;
    }

    const sliderBox = await slider.boundingBox();
    const trackBox = await track.boundingBox();

    if (!sliderBox || !trackBox) return false;

    const distance = trackBox.width - sliderBox.width;
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

    await new Promise(r => setTimeout(r, 100 + Math.random() * 200));

    const steps = 20;
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

      await new Promise(r => setTimeout(r, 20 + Math.random() * 30));
    }

    await frame.evaluate(({x, y}) => {
      const el = document.elementFromPoint(x, y);
      if (el) {
        el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: x, clientY: y }));
      }
    }, { x: endX, y: startY });
  }

  async solveLogicalQuestion(frame) {
    const question = await frame.evaluate(() => {
      return document.querySelector('.prompt-text, .question-text')?.textContent || '';
    });

    log(`Question: ${question}`);
    
    const answer = this.parseLogicalQuestion(question);
    const options = await frame.$$('.option, .answer-option, .choice, [role="button"]');
    
    for (const option of options) {
      const text = await option.evaluate(el => el.textContent.toLowerCase());
      
      if (this.matchesAnswer(text, answer)) {
        await option.click();
        await new Promise(r => setTimeout(r, 500 + Math.random() * 500));
        break;
      }
    }

    await this.clickVerify(frame);
    return await this.checkSuccess(frame);
  }

  parseLogicalQuestion(question) {
    const lower = question.toLowerCase();
    
    if (lower.includes('legs') && (lower.includes('doesn\'t') || lower.includes('without') || lower.includes('no '))) {
      return { type: 'animal', feature: 'no_legs', examples: ['snake', 'fish', 'worm', 'eel'] };
    }
    
    if (lower.includes('fly') && (lower.includes('can\'t') || lower.includes('cannot'))) {
      return { type: 'animal', feature: 'no_fly', examples: ['penguin', 'ostrich', 'chicken', 'kiwi'] };
    }
    
    if (lower.includes('living') || lower.includes('alive')) {
      return { type: 'object', feature: 'non_living', examples: ['rock', 'car', 'table', 'chair'] };
    }

    return { type: 'unknown', feature: 'unknown', examples: [] };
  }

  matchesAnswer(text, answer) {
    for (const example of answer.examples) {
      if (text.includes(example)) return true;
    }
    return false;
  }

  async solveSpatialReasoning(frame, page) {
    log('Spatial reasoning...');
    
    const pieces = await frame.$$('.available-piece, .draggable-piece, .piece');
    const cells = await frame.$$('.grid-cell, .pattern-cell, .cell');
    
    for (let i = 0; i < Math.min(pieces.length, cells.length); i++) {
      const pieceBox = await pieces[i].boundingBox();
      const cellBox = await cells[i].boundingBox();
      
      if (pieceBox && cellBox) {
        await this.performDrag(frame, pieceBox, cellBox);
        await new Promise(r => setTimeout(r, 500 + Math.random() * 500));
      }
    }

    await this.clickVerify(frame);
    return await this.checkSuccess(frame);
  }

  async performDrag(frame, from, to) {
    await frame.evaluate(({fromX, fromY, toX, toY}) => {
      const startEl = document.elementFromPoint(fromX, fromY);
      if (startEl) {
        startEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: fromX, clientY: fromY }));
      }
      
      const steps = 10;
      for (let i = 1; i <= steps; i++) {
        const x = fromX + (toX - fromX) * (i / steps);
        const y = fromY + (toY - fromY) * (i / steps);
        document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: x, clientY: y }));
      }
      
      const endEl = document.elementFromPoint(toX, toY);
      if (endEl) {
        endEl.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: toX, clientY: toY }));
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
    const verify = await frame.$('.button-submit, .submit-button, [type="submit"]');
    if (verify) await verify.click();
  }

  async checkSuccess(frame) {
    await new Promise(r => setTimeout(r, 3000 + Math.random() * 2000));
    const stillThere = await frame.evaluate(() => {
      return !!document.querySelector('.hcaptcha-challenge, .challenge-container, .challenge');
    });
    return !stillThere;
  }

  async solveGeneric(frame, page) {
    const interactive = await frame.$$('button, [role="button"], .clickable');
    if (interactive.length > 0) {
      const random = interactive[Math.floor(Math.random() * interactive.length)];
      await random.click();
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
