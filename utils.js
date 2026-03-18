const crypto = require('crypto');

function generateInsaneFPS() {
  const platforms = [
    { 
      platform: 'Win32', 
      os: 'Windows NT 10.0; Win64; x64',
      userAgentPlatform: 'Windows'
    },
    { 
      platform: 'MacIntel', 
      os: 'Macintosh; Intel Mac OS X 10_15_7',
      userAgentPlatform: 'macOS'
    }
  ];
  
  const selected = platforms[Math.floor(Math.random() * platforms.length)];
  const chromeVersion = ['120.0.0.0', '121.0.0.0', '119.0.0.0', '122.0.0.0'][Math.floor(Math.random() * 4)];
  const majorVersion = chromeVersion.split('.')[0];
  
  // Realistic screen resolutions
  const resolutions = [
    { width: 1920, height: 1080 },
    { width: 1366, height: 768 },
    { width: 1440, height: 900 },
    { width: 1536, height: 864 },
    { width: 1280, height: 720 }
  ];
  
  const screen = resolutions[Math.floor(Math.random() * resolutions.length)];
  
  // Timezone based on platform
  const timezones = selected.platform === 'Win32' 
    ? ['America/New_York', 'America/Chicago', 'America/Los_Angeles', 'America/Denver']
    : ['America/New_York', 'Europe/London', 'Asia/Tokyo', 'Australia/Sydney'];
    
  const timezone = timezones[Math.floor(Math.random() * timezones.length)];
  
  // Geolocation based on timezone
  const geoMap = {
    'America/New_York': { lat: 40.7128 + (Math.random() - 0.5) * 2, long: -74.0060 + (Math.random() - 0.5) * 2 },
    'America/Chicago': { lat: 41.8781 + (Math.random() - 0.5) * 2, long: -87.6298 + (Math.random() - 0.5) * 2 },
    'America/Los_Angeles': { lat: 34.0522 + (Math.random() - 0.5) * 2, long: -118.2437 + (Math.random() - 0.5) * 2 },
    'Europe/London': { lat: 51.5074 + (Math.random() - 0.5), long: -0.1278 + (Math.random() - 0.5) },
    'Asia/Tokyo': { lat: 35.6762 + (Math.random() - 0.5), long: 139.6503 + (Math.random() - 0.5) }
  };
  
  const geolocation = geoMap[timezone] || geoMap['America/New_York'];
  
  return {
    userAgent: `Mozilla/5.0 (${selected.os}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`,
    platform: selected.platform,
    vendor: 'Google Inc.',
    productSub: '20030107',
    oscpu: selected.platform === 'Win32' ? 'Windows NT 10.0; Win64; x64' : undefined,
    locale: 'en-US',
    language: 'en-US',
    languages: ['en-US', 'en', 'en-GB'],
    timezone,
    geolocation,
    viewport: { 
      width: screen.width, 
      height: screen.height 
    },
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
    acceptLanguage: 'en-US,en;q=0.9',
    secChUa: `"Not_A Brand";v="8", "Chromium";v="${majorVersion}", "Google Chrome";v="${majorVersion}"`,
    platformInfo: selected.userAgentPlatform,
    webgl: {
      vendor: selected.platform === 'Win32' ? 'Google Inc. (NVIDIA)' : 'Apple Inc.',
      renderer: selected.platform === 'Win32' 
        ? `ANGLE (NVIDIA, NVIDIA GeForce GTX ${[1050, 1060, 1650, 1660, 2060, 3060][Math.floor(Math.random() * 6)]} Direct3D11 vs_5_0 ps_5_0, D3D11)`
        : 'Apple M1'
    },
    canvas: generateCanvasFingerprint(),
    fonts: [
      'Arial', 'Arial Black', 'Arial Narrow', 'Calibri', 'Cambria', 'Comic Sans MS',
      'Consolas', 'Courier New', 'Georgia', 'Helvetica', 'Impact', 'Lucida Console',
      'Lucida Sans Unicode', 'Microsoft Sans Serif', 'MS Gothic', 'MS PGothic',
      'Palatino Linotype', 'Segoe Print', 'Segoe Script', 'Segoe UI', 'Tahoma',
      'Times New Roman', 'Trebuchet MS', 'Verdana', 'Wingdings'
    ]
  };
}

