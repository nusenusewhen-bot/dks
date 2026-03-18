const axios = require('axios');
const tf = require('@tensorflow/tfjs-node');
const sharp = require('sharp');
const fs = require('fs').promises;
const path = require('path');

class AdvancedHCaptchaSolver {
  constructor() {
    this.model = null;
    this.sessionCache = new Map();
    this.solvedChallenges = new Set();
    this.initModel();
  }

  async initModel() {
    try {
      // Load or create CNN for image classification
      this.model = await this.loadOrCreateModel();
    } catch (e) {
      console.log('[CAPTCHA] Model init failed, using fallback');
    }
  }

  async loadOrCreateModel() {
    const modelPath = './models/hcaptcha-model.json';
    try {
      return await tf.loadLayersModel(`file://${modelPath}`);
    } catch {
      // Create new model architecture
      const model = tf.sequential({
        layers: [
          tf.layers.conv2d({
            inputShape: [224, 224, 3],
            filters: 64,
            kernelSize: 3,
            activation: 'relu',
            padding: 'same'
          }),
          tf.layers.batchNormalization(),
          tf.layers.maxPooling2d({ poolSize: 2 }),
          
          tf.layers.conv2d({
            filters: 128,
            kernelSize: 3,
            activation: 'relu',
            padding: 'same'
          }),
          tf.layers.batchNormalization(),
          tf.layers.maxPooling2d({ poolSize: 2 }),
          
          tf.layers.conv2d({
            filters: 256,
            kernelSize: 3,
            activation: 'relu',
            padding: 'same'
          }),
          tf.layers.batchNormalization(),
          tf.layers.maxPooling2d({ poolSize: 2 }),
          
          tf.layers.flatten(),
          tf.layers.dense({ units: 512, activation: 'relu' }),
          tf.layers.dropout({ rate: 0.5 }),
          tf.layers.dense({ units: 256, activation: 'relu' }),
          tf.layers.dropout({ rate: 0.3 }),
          tf.layers.dense({ units: 10, activation: 'softmax' })
        ]
      });
      
      model.compile({
        optimizer: tf.train.adam(0.0001),
        loss: 'categoricalCrossentropy',
        metrics: ['accuracy']
      });
      
      return model;
    }
  }

  // Advanced image preprocessing
  async preprocessImage(imageBuffer) {
    try {
      // Resize and normalize
      const processed = await sharp(imageBuffer)
        .resize(224, 224, { fit: 'cover' })
        .normalize()
        .modulate({ brightness: 1.1, saturation: 1.2 })
        .sharpen({ sigma: 1.5, m1: 0.5, m2: 0.5 })
        .raw()
        .toBuffer();
      
      // Convert to tensor
      const tensor = tf.tensor3d(new Uint8Array(processed), [224, 224, 3]);
      return tensor.div(255.0);
    } catch (e) {
      throw new Error(`Image preprocessing failed: ${e.message}`);
    }
  }

  // Object detection using sliding window
  async detectObjects(imageBuffer, targetClass) {
    const detections = [];
    const scales = [1.0, 0.8, 0.6, 0.4];
    
    for (const scale of scales) {
      const scaledBuffer = await sharp(imageBuffer)
        .resize(Math.floor(224 * scale), Math.floor(224 * scale))
        .toBuffer();
      
      const tensor = await this.preprocessImage(scaledBuffer);
      const prediction = this.model.predict(tensor.expandDims(0));
      const classIdx = prediction.argMax(-1).dataSync()[0];
      const confidence = prediction.max(-1).dataSync()[0];
      
      if (classIdx === targetClass && confidence > 0.7) {
        detections.push({ scale, confidence, x: 0, y: 0, w: 224, h: 224 });
      }
      
      tensor.dispose();
      prediction.dispose();
    }
    
    return detections;
  }

