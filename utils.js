const UserAgent = require('user-agents');

function generateFingerprint() {
  const userAgent = new UserAgent({ deviceCategory: 'desktop' });
  
  return {
    userAgent: userAgent.toString(),
    viewport: {
      width: 1280 + Math.floor(Math.random() * 200),
      height: 720 + Math.floor(Math.random() * 200)
    },
    colorDepth: 24,
    pixelRatio: 1 + Math.random() > 0.5 ? 2 : 1,
    hardwareConcurrency: [2, 4, 8, 16][Math.floor(Math.random() * 4)],
    deviceMemory: [4, 8, 16][Math.floor(Math.random() * 3)]
  };
}

function randomDelay(min, max) {
  return new Promise(r => setTimeout(r, min + Math.random() * (max - min)));
}

module.exports = { generateFingerprint, randomDelay };
