const axios = require('axios');
const cheerio = require('cheerio');
const https = require('https');
const http = require('http');

let proxyPool = [];
let lastUpdate = 0;
let directMode = false;

const PROXY_SOURCES = [
  'https://sslproxies.org/',
  'https://free-proxy-list.net/',
  'https://www.us-proxy.net/',
  'https://api.proxyscrape.com/v2/?request=get&protocol=http&timeout=5000&country=all&ssl=all&anonymity=all',
  'https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt',
  'https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/http.txt',
  'https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/http.txt',
  'https://raw.githubusercontent.com/clarketm/proxy-list/master/proxy-list-raw.txt',
  'https://raw.githubusercontent.com/hookzof/socks5_list/master/proxy.txt'
];

// Fast parallel proxy tester
async function testProxyBatch(proxies, concurrency = 10) {
  const working = [];
  
  async function testSingle(proxy) {
    return new Promise((resolve) => {
      const [host, port] = proxy.split(':');
      const portNum = parseInt(port);
      
      const timeout = setTimeout(() => resolve(null), 3000);
      
      const options = {
        hostname: host,
        port: portNum,
        path: 'https://discord.com/api/v9/gateway',
        method: 'CONNECT',
        timeout: 3000,
        rejectUnauthorized: false
      };
      
      const req = http.request(options, (res) => {
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
      
      req.end();
    });
  }
  
  // Process in batches
  for (let i = 0; i < proxies.length; i += concurrency) {
    const batch = proxies.slice(i, i + concurrency);
    const results = await Promise.all(batch.map(testSingle));
    results.forEach(p => { if (p) working.push(p); });
    
    // Stop early if we have enough
    if (working.length >= 10) break;
  }
  
  return working;
}

async function scrapeProxies() {
  const newProxies = [];
  
  // Parallel scraping
  const scrapePromises = PROXY_SOURCES.map(async (url) => {
    try {
      if (url.includes('raw.githubusercontent.com') || url.includes('proxyscrape') || url.includes('clarketm') || url.includes('hookzof')) {
        const { data } = await axios.get(url, { timeout: 5000 });
        const lines = data.split('\n').filter(line => line.includes(':') && !line.startsWith('#'));
        return lines.map(line => line.trim().replace('\r', '')).filter(Boolean);
      } else {
        const { data } = await axios.get(url, { 
          timeout: 5000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });
        const $ = cheerio.load(data);
        const found = [];
        
        $('table tbody tr').each((i, row) => {
          const cols = $(row).find('td');
          if (cols.length > 6) {
            const ip = $(cols[0]).text().trim();
            const port = $(cols[1]).text().trim();
            const https = $(cols[6]).text().trim().toLowerCase();
            if (ip && port && https === 'yes') {
              found.push(`${ip}:${port}`);
            }
          }
        });
        return found;
      }
    } catch (e) {
      return [];
    }
  });
  
  const results = await Promise.allSettled(scrapePromises);
  results.forEach(result => {
    if (result.status === 'fulfilled') {
      newProxies.push(...result.value);
    }
  });
  
  // Remove duplicates and limit
  const unique = [...new Set(newProxies)].slice(0, 100);
  console.log(`[PROXY] Scraped ${unique.length} unique, testing ${Math.min(unique.length, 30)}...`);
  
  // Test first 30 only for speed
  const toTest = unique.slice(0, 30);
  const working = await testProxyBatch(toTest, 15);
  
  proxyPool = working;
  lastUpdate = Date.now();
  
  if (working.length === 0) {
    console.log('[PROXY] No working proxies - DIRECT mode');
    directMode = true;
  } else {
    console.log(`[PROXY] ${working.length} working proxies`);
    directMode = false;
  }
}

async function getWorkingProxy() {
  // Refresh every 60 seconds or if empty
  if (Date.now() - lastUpdate > 60000 || proxyPool.length === 0) {
    await scrapeProxies();
  }
  
  if (directMode || proxyPool.length === 0) {
    return null;
  }
  
  // Return random from pool
  return proxyPool[Math.floor(Math.random() * proxyPool.length)];
}

function isDirectMode() {
  return directMode;
}

function getProxyCount() {
  return proxyPool.length;
}

// Initial fast scrape
(async function init() {
  await scrapeProxies();
})();

module.exports = { getWorkingProxy, scrapeProxies, isDirectMode, getProxyCount };
