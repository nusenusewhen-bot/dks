// captcha-solver.js
const axios = require('axios');
const sharp = require('sharp');
const tf = require('@tensorflow/tfjs-node');

class HCaptchaSolver {
  constructor() {
    this.model = null;
    this.loadModel();
    this.sitekeys = {
      discord: 'f5561ba9-8f1e-40ca-9b5b-a0b3f719ef34'
    };
  }

  async loadModel() {
    // Load pre-trained object detection or create simple CNN
    try {
      this.model = await tf.loadLayersModel('file://./model/model.json');
    } catch {
      // Build simple CNN for image classification if no model exists
      this.model = tf.sequential({
        layers: [
          tf.layers.conv2d({ inputShape: [100, 100, 3], filters: 32, kernelSize: 3, activation: 'relu' }),
          tf.layers.maxPooling2d({ poolSize: 2 }),
          tf.layers.conv2d({ filters: 64, kernelSize: 3, activation: 'relu' }),
          tf.layers.maxPooling2d({ poolSize: 2 }),
          tf.layers.flatten(),
          tf.layers.dense({ units: 128, activation: 'relu' }),
          tf.layers.dropout({ rate: 0.5 }),
          tf.layers.dense({ units: 10, activation: 'softmax' }) // 10 object types
        ]
      });
      this.model.compile({ optimizer: 'adam', loss: 'categoricalCrossentropy' });
    }
  }

  async solve(requester, sitekey, rqdata = null) {
    // Step 1: Get captcha challenge
    const checksite = await axios.post('https://api2.hcaptcha.com/checksiteconfig', {
      v: '1.5.2',
      host: 'discord.com',
      sitekey: sitekey,
      sc: '1',
      swa: '1'
    }, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    const { c } = checksite.data;
    
    // Step 2: Get challenge
    const getChallenge = await axios.post('https://api2.hcaptcha.com/getcaptcha', {
      v: '1.5.2',
      host: 'discord.com',
      sitekey: sitekey,
      n: this.generateProofOfWork(c), // Bypass proof of work
      c: JSON.stringify(c),
      motionData: this.generateMotionData(),
      rqdata: rqdata || ''
    });

    const { challenge, tasklist, request_config } = getChallenge.data;
    
    // Step 3: Solve each task
    const answers = {};
    for (const task of tasklist) {
      const { task_key, datatypes, objects } = task;
      
      // Download images
      const images = await Promise.all(
        objects.map(async (obj, idx) => {
          const imgUrl = `https://imagedelivery.net/${request_config.rqdata}/${obj}/public`;
          const { data } = await axios.get(imgUrl, { responseType: 'arraybuffer' });
          return sharp(data).resize(100, 100).raw().toBuffer();
        })
      );

      // Classify images
      const predictions = images.map(img => this.classifyImage(img));
      
      // Determine which images match the question
      const targetClass = this.getTargetClass(datatypes[0]);
      const correctIndices = predictions
        .map((pred, idx) => ({ pred, idx }))
        .filter(({ pred }) => pred === targetClass)
        .map(({ idx }) => idx);
      
      answers[task_key] = correctIndices;
    }

    // Step 4: Submit solution
    const submit = await axios.post('https://api2.hcaptcha.com/checkcaptcha', {
      v: '1.5.2',
      host: 'discord.com',
      sitekey: sitekey,
      n: this.generateProofOfWork(c),
      c: JSON.stringify(c),
      motionData: this.generateMotionData(),
      answers: JSON.stringify(answers),
      serverdomain: 'discord.com',
      rqdata: rqdata || '',
      challenge: challenge
    });

    return submit.data.generated_pass_UUID;
  }

  generateProofOfWork(c) {
    // Simplified - real implementation needs wasm execution
    const h = c.type === 'hsw' ? c.req : c.hsw;
    // Return base64 encoded proof
    return Buffer.from(JSON.stringify({ hsw: h, type: 'hsw' })).toString('base64');
  }

  generateMotionData() {
    // Generate realistic mouse movements
    const movements = [];
    let x = 500, y = 300;
    const now = Date.now();
    
    for (let i = 0; i < 50; i++) {
      x += (Math.random() - 0.5) * 50;
      y += (Math.random() - 0.5) * 50;
      movements.push({
        x: Math.max(0, Math.min(1920, x)),
        y: Math.max(0, Math.min(1080, y)),
        t: now + i * 100 + Math.random() * 50,
        e: i === 0 ? 'mousedown' : i === 49 ? 'mouseup' : 'mousemove'
      });
    }
    
    return Buffer.from(JSON.stringify({
      st: now,
      mm: movements,
      ex: { x: movements[movements.length - 1].x, y: movements[movements.length - 1].y, t: now + 5000 },
      v: 1
    })).toString('base64');
  }

  classifyImage(imageBuffer) {
    // Simple classification - in production use YOLO or ResNet
    const tensor = tf.tensor3d(new Uint8Array(imageBuffer), [100, 100, 3]);
    const prediction = this.model.predict(tensor.expandDims(0));
    const classIdx = prediction.argMax(-1).dataSync()[0];
    tensor.dispose();
    return classIdx; // Returns 0-9 for different object types
  }

  getTargetClass(datatype) {
    const mapping = {
      'car': 0, 'bus': 0, 'vehicle': 0,
      'bicycle': 1, 'motorcycle': 1,
      'fire hydrant': 2, 'hydrant': 2,
      'traffic light': 3,
      'crosswalk': 4, 'pedestrian crossing': 4,
      'stair': 5, 'stairs': 5,
      'bridge': 6,
      'palm tree': 7, 'tree': 7,
      'chimney': 8,
      'tractor': 9
    };
    return mapping[datatype.toLowerCase()] || 0;
  }
}

module.exports = { HCaptchaSolver };
