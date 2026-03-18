const axios = require('axios');
const cheerio = require('cheerio');

let proxyPool = [];

async function scrapeProxies() {
  const sources = [
    'https://sslproxies.org/',
    'https://free-proxy-list.net/',
    'https://www.us-proxy.org/'
  ];
  
  const newProxies = [];
  
  for (const url of sources) {
    try {
      const { data } = await axios.get(url, { timeout: 10000 });
      const $ = cheerio.load(data);
      
      $('table tr').each((i, row) => {
        const cols = $(row).find('td');
        if (cols.length > 1) {
          const ip = $(cols[0]).text();
          const port = $(cols[1]).text();
          const https = $(cols[6]).text();
          if (https === 'yes' && ip && port) {
            newProxies.push(`${ip}:${port}`);
          }
        }
      });
    } catch (e) {}
  }
  
  // Test proxies
  const working = [];
  for (const proxy of newProxies.slice(0, 20)) {
    try {
      await axios.get('https://discord.com', {
        proxy: { host: proxy.split(':')[0], port: proxy.split(':')[1] },
        timeout: 5000
      });
      working.push(proxy);
    } catch (e) {}
  }
  
  proxyPool = working;
  console.log(`[PROXY] Pool updated: ${working.length} working`);
}

async function getWorkingProxy() {
  if (proxyPool.length === 0) await scrapeProxies();
  return proxyPool[Math.floor(Math.random() * proxyPool.length)];
}

setInterval(scrapeProxies, 300000); // Refresh every 5 min
scrapeProxies();

module.exports = { getWorkingProxy, scrapeProxies };
