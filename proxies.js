const axios = require('axios');
const cheerio = require('cheerio');

let proxyPool = [];
let lastUpdate = 0;

async function scrapeProxies() {
  const sources = [
    'https://sslproxies.org/',
    'https://free-proxy-list.net/',
    'https://www.us-proxy.org/'
  ];
  
  const newProxies = [];
  
  for (const url of sources) {
    try {
      const { data } = await axios.get(url, { 
        timeout: 15000,
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
          const https = $(cols[6]).text().trim();
          if (ip && port && https === 'yes') {
            newProxies.push(`${ip}:${port}`);
          }
        }
      });
    } catch (e) {
      console.log('Proxy scrape failed:', e.message);
    }
  }
  
  const working = [];
  for (const proxy of newProxies.slice(0, 15)) {
    try {
      await axios.get('https://discord.com', {
        proxy: { 
          host: proxy.split(':')[0], 
          port: parseInt(proxy.split(':')[1])
        },
        timeout: 8000
      });
      working.push(proxy);
    } catch (e) {}
  }
  
  proxyPool = working;
  lastUpdate = Date.now();
  console.log(`[PROXY] ${working.length} working proxies`);
}

async function getWorkingProxy() {
  if (proxyPool.length === 0 || Date.now() - lastUpdate > 300000) {
    await scrapeProxies();
  }
  if (proxyPool.length === 0) return null;
  return proxyPool[Math.floor(Math.random() * proxyPool.length)];
}

// WRAP IN ASYNC IIFE
(async function init() {
  await scrapeProxies();
})();

module.exports = { getWorkingProxy, scrapeProxies };
