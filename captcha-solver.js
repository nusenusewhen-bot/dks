const axios = require('axios');
const tf = require('@tensorflow/tfjs-node');
const sharp = require('sharp');
const fs = require('fs').promises;
const path = require('path');
const { createCanvas, loadImage } = require('canvas');

class AdvancedHCaptchaSolver {
  constructor(config = {}) {
    this.config = {
      modelPath: config.modelPath || './models/hcaptcha-model',
      confidenceThreshold: config.confidenceThreshold || 0.65,
      maxRetries: config.maxRetries || 3,
      useExternalAPI: config.useExternalAPI || false,
      apiKey: config.apiKey || null,
      apiProvider: config.apiProvider || '2captcha', // 2captcha, anticaptcha, capsolver
      ...config
    };
    
    this.model = null;
    this.sessionCache = new Map();
    this.solvedChallenges = new Set();
    this.requestHistory = [];
    this.classLabels = [
      'car', 'bicycle', 'fire_hydrant', 'traffic_light', 
      'crosswalk', 'stair', 'bridge', 'palm_tree', 
      'chimney', 'tractor'
    ];
    
    this.init();
  }

  async init() {
    try {
      await this.initModel();
      await this.loadTrainingData();
      console.log('[CAPTCHA] Solver initialized');
    } catch (e) {
      console.log('[CAPTCHA] Init error:', e.message);
    }
  }

  async initModel() {
    try {
      // Try to load existing model
      this.model = await tf.loadLayersModel(`file://${this.config.modelPath}/model.json`);
      console.log('[CAPTCHA] Loaded existing model');
    } catch {
      // Create advanced CNN architecture
      this.model = this.createAdvancedModel();
      console.log('[CAPTCHA] Created new model');
    }
  }

  createAdvancedModel() {
    const model = tf.sequential();

    // Input layer with batch normalization
    model.add(tf.layers.batchNormalization({
      inputShape: [224, 224, 3]
    }));

    // Block 1: Conv + BN + ReLU + MaxPool
    model.add(tf.layers.conv2d({
      filters: 64,
      kernelSize: 7,
      strides: 2,
      padding: 'same',
      kernelInitializer: 'heNormal'
    }));
    model.add(tf.layers.batchNormalization());
    model.add(tf.layers.activation({ activation: 'relu' }));
    model.add(tf.layers.maxPooling2d({ poolSize: 3, strides: 2, padding: 'same' }));

    // Block 2: Residual-like block
    this.addResidualBlock(model, 64, 64);
    this.addResidualBlock(model, 64, 128, true);

    // Block 3: Deeper convolutions
    this.addResidualBlock(model, 128, 128);
    this.addResidualBlock(model, 128, 256, true);

    // Block 4: Feature extraction
    this.addResidualBlock(model, 256, 256);
    this.addResidualBlock(model, 256, 512, true);

    // Global pooling and dense layers
    model.add(tf.layers.globalAveragePooling2d());
    model.add(tf.layers.dense({ units: 1024, kernelInitializer: 'heNormal' }));
    model.add(tf.layers.batchNormalization());
    model.add(tf.layers.activation({ activation: 'relu' }));
    model.add(tf.layers.dropout({ rate: 0.5 }));

    model.add(tf.layers.dense({ units: 512, kernelInitializer: 'heNormal' }));
    model.add(tf.layers.batchNormalization());
    model.add(tf.layers.activation({ activation: 'relu' }));
    model.add(tf.layers.dropout({ rate: 0.3 }));

    // Output layer
    model.add(tf.layers.dense({
      units: 10,
      activation: 'softmax',
      kernelInitializer: 'heNormal'
    }));

    // Advanced optimizer with learning rate scheduling
    const optimizer = tf.train.adam(0.0001, 0.9, 0.999, 1e-7);
    
    model.compile({
      optimizer: optimizer,
      loss: 'categoricalCrossentropy',
      metrics: ['accuracy', tf.metrics.topKCategoricalAccuracy]
    });

    return model;
  }

