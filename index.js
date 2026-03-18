const { Worker } = require('worker_threads');
const http = require('http');
const fs = require('fs');
const { scrapeProxies } = require('./proxies');

// Simple JSON database
const DB_FILE = './tokens.json';
function saveToken(token, email) {
  try {
    let data = [];
    if (fs.existsSync(DB_FILE)) {
      data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    }
    data.push({ token, email, created_at: new Date().toISOString() });
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.log('[DB] Save error:', e.message);
  }
}

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
  } else if (req.url === '/tokens') {
    try {
      const data = fs.existsSync(DB_FILE) ? fs.readFileSync(DB_FILE, 'utf8') : '[]';
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(data);
    } catch (e) {
      res.writeHead(500);
      res.end('[]');
    }
  } else {
    res.writeHead(404);
    res.end();
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`[HEALTH] Running on 0.0.0.0:${PORT}`);
});

const PROXY_WORKERS = 2;

async function main() {
  console.log('[GEN] Initializing proxies...');
  await scrapeProxies();
  
  console.log('[GEN] Starting workers in 3s...');
  await new Promise(r => setTimeout(r, 3000));
  
  for (let i = 0; i < PROXY_WORKERS; i++) {
    try {
      const worker = new Worker('./browser.js', {
        workerData: { workerId: i }
      });
      
      worker.on('message', (msg) => {
        if (msg.type === 'token') {
          saveToken(msg.token, msg.email);
          console.log(`[+] Token: ${msg.token.slice(0, 30)}...`);
        }
        if (msg.type === 'error') {
          console.log(`[-] Worker ${i}:`, msg.error);
        }
        if (msg.type === 'log') {
          console.log(msg.data);
        }
      });
      
      worker.on('error', (err) => {
        console.log(`[!] Worker ${i} crashed:`, err.message);
      });
      
      worker.on('exit', (code) => {
        console.log(`[!] Worker ${i} exited with code ${code}`);
      });
      
    } catch (e) {
      console.log(`[!] Failed to start worker ${i}:`, e.message);
    }
  }
}

main().catch(console.error);
setInterval(() => {}, 1000);
