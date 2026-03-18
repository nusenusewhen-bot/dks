const crypto = require('crypto');

function generateSuperFingerprint() {
  // Real Chrome 120+ fingerprints collected from actual browsers
  const chromeVersions = ['120.0.0.0', '121.0.0.0', '119.0.0.0'];
  const version = chromeVersions[Math.floor(Math.random() * chromeVersions.length)];
  const platform = ['Win32', 'MacIntel'][Math.floor(Math.random() * 2)];
  
  const webglVendor = platform === 'Win32' ? 'Google Inc. (NVIDIA)' : 'Apple Inc.';
  const webglRenderer = platform === 'Win32' 
    ? 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1650 Direct3D11 vs_5_0 ps_5_0, D3D11)'
    : 'Apple M1';
    
  // Canvas fingerprint randomization
  const canvasNoise = () => {
    const canvas = { width: 300, height: 150 };
    const ctx = {
      fillStyle: '#000000',
      font: '14px Arial',
      textBaseline: 'alphabetic',
      getImageData: () => ({
        data: new Uint8ClampedArray(
          Array(300 * 150 * 4).fill(0).map(() => Math.floor(Math.random() * 50))
        )
      })
    };
    return crypto.createHash('md5').update(ctx.getImageData().data).digest('hex');
  };

  return {
    userAgent: `Mozilla/5.0 (${platform === 'Win32' ? 'Windows NT 10.0; Win64; x64' : 'Macintosh; Intel Mac OS X 10_15_7'}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${version} Safari/537.36`,
    platform,
    vendor: 'Google Inc.',
    language: 'en-US',
    languages: ['en-US', 'en'],
    deviceMemory: [4, 8, 16, 32][Math.floor(Math.random() * 4)],
    hardwareConcurrency: [4, 8, 12, 16][Math.floor(Math.random() * 4)],
    maxTouchPoints: 0,
    pdfViewerEnabled: true,
    webdriver: false,
    bluetooth: {},
    clipboard: {},
    credentials: {},
    keyboard: {},
    mediaCapabilities: {},
    permissions: {},
    presentation: {},
    scheduling: {},
    storage: {},
    wakeLock: {},
    webkitTemporaryStorage: {},
    userAgentData: {
      brands: [
        { brand: 'Not_A Brand', version: '8' },
        { brand: 'Chromium', version: version.split('.')[0] },
        { brand: 'Google Chrome', version: version.split('.')[0] }
      ],
      mobile: false,
      platform: platform === 'Win32' ? 'Windows' : 'macOS'
    },
    plugins: [
      { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer' },
      { name: 'Native Client', filename: 'internal-nacl-plugin' },
      { name: 'Widevine Content Decryption Module', filename: 'widevinecdmadapter.dll' }
    ],
    mimeTypes: [
      { type: 'application/pdf', suffixes: 'pdf', description: 'Portable Document Format' },
      { type: 'application/x-google-chrome-pdf', suffixes: 'pdf', description: 'Portable Document Format' }
    ],
    webgl: { vendor: webglVendor, renderer: webglRenderer, unmaskedVendor: webglVendor, unmaskedRenderer: webglRenderer },
    canvas: canvasNoise(),
    screen: {
      width: 1920,
      height: 1080,
      availWidth: 1920,
      availHeight: 1040,
      colorDepth: 24,
      pixelDepth: 24,
      availLeft: 0,
      availTop: 0
    },
    timezone: 'America/New_York',
    timezoneOffset: 300,
    historyLength: 2,
    doNotTrack: null,
    productSub: '20030107',
    vendorSub: ''
  };
}

// Inject into page before any scripts run
async function injectFPS(page, fingerprint) {
  await page.addInitScript((fp) => {
    // Override navigator
    const navigatorOverrides = {
      userAgent: fp.userAgent,
      platform: fp.platform,
      vendor: fp.vendor,
      language: fp.language,
      languages: fp.languages,
      deviceMemory: fp.deviceMemory,
      hardwareConcurrency: fp.hardwareConcurrency,
      maxTouchPoints: fp.maxTouchPoints,
      pdfViewerEnabled: fp.pdfViewerEnabled,
      webdriver: false,
      bluetooth: fp.bluetooth,
      clipboard: fp.clipboard,
      credentials: fp.credentials,
      keyboard: fp.keyboard,
      mediaCapabilities: fp.mediaCapabilities,
      permissions: fp.permissions,
      presentation: fp.presentation,
      scheduling: fp.scheduling,
      storage: fp.storage,
      wakeLock: fp.wakeLock,
      webkitTemporaryStorage: fp.webkitTemporaryStorage,
      userAgentData: fp.userAgentData,
      plugins: fp.plugins,
      mimeTypes: fp.mimeTypes
    };
    
    Object.keys(navigatorOverrides).forEach(key => {
      Object.defineProperty(navigator, key, {
        get: () => navigatorOverrides[key],
        configurable: true
      });
    });
    
    // Override webgl
    const getParameter = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function(parameter) {
      if (parameter === 37445) return fp.webgl.vendor;
      if (parameter === 37446) return fp.webgl.renderer;
      if (parameter === 7937) return fp.webgl.unmaskedVendor;
      if (parameter === 7936) return fp.webgl.unmaskedRenderer;
      return getParameter.call(this, parameter);
    };
    
    // Override canvas
    const originalGetImageData = CanvasRenderingContext2D.prototype.getImageData;
    CanvasRenderingContext2D.prototype.getImageData = function(x, y, w, h) {
      const data = originalGetImageData.call(this, x, y, w, h);
      // Add subtle noise
      for (let i = 0; i < data.data.length; i += 4) {
        data.data[i] = Math.min(255, Math.max(0, data.data[i] + (Math.random() * 4 - 2)));
      }
      return data;
    };
    
    // Override toDataURL
    const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function() {
      const ctx = this.getContext('2d');
      ctx.fillStyle = `rgb(${Math.random()*5},${Math.random()*5},${Math.random()*5})`;
      ctx.fillRect(0, 0, 1, 1);
      return originalToDataURL.call(this);
    };
    
    // Hide automation
    delete window.chrome.runtime;
    Object.defineProperty(window, 'chrome', {
      get: () => ({
        runtime: {},
        app: { isInstalled: false },
        webstore: { onInstallStageChanged: {}, onDownloadProgress: {} }
      }),
      configurable: true
    });
    
    // Override permissions query
    const originalQuery = Permissions.prototype.query;
    Permissions.prototype.query = async function(args) {
      if (args.name === 'notifications') return { state: 'default', onchange: null };
      return originalQuery.call(this, args);
    };
    
    // Spoof plugins length
    Object.defineProperty(navigator.plugins, 'length', { get: () => 3 });
    
    // Override screen
    Object.keys(fp.screen).forEach(key => {
      Object.defineProperty(screen, key, { get: () => fp.screen[key] });
    });
    
    // Override history
    Object.defineProperty(history, 'length', { get: () => fp.historyLength });
    
    // Hide webdriver
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    
    // Console debug prevention
    const originalConsole = console.log;
    console.log = function(...args) {
      if (args[0]?.includes?.('automation')) return;
      originalConsole.apply(this, args);
    };
    
  }, fingerprint);
}

module.exports = { generateSuperFingerprint, injectFPS };
