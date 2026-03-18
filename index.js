const { Worker } = require('worker_threads');
const Database = require('better-sqlite3');
const http = require('http');
const fs = require('fs');

// Health server for Railway
const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
  } else {
    res.writeHead(404);
    res.end();
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`[HEALTH] Running on port ${PORT}`);
});

// Database setup
const db = new Database('./tokens.db');
db.exec(`CREATE TABLE IF NOT EXISTS tokens (
  id INTEGER PRIMARY KEY,
  token TEXT UNIQUE,
  email TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  status TEXT DEFAULT 'unverified'
)`);

const PROXY_WORKERS = 3;

async function main() {
  console.log('[GEN] Starting workers...');
  
  for (let i = 0; i < PROXY_WORKERS; i++) {
    const worker = new Worker('./browser.js', {
      workerData: { workerId: i }
    });
    
    worker.on('message', (msg) => {
      if (msg.type === 'token') {
        try {
          db.prepare('INSERT OR IGNORE INTO tokens (token, email) VALUES (?, ?)')
            .run(msg.token, msg.email);
          console.log(`[+] Token saved: ${msg.token.slice(0, 30)}...`);
        } catch (e) {
          console.log('[-] DB error:', e.message);
        }
      }
      if (msg.type === 'error') {
        console.log(`[-] Worker ${i} error:`, msg.error);
      }
      if (msg.type === 'log') {
        console.log(`[Worker ${i}]`, msg.data);
      }
    });
    
    worker.on('error', (err) => {
      console.log(`[!] Worker ${i} crashed:`, err.message);
    });
  }
}

main().catch(console.error);
