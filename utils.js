const crypto = require('crypto');

function generateInsaneFPS() {
  const platforms = [
    { platform: 'Win32', os: 'Windows NT 10.0; Win64; x64', userAgentPlatform: 'Windows' },
    { platform: 'MacIntel', os: 'Macintosh; Intel Mac OS X 10_15_7', userAgentPlatform: 'macOS' }
  ];
  
  const selected = platforms[Math.floor(Math.random() * platforms.length)];
  const chromeVersion = ['120.0.0.0', '121.0.0.0', '119.0.0.0', '122.0.0.0'][Math.floor(Math.random() * 4)];
  const majorVersion = chromeVersion.split('.')[0];
  
  const resolutions = [
    { width: 1920, height: 1080 },
    { width: 1366, height: 768 },
    { width: 1440, height: 900 },
    { width: 1536, height: 864 }
  ];
  
  const screen = resolutions[Math.floor(Math.random() * resolutions.length)];
  
  const timezones = selected.platform === 'Win32' 
    ? ['America/New_York', 'America/Chicago', 'America/Los_Angeles']
    : ['America/New_York', 'Europe/London'];
    
  const timezone = timezones[Math.floor(Math.random() * timezones.length)];
  
  // Fixed geolocation with proper latitude/longitude
  const geoLocations = {
    'America/New_York': { latitude: 40.7128 + (Math.random() - 0.5), longitude: -74.0060 + (Math.random() - 0.5) },
    'America/Chicago': { latitude: 41.8781 + (Math.random() - 0.5), longitude: -87.6298 + (Math.random() - 0.5) },
    'America/Los_Angeles': { latitude: 34.0522 + (Math.random() - 0.5), longitude: -118.2437 + (Math.random() - 0.5) },
    'Europe/London': { latitude: 51.5074 + (Math.random() - 0.5), longitude: -0.1278 + (Math.random() - 0.5) }
  };
  
  const geolocation = geoLocations[timezone] || geoLocations['America/New_York'];
  
  return {
    userAgent: `Mozilla/5.0 (${selected.os}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`,
    platform: selected.platform,
    vendor: 'Google Inc.',
    productSub: '20030107',
    locale: 'en-US',
    language: 'en-US',
    languages: ['en-US', 'en'],
    timezone,
    geolocation, // Now has latitude and longitude
    viewport: { width: screen.width, height: screen.height },
    screen: {
      width: screen.width,
      height: screen.height,
      availWidth: screen.width,
      availHeight: screen.height - 40,
      colorDepth: 24,
      pixelDepth: 24,
      availLeft: 0,
      availTop: 0
    },
    deviceMemory: [4, 8, 16][Math.floor(Math.random() * 3)],
    hardwareConcurrency: [4, 8, 12, 16][Math.floor(Math.random() * 4)],
    maxTouchPoints: 0,
    pdfViewerEnabled: true,
    webdriver: false,
    acceptLanguage: 'en-US,en;q=0.9',
    secChUa: `"Not_A Brand";v="8", "Chromium";v="${majorVersion}", "Google Chrome";v="${majorVersion}"`,
    platformInfo: selected.userAgentPlatform,
    webgl: {
      vendor: selected.platform === 'Win32' ? 'Google Inc. (NVIDIA)' : 'Apple Inc.',
      renderer: selected.platform === 'Win32' 
        ? `ANGLE (NVIDIA, NVIDIA GeForce GTX ${[1050, 1060, 1650, 1660][Math.floor(Math.random() * 4)]} Direct3D11 vs_5_0 ps_5_0, D3D11)`
        : 'Apple M1'
    }
  };
}

async function injectFPS(page, fp) {
  await page.addInitScript((fingerprint) => {
    const navOverrides = {
      userAgent: fingerprint.userAgent,
      platform: fingerprint.platform,
      vendor: fingerprint.vendor,
      productSub: fingerprint.productSub,
      language: fingerprint.language,
      languages: fingerprint.languages,
      deviceMemory: fingerprint.deviceMemory,
      hardwareConcurrency: fingerprint.hardwareConcurrency,
      maxTouchPoints: fingerprint.maxTouchPoints,
      pdfViewerEnabled: fingerprint.pdfViewerEnabled,
      webdriver: false
    };
    
    Object.keys(navOverrides).forEach(key => {
      try {
        Object.defineProperty(navigator, key, {
          get: () => navOverrides[key],
          configurable: true
        });
      } catch (e) {}
    });
    
    Object.keys(fingerprint.screen).forEach(key => {
      try {
        Object.defineProperty(screen, key, {
          get: () => fingerprint.screen[key],
          configurable: true
        });
      } catch (e) {}
    });
    
    const getParam = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function(parameter) {
      if (parameter === 37445) return fingerprint.webgl.vendor;
      if (parameter === 37446) return fingerprint.webgl.renderer;
      if (parameter === 7936) return fingerprint.webgl.vendor;
      if (parameter === 7937) return fingerprint.webgl.renderer;
      return getParam.call(this, parameter);
    };
    
    const originalGetImageData = CanvasRenderingContext2D.prototype.getImageData;
    CanvasRenderingContext2D.prototype.getImageData = function(x, y, w, h) {
      const imageData = originalGetImageData.call(this, x, y, w, h);
      for (let i = 0; i < imageData.data.length; i += 4) {
        const noise = Math.floor(Math.random() * 3) - 1;
        imageData.data[i] = Math.min(255, Math.max(0, imageData.data[i] + noise));
      }
      return imageData;
    };
    
    const chromeObj = {
      loadTimes: () => ({}),
      csi: () => ({}),
      app: { isInstalled: false },
      webstore: { onInstallStageChanged: {}, onDownloadProgress: {} },
      runtime: {}
    };
    
    Object.defineProperty(window, 'chrome', {
      get: () => chromeObj,
      configurable: true
    });
    
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined
    });
    
  }, fp);
}

module.exports = { generateInsaneFPS, injectFPS };