  addResidualBlock(model, inFilters, outFilters, downsample = false) {
    const strides = downsample ? 2 : 1;
    
    // Main path
    model.add(tf.layers.conv2d({
      filters: outFilters,
      kernelSize: 3,
      strides: strides,
      padding: 'same',
      kernelInitializer: 'heNormal',
      useBias: false
    }));
    model.add(tf.layers.batchNormalization());
    model.add(tf.layers.activation({ activation: 'relu' }));
    
    model.add(tf.layers.conv2d({
      filters: outFilters,
      kernelSize: 3,
      padding: 'same',
      kernelInitializer: 'heNormal',
      useBias: false
    }));
    model.add(tf.layers.batchNormalization());

    // Skip connection handled by adding input before final activation
    // Note: In real implementation, need to handle skip connections properly
    
    model.add(tf.layers.activation({ activation: 'relu' }));
  }

  async loadTrainingData() {
    try {
      const dataPath = './training_data';
      const files = await fs.readdir(dataPath).catch(() => []);
      
      if (files.length > 0) {
        console.log(`[CAPTCHA] Found ${files.length} training samples`);
        // Could implement online learning here
      }
    } catch (e) {}
  }

  // Advanced image preprocessing pipeline
  async preprocessImage(imageBuffer, options = {}) {
    const {
      targetSize = 224,
      enhance = true,
      augment = false
    } = options;

    try {
      let pipeline = sharp(imageBuffer)
        .resize(targetSize, targetSize, { 
          fit: 'cover',
          position: 'center'
        });

      if (enhance) {
        pipeline = pipeline
          .normalize()
          .modulate({
            brightness: 1.0 + (Math.random() * 0.2 - 0.1),
            saturation: 1.1,
            contrast: 1.05
          })
          .sharpen({
            sigma: 1.2,
            m1: 0.5,
            m2: 0.5,
            x1: 2,
            y2: 10,
            y3: 20
          });
      }

      if (augment) {
        // Random augmentation for training
        const angle = Math.random() * 10 - 5;
        pipeline = pipeline.rotate(angle);
        
        if (Math.random() > 0.5) {
          pipeline = pipeline.flop();
        }
      }

      const processed = await pipeline
        .removeAlpha()
        .raw()
        .toBuffer();

      // Convert to tensor and normalize
      const tensor = tf.tensor3d(new Uint8Array(processed), [targetSize, targetSize, 3]);
      
      // ImageNet normalization
      const mean = tf.tensor1d([0.485, 0.456, 0.406]);
      const std = tf.tensor1d([0.229, 0.224, 0.225]);
      
      const normalized = tf.div(tf.sub(tf.div(tensor, 255), mean), std);
      
      mean.dispose();
      std.dispose();
      tensor.dispose();
      
      return normalized;

    } catch (e) {
      throw new Error(`Preprocessing failed: ${e.message}`);
    }
  }

  // Multi-scale object detection
  async detectObjectsMultiScale(imageBuffer, targetClass) {
    const scales = [1.0, 0.8, 0.6, 0.5, 0.4];
    const detections = [];
    const image = await loadImage(imageBuffer);
    
    for (const scale of scales) {
      const scaledSize = Math.floor(224 * scale);
      
      // Create scaled version
      const canvas = createCanvas(scaledSize, scaledSize);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(image, 0, 0, scaledSize, scaledSize);
      
      const buffer = canvas.toBuffer('image/png');
      
      // Sliding window detection
      const windowSize = Math.floor(224 * 0.5);
      const stride = Math.floor(windowSize * 0.5);
      
      for (let y = 0; y < scaledSize - windowSize; y += stride) {
        for (let x = 0; x < scaledSize - windowSize; x += stride) {
          const windowCanvas = createCanvas(224, 224);
          const windowCtx = windowCanvas.getContext('2d');
          
          // Extract window and resize to 224x224
          const windowBuffer = await sharp(buffer)
            .extract({ left: x, top: y, width: windowSize, height: windowSize })
            .resize(224, 224)
            .raw()
            .toBuffer();
          
          const tensor = tf.div(tf.tensor3d(new Uint8Array(windowBuffer), [224, 224, 3]), 255);
          const prediction = this.model.predict(tensor.expandDims(0));
          const probs = prediction.softmax().dataSync();
          const predictedClass = prediction.argMax(-1).dataSync()[0];
          const confidence = probs[predictedClass];
          
          if (predictedClass === targetClass && confidence > this.config.confidenceThreshold) {
            detections.push({
              x: x / scale,
              y: y / scale,
              width: windowSize / scale,
              height: windowSize / scale,
              confidence,
              scale
            });
          }
          
          tensor.dispose();
          prediction.dispose();
        }
      }
    }
    
    // Non-maximum suppression
    return this.nms(detections, 0.3);
  }