  // Solve hCaptcha challenge
  async solve(page, sitekey = 'f5561ba9-8f1e-40ca-9b5b-a0b3f719ef34') {
    try {
      log('Starting hCaptcha solve...');
      
      // Wait for captcha iframe
      const iframe = await page.waitForSelector('iframe[src*="hcaptcha"]', { timeout: 10000 });
      if (!iframe) {
        log('No captcha iframe found');
        return false;
      }
      
      // Get iframe content
      const frame = await iframe.contentFrame();
      if (!frame) {
        log('Could not access iframe content');
        return false;
      }
      
      // Click checkbox to start challenge
      await frame.click('#checkbox');
      log('Clicked captcha checkbox');
      
      await randomDelay(2000, 4000);
      
      // Check if challenge appears
      const challengeFrame = await page.waitForSelector('iframe[src*="challenge"]', { timeout: 5000 }).catch(() => null);
      
      if (!challengeFrame) {
        // Checkbox only, no challenge
        log('Captcha solved (checkbox only)');
        return true;
      }
      
      const challengeContent = await challengeFrame.contentFrame();
      
      // Get challenge data
      const challengeData = await challengeContent.evaluate(() => {
        const prompt = document.querySelector('.prompt-text')?.textContent || '';
        const images = Array.from(document.querySelectorAll('.task-image img')).map(img => img.src);
        return { prompt, images };
      });
      
      log(`Challenge: ${challengeData.prompt}`);
      
      // Parse what to look for
      const targetClass = this.parsePrompt(challengeData.prompt);
      log(`Target class: ${targetClass}`);
      
      // Download and analyze images
      const answers = [];
      for (let i = 0; i < challengeData.images.length; i++) {
        try {
          const imgBuffer = await this.downloadImage(challengeData.images[i]);
          const detections = await this.detectObjects(imgBuffer, targetClass);
          
          if (detections.length > 0 && detections[0].confidence > 0.6) {
            answers.push(i);
          }
        } catch (e) {
          log(`Image ${i} analysis failed`);
        }
      }
      
      log(`Selected images: ${answers.join(', ')}`);
      
      // Click selected images
      for (const idx of answers) {
        const img = await challengeContent.$(`.task-image:nth-child(${idx + 1})`);
        if (img) {
          await img.click();
          await randomDelay(500, 1000);
        }
      }
      
      // Click verify
      await challengeContent.click('.button-submit');
      log('Clicked verify');
      
      await randomDelay(3000, 5000);
      
      // Check if solved
      const stillThere = await page.$('iframe[src*="challenge"]').catch(() => null);
      if (!stillThere) {
        log('Captcha solved successfully');
        return true;
      }
      
      // Try again if failed
      const errorText = await challengeContent.evaluate(() => {
        return document.querySelector('.error-text')?.textContent || '';
      });
      
      if (errorText.includes('try again')) {
        log('Captcha failed, retrying...');
        return this.solve(page, sitekey);
      }
      
      return false;
      
    } catch (e) {
      log(`Captcha solve error: ${e.message}`);
      return false;
    }
  }

  parsePrompt(prompt) {
    const classMap = {
      'car': 0, 'vehicle': 0, 'automobile': 0, 'truck': 0, 'bus': 0,
      'bicycle': 1, 'bike': 1, 'motorcycle': 1, 'scooter': 1,
      'fire hydrant': 2, 'hydrant': 2,
      'traffic light': 3, 'stop light': 3,
      'crosswalk': 4, 'pedestrian crossing': 4, 'zebra crossing': 4,
      'stair': 5, 'stairs': 5, 'staircase': 5,
      'bridge': 6, 'overpass': 6,
      'palm tree': 7, 'tree': 7, 'palm': 7,
      'chimney': 8,
      'tractor': 9, 'farm vehicle': 9
    };
    
    const lower = prompt.toLowerCase();
    for (const [key, val] of Object.entries(classMap)) {
      if (lower.includes(key)) return val;
    }
    return 0; // Default to car
  }

  async downloadImage(url) {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    return Buffer.from(response.data, 'binary');
  }

