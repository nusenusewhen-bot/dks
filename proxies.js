const axios = require('axios');
const cheerio = require('cheerio');
const https = require('https');

let proxyPool = [];
let lastUpdate = 0;
let directMode = false;

const PROXY_SOURCES = [
  'https://sslproxies.org/',
  'https://free-proxy-list.net/',
  'https://www.us-proxy.net/',
  'https://api.proxyscrape.com/v2/?request=get&protocol=http&timeout=10000&country=all&ssl=all&anonymity=all',
  'https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt',
  'https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/http.txt',
  'https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/http.txt'
];

async function testProxy(proxy) {
  return new Promise((resolve) => {
    const [host, port] = proxy.split(':');
    const timeout = setTimeout(() => resolve(null), 5000);
    
    const req = https.get('https://discord.com/api/v9/gateway', {
      host: host,
      port: parseInt(port),
      method: 'GET',
      rejectUnauthorized: false,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Host': 'discord.com'
      }
    }, (res) => {
      clearTimeout(timeout);
      if (res.statusCode === 200) {
        resolve(proxy);
      } else {
        resolve(null);
      }
    });
    
    req.on('error', () => {
      clearTimeout(timeout);
      resolve(null);
    });
    
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
  });
}

async function scrapeProxies() {
  const newProxies = [];
  
  for (const url of PROXY_SOURCES) {
    try {
      if (url.includes('raw.githubusercontent.com') || url.includes('proxyscrape')) {
        const { data } = await axios.get(url, { timeout: 10000 });
        const lines = data.split('\n').filter(line => line.includes(':') && !line.startsWith('#'));
        lines.forEach(line => {
          const clean = line.trim().replace('\r', '');
          if (clean) newProxies.push(clean);
        });
      } else {
        const { data } = await axios.get(url, { 
          timeout: 10000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });
        const $ = cheerio.load(data);
        
        $('table tbody tr').each((i, row) => {
          const cols = $(row).find('td');
          if (cols.length > 6) {
            const ip = $(cols[0]).text().trim();
            const port = $(cols[1]).text().trim();
            const https = $(cols[6]).text().trim().toLowerCase();
            if (ip && port && https === 'yes') {
              newProxies.push(`${ip}:${port}`);
            }
          }
        });
      }
    } catch (e) {
      console.log(`[PROXY] Failed: ${url.split('/')[2] || url.split('/')[0]}`);
    }
  }
  
  const unique = [...new Set(newProxies)].slice(0, 50);
  console.log(`[PROXY] Scraped ${unique.length} unique, testing...`);
  
  const working = [];
  
  for (const proxy of unique) {
    const result = await testProxy(proxy);
    if (result) {
      working.push(result);
      if (working.length >= 5) break;
    }
  }
  
  proxyPool = working;
  lastUpdate = Date.now();
  
  if (working.length === 0) {
    console.log('[PROXY] No working proxies - switching to DIRECT mode');
    directMode = true;
  } else {
    console.log(`[PROXY] ${working.length} working proxies`);
    directMode = false;
  }
}

async function getWorkingProxy() {
  if (Date.now() - lastUpdate > 120000 || proxyPool.length === 0) {
    await scrapeProxies();
  }
  
  if (directMode || proxyPool.length === 0) {
    return null;
  }
  
  return proxyPool[Math.floor(Math.random() * proxyPool.length)];
}

function isDirectMode() {
  return directMode;
}

(async function init() {
  await scrapeProxies();
})();

module.exports = { getWorkingProxy, scrapeProxies, isDirectMode };