  nms(detections, iouThreshold) {
    // Sort by confidence
    detections.sort((a, b) => b.confidence - a.confidence);
    
    const suppressed = new Set();
    const result = [];
    
    for (let i = 0; i < detections.length; i++) {
      if (suppressed.has(i)) continue;
      
      result.push(detections[i]);
      
      for (let j = i + 1; j < detections.length; j++) {
        if (suppressed.has(j)) continue;
        
        const iou = this.calculateIoU(detections[i], detections[j]);
        if (iou > iouThreshold) {
          suppressed.add(j);
        }
      }
    }
    
    return result;
  }

  calculateIoU(box1, box2) {
    const x1 = Math.max(box1.x, box2.x);
    const y1 = Math.max(box1.y, box2.y);
    const x2 = Math.min(box1.x + box1.width, box2.x + box2.width);
    const y2 = Math.min(box1.y + box1.height, box2.y + box2.height);
    
    const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
    const area1 = box1.width * box1.height;
    const area2 = box2.width * box2.height;
    const union = area1 + area2 - intersection;
    
    return intersection / union;
  }

  // Main solve function
  async solve(page, options = {}) {
    const {
      timeout = 120000,
      waitForChallenge = true,
      useAudioFallback = true
    } = options;

    const startTime = Date.now();
    
    try {
      console.log('[CAPTCHA] Starting solve process...');
      
      // Check for captcha iframe
      const iframe = await page.waitForSelector('iframe[src*="hcaptcha"]', { 
        timeout: 10000 
      }).catch(() => null);
      
      if (!iframe) {
        console.log('[CAPTCHA] No captcha found');
        return { success: false, error: 'No captcha found' };
      }

      // Get iframe handle
      const frame = await iframe.contentFrame();
      if (!frame) {
        return { success: false, error: 'Cannot access iframe' };
      }

      // Check if already solved (checkbox only)
      const checkbox = await frame.$('#checkbox');
      const isChecked = await frame.evaluate(() => {
        return document.querySelector('#checkbox')?.getAttribute('aria-checked') === 'true';
      });

      if (isChecked) {
        return { success: true, method: 'already_solved' };
      }

      // Click checkbox to start
      await this.simulateHumanClick(frame, '#checkbox');
      console.log('[CAPTCHA] Clicked checkbox');
      
      await this.randomDelay(2000, 4000);

      // Wait for challenge iframe
      let challengeFrame = null;
      let attempts = 0;
      
      while (!challengeFrame && attempts < 10) {
        challengeFrame = await page.$('iframe[src*="challenge"]').catch(() => null);
        if (!challengeFrame) {
          await this.randomDelay(500, 1000);
          attempts++;
        }
      }

      if (!challengeFrame) {
        // No challenge appeared - might be solved already
        const stillChecked = await frame.evaluate(() => {
          return document.querySelector('#checkbox')?.getAttribute('aria-checked') === 'true';
        });
        
        if (stillChecked) {
          return { success: true, method: 'checkbox_only' };
        }
        
        return { success: false, error: 'Challenge did not load' };
      }

      // Get challenge content
      const challengeContent = await challengeFrame.contentFrame();
      
      // Extract challenge data
      const challengeData = await this.extractChallengeData(challengeContent);
      console.log(`[CAPTCHA] Challenge: ${challengeData.prompt}`);
      console.log(`[CAPTCHA] Images: ${challengeData.images.length}`);

      // Parse target
      const targetClass = this.parsePromptAdvanced(challengeData.prompt);
      console.log(`[CAPTCHA] Target class: ${targetClass} (${this.classLabels[targetClass]})`);

      // Solve challenge
      const solution = await this.solveImageChallenge(
        challengeContent, 
        challengeData.images, 
        targetClass
      );

      if (!solution.success && useAudioFallback) {
        console.log('[CAPTCHA] Trying audio fallback...');
        return await this.solveAudioChallenge(challengeContent);
      }

      // Verify solution
      await this.randomDelay(2000, 4000);
      
      const stillThere = await page.$('iframe[src*="challenge"]').catch(() => null);
      const success = !stillThere || solution.success;

      if (success) {
        this.solvedChallenges.add(challengeData.challengeId);
        return { 
          success: true, 
          method: 'image_classification',
          confidence: solution.avgConfidence,
          time: Date.now() - startTime
        };
      }

      // Retry if failed
      if (solution.attempt < this.config.maxRetries) {
        console.log('[CAPTCHA] Retrying...');
        return this.solve(page, { ...options, timeout: timeout - (Date.now() - startTime) });
      }

      return { success: false, error: 'Max retries exceeded' };

    } catch (e) {
      console.error('[CAPTCHA] Solve error:', e.message);
      return { success: false, error: e.message };
    }
  }