function generateCanvasFingerprint() {
  // Generate consistent but unique canvas fingerprint
  const data = crypto.randomBytes(16).toString('hex');
  return crypto.createHash('md5').update(data).digest('hex');
}

async function injectFPS(page, fp) {
  await page.addInitScript((fingerprint) => {
    // Override navigator
    const navOverrides = {
      userAgent: fingerprint.userAgent,
      platform: fingerprint.platform,
      vendor: fingerprint.vendor,
      productSub: fingerprint.productSub,
      oscpu: fingerprint.oscpu,
      language: fingerprint.language,
      languages: fingerprint.languages,
      deviceMemory: fingerprint.deviceMemory,
      hardwareConcurrency: fingerprint.hardwareConcurrency,
      maxTouchPoints: fingerprint.maxTouchPoints,
      pdfViewerEnabled: fingerprint.pdfViewerEnabled,
      webdriver: false,
      bluetooth: fingerprint.bluetooth,
      clipboard: fingerprint.clipboard,
      credentials: fingerprint.credentials,
      keyboard: fingerprint.keyboard,
      mediaCapabilities: fingerprint.mediaCapabilities,
      permissions: fingerprint.permissions,
      presentation: fingerprint.presentation,
      scheduling: fingerprint.scheduling,
      storage: fingerprint.storage,
      wakeLock: fingerprint.wakeLock,
      webkitTemporaryStorage: fingerprint.webkitTemporaryStorage
    };
    
    Object.keys(navOverrides).forEach(key => {
      if (navOverrides[key] !== undefined) {
        try {
          Object.defineProperty(navigator, key, {
            get: () => navOverrides[key],
            configurable: true
          });
        } catch (e) {}
      }
    });
    
    // Override screen
    Object.keys(fingerprint.screen).forEach(key => {
      try {
        Object.defineProperty(screen, key, {
          get: () => fingerprint.screen[key],
          configurable: true
        });
      } catch (e) {}
    });
    
    // Override webgl
    const getParam = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function(parameter) {
      if (parameter === 37445) return fingerprint.webgl.vendor;
      if (parameter === 37446) return fingerprint.webgl.renderer;
      if (parameter === 7936) return fingerprint.webgl.vendor;
      if (parameter === 7937) return fingerprint.webgl.renderer;
      return getParam.call(this, parameter);
    };
    
    // Canvas fingerprint randomization
    const originalGetImageData = CanvasRenderingContext2D.prototype.getImageData;
    const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
    const originalToBlob = HTMLCanvasElement.prototype.toBlob;
    
    const canvasNoise = new Uint8Array([0, 0, 0, 0]);
    
    CanvasRenderingContext2D.prototype.getImageData = function(x, y, w, h) {
      const imageData = originalGetImageData.call(this, x, y, w, h);
      // Add imperceptible noise
      for (let i = 0; i < imageData.data.length; i += 4) {
        const noise = (Math.random() * 2 - 1);
        imageData.data[i] = Math.min(255, Math.max(0, imageData.data[i] + noise));
        imageData.data[i + 1] = Math.min(255, Math.max(0, imageData.data[i + 1] + noise));
        imageData.data[i + 2] = Math.min(255, Math.max(0, imageData.data[i + 2] + noise));
      }
      return imageData;
    };
    
    HTMLCanvasElement.prototype.toDataURL = function(type, quality) {
      const ctx = this.getContext('2d');
      if (ctx) {
        ctx.fillStyle = `rgba(${Math.floor(Math.random() * 3)},${Math.floor(Math.random() * 3)},${Math.floor(Math.random() * 3)},0.01)`;
        ctx.fillRect(0, 0, 1, 1);
      }
      return originalToDataURL.call(this, type, quality);
    };
    
    // Hide automation
    const chromeObj = {
      loadTimes: () => ({
        commitLoadTime: performance.now() / 1000,
        connectionInfo: 'h2',
        finishDocumentLoadTime: 0,
        finishLoadTime: 0,
        firstPaintAfterLoadTime: 0,
        firstPaintTime: 0,
        navigationType: 'Other',
        npnNegotiatedProtocol: 'h2',
        requestTime: performance.now() / 1000,
        startLoadTime: performance.now() / 1000,
        wasAlternateProtocolAvailable: false,
        wasFetchedViaSpdy: true,
        wasNpnNegotiated: true
      }),
      csi: () => ({
        onloadT: Date.now(),
        pageT: 1000 + Math.floor(Math.random() * 5000),
        startE: Date.now() - 1000 - Math.floor(Math.random() * 5000),
        tran: 15
      }),
      app: {
        isInstalled: false,
        InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' },
        RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' }
      },
      webstore: {
        onInstallStageChanged: {},
        onDownloadProgress: {}
      },
      runtime: {
        OnInstalledReason: { CHROME_UPDATE: 'chrome_update', INSTALL: 'install', SHARED_MODULE_UPDATE: 'shared_module_update', UPDATE: 'update' },
        OnRestartRequiredReason: { APP_UPDATE: 'app_update', OS_UPDATE: 'os_update', PERIODIC: 'periodic' },
        PlatformArch: { ARM: 'arm', ARM64: 'arm64', MIPS: 'mips', MIPS64: 'mips64', MIPS64EL: 'mips64el', MIPSEL: 'mipsel', X86_32: 'x86-32', X86_64: 'x86-64' },
        PlatformNaclArch: { ARM: 'arm', MIPS: 'mips', MIPS64: 'mips64', MIPS64EL: 'mips64el', MIPSEL: 'mipsel', MIPSEL64: 'mipsel64', X86_32: 'x86-32', X86_64: 'x86-64' },
        PlatformOs: { ANDROID: 'android', CROS: 'cros', LINUX: 'linux', MAC: 'mac', OPENBSD: 'openbsd', WIN: 'win' },
        RequestUpdateCheckStatus: { NO_UPDATE: 'no_update', THROTTLED: 'throttled', UPDATE_AVAILABLE: 'update_available' }
      }
    };
    
    Object.defineProperty(window, 'chrome', {
      get: () => chromeObj,
      configurable: true
    });
    
    // Permissions API
    const originalQuery = Permissions.prototype.query;
    Permissions.prototype.query = async function(args) {
      return { state: 'prompt', onchange: null };
    };
    
    // Notifications
    if (window.Notification) {
      Object.defineProperty(Notification, 'permission', {
        get: () => 'default'
      });
    }
    
    // Plugins
    const fakePlugins = [
      { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format', version: undefined, length: 1, item: () => null, namedItem: () => null },
      { name: 'Native Client', filename: 'internal-nacl-plugin', description: '', version: undefined, length: 2, item: () => null, namedItem: () => null },
      { name: 'Widevine Content Decryption Module', filename: 'widevinecdmadapter.dll', description: 'Widevine Content Decryption Module', version: undefined, length: 0, item: () => null, namedItem: () => null }
    ];
    
    Object.defineProperty(navigator, 'plugins', {
      get: () => {
        const plugins = fakePlugins.map((p, i) => ({
          ...p,
          length: p.length,
          item: (idx) => idx === i ? p : null,
          namedItem: (name) => name === p.name ? p : null
        }));
        plugins.length = fakePlugins.length;
        plugins.item = (idx) => plugins[idx] || null;
        plugins.namedItem = (name) => plugins.find(p => p.name === name) || null;
        return plugins;
      }
    });
    
    // MimeTypes
    const fakeMimeTypes = [
      { type: 'application/pdf', suffixes: 'pdf', description: 'Portable Document Format', enabledPlugin: fakePlugins[0] },
      { type: 'application/x-google-chrome-pdf', suffixes: 'pdf', description: 'Portable Document Format', enabledPlugin: fakePlugins[0] },
      { type: 'application/x-nacl', suffixes: '', description: 'Native Client module', enabledPlugin: fakePlugins[1] }
    ];
    
    Object.defineProperty(navigator, 'mimeTypes', {
      get: () => {
        const types = [...fakeMimeTypes];
        types.length = fakeMimeTypes.length;
        types.item = (idx) => types[idx] || null;
        types.namedItem = (name) => types.find(t => t.type === name) || null;
        return types;
      }
    });
    
    // Webdriver flag
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined
    });
    
    // Automation flag
    delete window.navigator.webdriver;
    
    // Console debug
    const originalConsole = console.debug;
    console.debug = function(...args) {
      if (args[0]?.includes?.('DevTools') || args[0]?.includes?.('automation')) return;
      return originalConsole.apply(this, args);
    };
    
  }, fp);
}

module.exports = { generateInsaneFPS, injectFPS };