  // Alternative: Audio captcha solver using speech-to-text
  async solveAudioCaptcha(page) {
    try {
      // Click audio challenge button
      const audioBtn = await page.$('#audio-button');
      if (!audioBtn) return false;
      
      await audioBtn.click();
      await randomDelay(2000, 3000);
      
      // Download audio
      const audioSrc = await page.evaluate(() => {
        return document.querySelector('audio')?.src;
      });
      
      if (!audioSrc) return false;
      
      // Use external STT API or local whisper model
      // This requires additional setup
      log('Audio captcha detected - manual solve needed');
      return false;
      
    } catch (e) {
      return false;
    }
  }

  // Motion data generator for hCaptcha
  generateMotionData() {
    const movements = [];
    let x = 500, y = 300;
    const now = Date.now();
    
    // Generate realistic mouse path
    for (let i = 0; i < 100; i++) {
      // Add some curve to movement
      x += (Math.random() - 0.5) * 30 + Math.sin(i * 0.1) * 10;
      y += (Math.random() - 0.5) * 30 + Math.cos(i * 0.1) * 10;
      
      // Keep in bounds
      x = Math.max(0, Math.min(1920, x));
      y = Math.max(0, Math.min(1080, y));
      
      movements.push({
        x: Math.round(x),
        y: Math.round(y),
        t: now + i * 50 + Math.random() * 30,
        e: i === 0 ? 'mousedown' : i === 99 ? 'mouseup' : 'mousemove'
      });
    }
    
    return {
      st: now,
      mm: movements,
      ex: { x: Math.round(x), y: Math.round(y), t: now + 5000 },
      v: 1
    };
  }

  // Proof of work solver for hCaptcha
  solveProofOfWork(challenge) {
    // Simplified - real implementation needs wasm execution
    try {
      const { c, type } = challenge;
      if (type === 'hsw') {
        // Return base64 encoded solution
        return Buffer.from(JSON.stringify({ hsw: c, type: 'hsw' })).toString('base64');
      }
      return '';
    } catch (e) {
      return '';
    }
  }
}

// Simple fallback solver using external API
class ExternalCaptchaSolver {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://api.2captcha.com';
  }

  async solve(page) {
    try {
      // Get sitekey and pageurl
      const sitekey = await page.evaluate(() => {
        const el = document.querySelector('[data-sitekey]');
        return el?.dataset?.sitekey || 'f5561ba9-8f1e-40ca-9b5b-a0b3f719ef34';
      });
      
      const pageUrl = page.url();
      
      // Submit to 2captcha
      const submitRes = await axios.get(`${this.baseUrl}/in.php`, {
        params: {
          key: this.apiKey,
          method: 'hcaptcha',
          sitekey: sitekey,
          pageurl: pageUrl,
          json: 1
        }
      });
      
      if (submitRes.data.status !== 1) {
        throw new Error('Failed to submit captcha');
      }
      
      const captchaId = submitRes.data.request;
      
      // Poll for result
      let result = null;
      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 5000));
        
        const res = await axios.get(`${this.baseUrl}/res.php`, {
          params: {
            key: this.apiKey,
            action: 'get',
            id: captchaId,
            json: 1
          }
        });
        
        if (res.data.status === 1) {
          result = res.data.request;
          break;
        }
      }
      
      if (!result) {
        throw new Error('Captcha solve timeout');
      }
      
      // Inject token
      await page.evaluate((token) => {
        // Find hCaptcha response input and set value
        const inputs = document.querySelectorAll('input[name="h-captcha-response"]');
        inputs.forEach(input => input.value = token);
        
        // Trigger verification
        if (window.hcaptcha) {
          window.hcaptcha.setResponse(token);
        }
      }, result);
      
      return true;
      
    } catch (e) {
      console.log(`External solve failed: ${e.message}`);
      return false;
    }
  }
}

// Export combined solver
module.exports = {
  AdvancedHCaptchaSolver,
  ExternalCaptchaSolver,
  
  // Quick function for browser.js
  solveCaptcha: async (page, useExternal = false, apiKey = null) => {
    const solver = new AdvancedHCaptchaSolver();
    const result = await solver.solve(page);
    
    if (!result && useExternal && apiKey) {
      const external = new ExternalCaptchaSolver(apiKey);
      return await external.solve(page);
    }
    
    return result;
  }
};
