const sharp = require('sharp');
const axios = require('axios');
const tf = require('@tensorflow/tfjs-node');

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
    log(`Detected challenge type: ${challengeType}`);

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
    if (prompt.includes('slide') || prompt.includes('drag') && prompt.includes('slider')) {
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

  // Type 1: Image Classification (original)
  async solveImageClassification(frame) {
    const prompt = await frame.evaluate(() => {
      return document.querySelector('.prompt-text')?.textContent || '';
    });

    const targetClass = this.parseClassificationPrompt(prompt);
    const images = await frame.$$('.task-image, .challenge-image, [data-index]');
    
    log(`Found ${images.length} images for classification`);

    for (let i = 0; i < images.length; i++) {
      await randomDelay(800, 1500);
      
      const imgSrc = await images[i].evaluate(el => el.querySelector('img')?.src || el.style.backgroundImage);
      if (!imgSrc) continue;

      // Download and analyze
      const buffer = await this.downloadImage(imgSrc);
      const shouldClick = await this.analyzeImage(buffer, targetClass);
      
      if (shouldClick) {
        await images[i].click();
        await randomDelay(300, 600);
      }
    }

    await this.clickVerify(frame);
    return await this.checkSuccess(frame);
  }

  // Type 2: Puzzle Drag (drag piece to correct position)
  async solvePuzzleDrag(frame, page) {
    log('Solving puzzle drag challenge...');

    // Get puzzle elements
    const puzzleData = await frame.evaluate(() => {
      const pieces = Array.from(document.querySelectorAll('.puzzle-piece, .drag-piece, .draggable'));
      const dropZones = Array.from(document.querySelectorAll('.drop-zone, .puzzle-slot, .target-zone'));
      const board = document.querySelector('.puzzle-board, .challenge-board');
      
      return {
        pieceCount: pieces.length,
        zoneCount: dropZones.length,
        boardRect: board ? board.getBoundingClientRect() : null
      };
    });

    log(`Puzzle: ${puzzleData.pieceCount} pieces, ${puzzleData.zoneCount} zones`);

    if (puzzleData.pieceCount === 0) {
      // Try alternative selectors
      return await this.solvePuzzleDragAlternative(frame, page);
    }

    // Take screenshot for visual analysis
    const screenshot = await frame.screenshot({ type: 'png' });
    
    // Analyze puzzle layout
    const solution = await this.analyzePuzzleLayout(screenshot);
    
    // Perform drags
    for (const move of solution.moves) {
      await this.performDrag(frame, move.from, move.to);
      await randomDelay(500, 1000);
    }

    await this.clickVerify(frame);
    return await this.checkSuccess(frame);
  }

  async solvePuzzleDragAlternative(frame, page) {
    // Alternative implementation using mouse simulation
    const pieces = await frame.$$('.piece, [draggable="true"], .tile');
    
    for (let i = 0; i < pieces.length; i++) {
      const piece = pieces[i];
      const box = await piece.boundingBox();
      if (!box) continue;

      // Try dragging to center of board
      await piece.evaluate(el => {
        // Simulate drag start
        const rect = el.getBoundingClientRect();
        const event = new DragEvent('dragstart', {
          bubbles: true,
          clientX: rect.left + rect.width/2,
          clientY: rect.top + rect.height/2
        });
        el.dispatchEvent(event);
      });

      await randomDelay(200, 400);

      // Find drop target
      const targets = await frame.$$('.drop-target, .puzzle-target, .slot');
      if (targets.length > i) {
        const targetBox = await targets[i].boundingBox();
        if (targetBox) {
          await piece.evaluate((el, target) => {
            const event = new DragEvent('drop', {
              bubbles: true,
              clientX: target.x + target.width/2,
              clientY: target.y + target.height/2
            });
            el.dispatchEvent(event);
          }, targetBox);
        }
      }

      await randomDelay(300, 600);
    }

    await this.clickVerify(frame);
    return await this.checkSuccess(frame);
  }

  // Type 3: Puzzle Slide (slider captcha)
  async solvePuzzleSlide(frame, page) {
    log('Solving slider puzzle...');

    const slider = await frame.$('.slider, .puzzle-slider, [class*="slider"]');
    if (!slider) {
      log('Slider not found');
      return false;
    }

    const track = await frame.$('.slider-track, .track, [class*="track"]');
    if (!track) {
      log('Slider track not found');
      return false;
    }

    const sliderBox = await slider.boundingBox();
    const trackBox = await track.boundingBox();

    if (!sliderBox || !trackBox) {
      log('Could not get slider dimensions');
      return false;
    }

    // Calculate slide distance
    const distance = trackBox.width - sliderBox.width;
    
    // Perform slide with human-like easing
    await this.performSlide(frame, sliderBox, distance);
    
    await this.clickVerify(frame);
    return await this.checkSuccess(frame);
  }

  async performSlide(frame, startBox, distance) {
    const startX = startBox.x + startBox.width / 2;
    const startY = startBox.y + startBox.height / 2;
    const endX = startX + distance;
    
    // Move to start
    await frame.evaluate(({x, y}) => {
      const el = document.elementFromPoint(x, y);
      if (el) {
        el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: x, clientY: y }));
      }
    }, { x: startX, y: startY });

    await randomDelay(100, 300);

    // Slide with easing (slower at start and end, faster in middle)
    const steps = 20;
    for (let i = 0; i <= steps; i++) {
      const progress = i / steps;
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const currentX = startX + (distance * eased);
      
      await frame.evaluate(({x, y}) => {
        const el = document.elementFromPoint(x, y);
        if (el) {
          el.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: x, clientY: y }));
        }
      }, { x: currentX, y: startY });

      // Variable delay for human-like movement
      const delay = 20 + Math.random() * 30 + (i === 0 || i === steps ? 50 : 0);
      await new Promise(r => setTimeout(r, delay));
    }

    // Release
    await frame.evaluate(({x, y}) => {
      const el = document.elementFromPoint(x, y);
      if (el) {
        el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: x, clientY: y }));
      }
    }, { x: endX, y: startY });
  }

  // Type 4: Logical Question (which animal doesn't have legs, etc.)
  async solveLogicalQuestion(frame) {
    log('Solving logical question...');

    const question = await frame.evaluate(() => {
      return document.querySelector('.prompt-text, .question-text')?.textContent || '';
    });

    log(`Question: ${question}`);

    // Parse question type
    const answer = this.parseLogicalQuestion(question);

    // Find and click the correct option
    const options = await frame.$$('.option, .answer-option, .choice, [role="button"]');
    
    for (let i = 0; i < options.length; i++) {
      const text = await options[i].evaluate(el => el.textContent);
      
      if (this.matchesAnswer(text, answer)) {
        await options[i].click();
        await randomDelay(500, 1000);
        break;
      }
    }

    await this.clickVerify(frame);
    return await this.checkSuccess(frame);
  }

  parseLogicalQuestion(question) {
    const lower = question.toLowerCase();
    
    // Animal questions
    if (lower.includes('legs') || lower.includes('leg')) {
      if (lower.includes('doesn\'t have') || lower.includes('without') || lower.includes('no ')) {
        return { type: 'animal', feature: 'no_legs', examples: ['snake', 'fish', 'worm', 'eel', 'jellyfish'] };
      }
      if (lower.includes('most') || lower.includes('many')) {
        return { type: 'animal', feature: 'most_legs', examples: ['millipede', 'centipede', 'spider', 'crab'] };
      }
    }
    
    if (lower.includes('fly') || lower.includes('flying')) {
      if (lower.includes('can\'t') || lower.includes('cannot') || lower.includes('doesn\'t')) {
        return { type: 'animal', feature: 'no_fly', examples: ['penguin', 'ostrich', 'kiwi', 'emu', 'chicken'] };
      }
    }
    
    if (lower.includes('swim') || lower.includes('water')) {
      if (lower.includes('can\'t') || lower.includes('cannot')) {
        return { type: 'animal', feature: 'no_swim', examples: ['elephant', 'giraffe', 'kangaroo', 'monkey'] };
      }
    }

    // Object questions
    if (lower.includes('living') || lower.includes('alive')) {
      return { type: 'object', feature: 'non_living', examples: ['rock', 'car', 'table', 'chair', 'computer'] };
    }

    if (lower.includes('eat') || lower.includes('food')) {
      return { type: 'object', feature: 'no_eat', examples: ['rock', 'paper', 'plastic', 'metal'] };
    }

    // Default
    return { type: 'unknown', feature: 'unknown', examples: [] };
  }

  matchesAnswer(text, answer) {
    const lower = text.toLowerCase();
    
    for (const example of answer.examples) {
      if (lower.includes(example)) return true;
    }
    
    // Feature-based matching
    if (answer.feature === 'no_legs' && 
        (lower.includes('snake') || lower.includes('fish') || lower.includes('worm'))) {
      return true;
    }
    
    if (answer.feature === 'no_fly' && 
        (lower.includes('penguin') || lower.includes('ostrich') || lower.includes('chicken'))) {
      return true;
    }
    
    return false;
  }

  // Type 5: Spatial Reasoning (fill empty space, complete pattern)
  async solveSpatialReasoning(frame, page) {
    log('Solving spatial reasoning...');

    // Get grid/pattern layout
    const grid = await frame.evaluate(() => {
      const cells = Array.from(document.querySelectorAll('.grid-cell, .pattern-cell, .puzzle-cell'));
      const empty = cells.find(c => c.classList.contains('empty') || !c.querySelector('img, .piece'));
      return {
        totalCells: cells.length,
        emptyCellIndex: empty ? cells.indexOf(empty) : -1,
        pieces: cells.filter(c => c.querySelector('img, .piece')).length
      };
    });

    log(`Grid: ${grid.totalCells} cells, empty at ${grid.emptyCellIndex}, ${grid.pieces} pieces`);

    // Find available pieces to place
    const availablePieces = await frame.$$('.available-piece, .piece-pool .piece, .draggable-piece');
    
    if (availablePieces.length > 0 && grid.emptyCellIndex !== -1) {
      // Try each piece in the empty spot
      for (const piece of availablePieces) {
        const pieceBox = await piece.boundingBox();
        const cells = await frame.$$('.grid-cell, .pattern-cell');
        
        if (cells[grid.emptyCellIndex]) {
          const targetBox = await cells[grid.emptyCellIndex].boundingBox();
          
          if (pieceBox && targetBox) {
            await this.performDragToCoords(frame, pieceBox, targetBox);
            await randomDelay(500, 1000);
            
            // Check if solved
            const stillEmpty = await frame.evaluate(() => {
              return !!document.querySelector('.empty, .grid-cell:empty');
            });
            
            if (!stillEmpty) break;
          }
        }
      }
    }

    await this.clickVerify(frame);
    return await this.checkSuccess(frame);
  }

  // Helper methods
  async performDrag(frame, from, to) {
    await frame.evaluate(({fromX, fromY, toX, toY}) => {
      const startEl = document.elementFromPoint(fromX, fromY);
      const endEl = document.elementFromPoint(toX, toY);
      
      if (startEl) {
        startEl.dispatchEvent(new MouseEvent('mousedown', { 
          bubbles: true, 
          clientX: fromX, 
          clientY: fromY 
        }));
      }
      
      // Move with steps
      const steps = 10;
      for (let i = 1; i < steps; i++) {
        const x = fromX + (toX - fromX) * (i / steps);
        const y = fromY + (toY - fromY) * (i / steps);
        document.dispatchEvent(new MouseEvent('mousemove', { 
          bubbles: true, 
          clientX: x, 
          clientY: y 
        }));
      }
      
      if (endEl) {
        endEl.dispatchEvent(new MouseEvent('mouseup', { 
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

  async performDragToCoords(frame, fromBox, toBox) {
    await this.performDrag(frame, fromBox, toBox);
  }

  async analyzePuzzleLayout(screenshot) {
    // Simple analysis - in production use CV/ML
    return {
      moves: [{ from: {x: 0, y: 0, width: 50, height: 50}, to: {x: 100, y: 100, width: 50, height: 50} }]
    };
  }

  async analyzeImage(buffer, targetClass) {
    // Placeholder - integrate TensorFlow model
    return Math.random() > 0.5;
  }

  async clickVerify(frame) {
    await randomDelay(1000, 2000);
    const verify = await frame.$('.button-submit, .submit-button, [type="submit"]');
    if (verify) await verify.click();
  }

  async checkSuccess(frame) {
    await randomDelay(3000, 5000);
    const stillThere = await frame.evaluate(() => !!document.querySelector('.hcaptcha-challenge, .challenge-container'));
    return !stillThere;
  }

  async downloadImage(url) {
    const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 10000 });
    return Buffer.from(res.data, 'binary');
  }

  parseClassificationPrompt(prompt) {
    const keywords = {
      'car': 0, 'vehicle': 0, 'bus': 0, 'truck': 0,
      'bike': 1, 'bicycle': 1, 'motorcycle': 1,
      'hydrant': 2, 'fire hydrant': 2,
      'traffic light': 3, 'signal': 3,
      'crosswalk': 4, 'pedestrian': 4,
      'stair': 5, 'stairs': 5,
      'bridge': 6,
      'palm tree': 7, 'tree': 7,
      'chimney': 8,
      'tractor': 9
    };
    
    const lower = prompt.toLowerCase();
    for (const [key, val] of Object.entries(keywords)) {
      if (lower.includes(key)) return val;
    }
    return 0;
  }

  async solveGeneric(frame, page) {
    log('Using generic solver...');
    // Try clicking random elements that look interactive
    const interactive = await frame.$$('button, [role="button"], .clickable, .option');
    if (interactive.length > 0) {
      const random = interactive[Math.floor(Math.random() * interactive.length)];
      await random.click();
      await randomDelay(500, 1000);
    }
    await this.clickVerify(frame);
    return await this.checkSuccess(frame);
  }
}

// Export
module.exports = {
  UltimateCaptchaSolver,
  
  solve: async (frame, page) => {
    const solver = new UltimateCaptchaSolver();
    return await solver.solve(frame, page);
  }
};