  async extractChallengeData(frame) {
    return await frame.evaluate(() => {
      const promptEl = document.querySelector('.prompt-text') || 
                      document.querySelector('.challenge-text');
      const prompt = promptEl?.textContent || '';
      
      const images = Array.from(document.querySelectorAll('.task-image, .challenge-image'))
        .map(el => {
          const img = el.querySelector('img');
          return img?.src || el.style.backgroundImage?.replace(/url\(["']?/, '').replace(/["']?\)/, '');
        })
        .filter(Boolean);
      
      const challengeId = document.querySelector('[data-challenge-id]')?.dataset?.challengeId ||
                         Math.random().toString(36).substring(7);
      
      return { prompt, images, challengeId };
    });
  }

  async solveImageChallenge(frame, imageUrls, targetClass) {
    const selectedIndices = [];
    let avgConfidence = 0;
    
    for (let i = 0; i < imageUrls.length; i++) {
      try {
        console.log(`[CAPTCHA] Analyzing image ${i + 1}/${imageUrls.length}...`);
        
        const imageBuffer = await this.downloadImage(imageBuffer);
        
        // Try multiple analysis methods
        const result = await this.analyzeImageEnsemble(imageBuffer, targetClass);
        
        if (result.shouldSelect) {
          selectedIndices.push(i);
          avgConfidence += result.confidence;
          
          // Click the image
          const selector = `.task-image:nth-child(${i + 1}), [data-index="${i}"]`;
          await this.simulateHumanClick(frame, selector);
          await this.randomDelay(300, 800);
        }
        
      } catch (e) {
        console.log(`[CAPTCHA] Image ${i} analysis failed:`, e.message);
      }
    }

    if (selectedIndices.length > 0) {
      avgConfidence /= selectedIndices.length;
    }

    // Click verify
    await this.randomDelay(500, 1500);
    await this.simulateHumanClick(frame, '.button-submit, .submit-button, [type="submit"]');
    
    return {
      success: selectedIndices.length > 0,
      selectedIndices,
      avgConfidence,
      attempt: 1
    };
  }

  async analyzeImageEnsemble(imageBuffer, targetClass) {
    const results = [];

    // Method 1: CNN classification
    try {
      const cnnResult = await this.classifyWithCNN(imageBuffer, targetClass);
      results.push({ ...cnnResult, weight: 0.4 });
    } catch (e) {}

    // Method 2: Multi-scale detection
    try {
      const detectionResult = await this.detectObjectsMultiScale(imageBuffer, targetClass);
      const hasDetection = detectionResult.length > 0;
      results.push({
        shouldSelect: hasDetection,
        confidence: hasDetection ? Math.max(...detectionResult.map(d => d.confidence)) : 0,
        weight: 0.4
      });
    } catch (e) {}

    // Method 3: Edge/shape analysis for specific classes
    if ([0, 1, 2, 3].includes(targetClass)) { // Vehicles and street objects
      try {
        const shapeResult = await this.analyzeShape(imageBuffer, targetClass);
        results.push({ ...shapeResult, weight: 0.2 });
      } catch (e) {}
    }

    // Weighted ensemble
    let totalWeight = 0;
    let weightedConfidence = 0;
    let shouldSelectVotes = 0;

    for (const result of results) {
      totalWeight += result.weight;
      weightedConfidence += result.confidence * result.weight;
      if (result.shouldSelect) shouldSelectVotes += result.weight;
    }

    const finalConfidence = weightedConfidence / totalWeight;
    const finalDecision = shouldSelectVotes / totalWeight > 0.5;

    return {
      shouldSelect: finalDecision,
      confidence: finalConfidence
    };
  }

  async classifyWithCNN(imageBuffer, targetClass) {
    const tensor = await this.preprocessImage(imageBuffer);
    const prediction = this.model.predict(tensor.expandDims(0));
    const probs = prediction.softmax().dataSync();
    
    const predictedClass = prediction.argMax(-1).dataSync()[0];
    const targetConfidence = probs[targetClass];
    const maxConfidence = Math.max(...probs);
    
    tensor.dispose();
    prediction.dispose();

    return {
      shouldSelect: predictedClass === targetClass && targetConfidence > this.config.confidenceThreshold,
      confidence: targetConfidence
    };
  }

  async analyzeShape(imageBuffer, targetClass) {
    // Simple shape analysis using edge detection
    const edges = await sharp(imageBuffer)
      .greyscale()
      .convolve({
        width: 3,
        height: 3,
        kernel: [-1, -1, -1, -1, 8, -1, -1, -1, -1]
      })
      .raw()
      .toBuffer();

    // Count edge pixels
    let edgePixels = 0;
    for (let i = 0; i < edges.length; i++) {
      if (edges[i] > 50) edgePixels++;
    }

    const edgeDensity = edgePixels / edges.length;

    // Different classes have different expected edge densities
    const expectedDensities = {
      0: 0.15, // car
      1: 0.2,  // bicycle
      2: 0.1,  // fire hydrant
      3: 0.08  // traffic light
    };

    const expected = expectedDensities[targetClass] || 0.15;
    const diff = Math.abs(edgeDensity - expected);

    return {
      shouldSelect: diff < 0.05,
      confidence: 1 - (diff * 10)
    };
  }

  parsePromptAdvanced(prompt) {
    const lower = prompt.toLowerCase();
    
    // Extended keyword matching
    const keywords = {
      0: ['car', 'vehicle', 'automobile', 'truck', 'bus', 'van', 'suv', 'sedan', 'auto', 'motor vehicle', 'cars', 'vehicles'],
      1: ['bicycle', 'bike', 'motorcycle', 'scooter', 'two wheeler', 'pedal bike', 'mountain bike', 'bicycles', 'bikes'],
      2: ['fire hydrant', 'hydrant', 'fire plug', 'water hydrant', 'fire hydrants', 'hydrants'],
      3: ['traffic light', 'stop light', 'signal', 'traffic signal', 'stoplight', 'traffic lights', 'signals'],
      4: ['crosswalk', 'pedestrian crossing', 'zebra crossing', 'crossing', 'walkway', 'crosswalks'],
      5: ['stair', 'stairs', 'staircase', 'steps', 'stairway', 'escalator', 'staircases'],
      6: ['bridge', 'overpass', 'viaduct', 'crossing', 'bridges'],
      7: ['palm tree', 'tree', 'palm', 'areca', 'coconut tree', 'palm trees', 'trees'],
      8: ['chimney', 'smokestack', 'flue', 'vent', 'chimneys'],
      9: ['tractor', 'farm vehicle', 'bulldozer', 'harvester', 'farm equipment', 'tractors']
    };

    for (const [classIdx, words] of Object.entries(keywords)) {
      for (const word of words) {
        if (lower.includes(word)) {
          return parseInt(classIdx);
        }
      }
    }

    // Default fallback based on prompt analysis
    if (lower.includes('vehicle') || lower.includes('transport')) return 0;
    if (lower.includes('wheel')) return 1;
    if (lower.includes('water') || lower.includes('fire')) return 2;
    if (lower.includes('light')) return 3;
    if (lower.includes('walk') || lower.includes('pedestrian')) return 4;
    if (lower.includes('up') || lower.includes('down') || lower.includes('climb')) return 5;
    if (lower.includes('cross') || lower.includes('over')) return 6;
    if (lower.includes('plant') || lower.includes('green')) return 7;
    if (lower.includes('smoke') || lower.includes('roof')) return 8;
    if (lower.includes('farm') || lower.includes('agriculture')) return 9;

    return 0; // Default to car
  }

  async solveAudioChallenge(frame) {
    try {
      // Click audio button
      const audioBtn = await frame.$('#audio-button, .audio-button, [aria-label*="audio"]');
      if (!audioBtn) {
        return { success: false, error: 'Audio button not found' };
      }

      await audioBtn.click();
      await this.randomDelay(2000, 3000);

      // Get audio source
      const audioSrc = await frame.evaluate(() => {
        const audio = document.querySelector('audio');
        return audio?.src;
      });

      if (!audioSrc) {
        return { success: false, error: 'Audio source not found' };
      }

      // Download audio
      const audioBuffer = await this.downloadImage(audioSrc);

      // Transcribe using external API or local model
      // This would integrate with speech-to-text service
      const transcript = await this.transcribeAudio(audioBuffer);

      if (!transcript) {
        return { success: false, error: 'Audio transcription failed' };
      }

      // Enter transcript
      const input = await frame.$('input[type="text"], .audio-input');
      if (input) {
        await input.type(transcript);
        await this.randomDelay(500, 1000);
      }

      // Submit
      await this.simulateHumanClick(frame, '.button-submit');

      return { success: true, method: 'audio' };

    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  async transcribeAudio(audioBuffer) {
    // Placeholder - would integrate with:
    // - OpenAI Whisper API
    // - Google Speech-to-Text
    // - Local Whisper model
    
    // For now, return null to indicate manual solve needed
    return null;
  }

  // Utility functions
  async simulateHumanClick(frame, selector) {
    const element = await frame.$(selector);
    if (!element) return false;

    const box = await element.boundingBox();
    if (!box) return false;

    // Human-like movement
    const x = box.x + 5 + Math.random() * (box.width - 10);
    const y = box.y + 5 + Math.random() * (box.height - 10);

    await frame.evaluate(({ x, y }) => {
      const element = document.elementFromPoint(x, y);
      if (element) {
        element.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
        element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      }
    }, { x, y });

    return true;
  }

  randomDelay(min, max) {
    return new Promise(r => setTimeout(r, min + Math.random() * (max - min)));
  }

  async downloadImage(url) {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
        'Referer': 'https://discord.com/'
      }
    });
    return Buffer.from(response.data, 'binary');
  }

  // External API integration
  async solveWithExternalAPI(page) {
    if (!this.config.useExternalAPI || !this.config.apiKey) {
      return { success: false, error: 'External API not configured' };
    }

    const providers = {
      '2captcha': this.solveWith2Captcha.bind(this),
      'anticaptcha': this.solveWithAntiCaptcha.bind(this),
      'capsolver': this.solveWithCapSolver.bind(this)
    };

    const solver = providers[this.config.apiProvider];
    if (!solver) {
      return { success: false, error: 'Unknown provider' };
    }

    return await solver(page);
  }

  async solveWith2Captcha(page) {
    // Implementation for 2captcha API
    const sitekey = await page.evaluate(() => {
      return document.querySelector('[data-sitekey]')?.dataset?.sitekey || 
             'f5561ba9-8f1e-40ca-9b5b-a0b3f719ef34';
    });

    const pageUrl = page.url();

    // Submit task
    const submitRes = await axios.get('https://2captcha.com/in.php', {
      params: {
        key: this.config.apiKey,
        method: 'hcaptcha',
        sitekey: sitekey,
        pageurl: pageUrl,
        json: 1,
        invisible: 0
      }
    });

    if (submitRes.data.status !== 1) {
      throw new Error(`2captcha submit failed: ${submitRes.data.request}`);
    }

    const taskId = submitRes.data.request;

    // Poll for result
    for (let i = 0; i < 60; i++) {
      await this.randomDelay(5000, 6000);

      const res = await axios.get('https://2captcha.com/res.php', {
        params: {
          key: this.config.apiKey,
          action: 'get',
          id: taskId,
          json: 1
        }
      });

      if (res.data.status === 1) {
        // Inject token
        await page.evaluate((token) => {
          const inputs = document.querySelectorAll('textarea[name="h-captcha-response"], input[name="h-captcha-response"]');
          inputs.forEach(input => input.value = token);
          
          if (window.hcaptcha) {
            window.hcaptcha.setResponse(token);
          }
          
          // Trigger callback if exists
          if (window.hcaptchaCallback) {
            window.hcaptchaCallback(token);
          }
        }, res.data.request);

        return { success: true, method: '2captcha', token: res.data.request };
      }

      if (res.data.request === 'CAPCHA_NOT_READY') {
        continue;
      }

      throw new Error(`2captcha error: ${res.data.request}`);
    }

    throw new Error('2captcha timeout');
  }

  async solveWithAntiCaptcha(page) {
    // Similar implementation for Anti-Captcha
    return { success: false, error: 'Not implemented' };
  }

  async solveWithCapSolver(page) {
    // Similar implementation for CapSolver
    return { success: false, error: 'Not implemented' };
  }

  // Training methods for improving model
  async trainOnFeedback(challengeId, wasCorrect, correctIndices) {
    if (!this.solvedChallenges.has(challengeId)) return;

    // Store feedback for future training
    const feedback = {
      challengeId,
      wasCorrect,
      correctIndices,
      timestamp: Date.now()
    };

    await fs.appendFile(
      './training_feedback.jsonl',
      JSON.stringify(feedback) + '\n'
    ).catch(() => {});
  }

  // Save model
  async saveModel() {
    if (!this.model) return;
    
    await fs.mkdir('./models', { recursive: true });
    await this.model.save(`file://${this.config.modelPath}`);
    console.log('[CAPTCHA] Model saved');
  }
}

// Legacy/simple solver for backwards compatibility
class SimpleHCaptchaSolver {
  constructor() {
    this.delays = { min: 2000, max: 5000 };
  }

  async solve(page) {
    const advanced = new AdvancedHCaptchaSolver();
    return await advanced.solve(page);
  }
}

// Export
module.exports = {
  AdvancedHCaptchaSolver,
  SimpleHCaptchaSolver,
  
  // Quick solve function
  solve: async (page, options = {}) => {
    const solver = new AdvancedHCaptchaSolver(options);
    return await solver.solve(page);
  },
  
  // Create solver instance
  createSolver: (config) => new AdvancedHCaptchaSolver(config)
};
