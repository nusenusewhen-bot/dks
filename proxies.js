const axios = require('axios');
const cheerio = require('cheerio');

let proxyPool = [];
let lastUpdate = 0;

const PROXY_SOURCES = [
  'https://sslproxies.org/',
  'https://free-proxy-list.net/',
  'https://www.us-proxy.net/',
  'https://proxylist.geonode.com/api/proxy-list?limit=50&page=1&sort_by=lastChecked&sort_type=desc&protocols=http%2Chttps',
  'https://www.proxy-list.download/api/v1/get?type=http',
  'https://www.proxy-list.download/api/v1/get?type=https'
];

async function scrapeProxies() {
  const newProxies = [];
  
  // Try all sources
  for (const url of PROXY_SOURCES) {
    try {
      if (url.includes('geonode')) {
        // API format
        const { data } = await axios.get(url, { timeout: 15000 });
        if (data && data.data) {
          data.data.forEach(p => {
            if (p.protocols.includes('http') || p.protocols.includes('https')) {
              newProxies.push(`${p.ip}:${p.port}`);
            }
          });
        }
      } else if (url.includes('proxy-list.download')) {
        // Plain text format
        const { data } = await axios.get(url, { timeout: 15000 });
        const lines = data.split('\n').filter(line => line.includes(':'));
        lines.forEach(line => {
          const [ip, port] = line.trim().split(':');
          if (ip && port) newProxies.push(`${ip}:${port}`);
        });
      } else {
        // HTML table format
        const { data } = await axios.get(url, { 
          timeout: 15000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });
        const $ = cheerio.load(data);
        
        $('table tbody tr, .table tbody tr').each((i, row) => {
          const cols = $(row).find('td');
          if (cols.length > 6) {
            const ip = $(cols[0]).text().trim();
            const port = $(cols[1]).text().trim();
            const https = $(cols[6]).text().trim().toLowerCase();
            const anonymity = $(cols[4] || cols[5]).text().trim().toLowerCase();
            
            if (ip && port && (https === 'yes' || https === 'true')) {
              // Prefer elite/anonymous proxies
              if (anonymity.includes('elite') || anonymity.includes('anonymous') || anonymity.includes('high')) {
                newProxies.unshift(`${ip}:${port}`); // Add to front (priority)
              } else {
                newProxies.push(`${ip}:${port}`);
              }
            }
          }
        });
      }
    } catch (e) {
      console.log(`[PROXY] Source failed: ${url.split('/')[2]}`);
    }
  }
  
  console.log(`[PROXY] Scraped ${newProxies.length} total, testing...`);
  
  // Test proxies (parallel with limit)
  const working = [];
  const testLimit = 20; // Test first 20 only
  
  const testProxy = async (proxy) => {
    try {
      const [host, port] = proxy.split(':');
      await axios.get('https://discord.com/api/v9/gateway', {
        proxy: { host, port: parseInt(port), protocol: 'http' },
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      return proxy;
    } catch (e) {
      return null;
    }
  };
  
  // Test in batches of 5
  for (let i = 0; i < Math.min(newProxies.length, testLimit); i += 5) {
    const batch = newProxies.slice(i, i + 5);
    const results = await Promise.all(batch.map(testProxy));
    results.forEach(p => { if (p) working.push(p); });
    
    // Stop if we have enough
    if (working.length >= 5) break;
  }
  
  proxyPool = working;
  lastUpdate = Date.now();
  console.log(`[PROXY] ${working.length} working proxies found`);
  
  // If still 0, use direct connection fallback for testing
  if (working.length === 0) {
    console.log('[PROXY] No working proxies - will try direct connection');
  }
}

async function getWorkingProxy() {
  // Refresh if empty or old
  if (proxyPool.length === 0 || Date.now() - lastUpdate > 180000) {
    await scrapeProxies();
  }
  
  // Return random working proxy
  if (proxyPool.length > 0) {
    return proxyPool[Math.floor(Math.random() * proxyPool.length)];
  }
  
  // Fallback: return null (direct connection)
  return null;
}

// Initial scrape
(async function init() {
  await scrapeProxies();
})();

module.exports = { getWorkingProxy, scrapeProxies };
