const { Worker } = require('worker_threads');
const Database = require('better-sqlite3');
const http = require('http');

// Start health server IMMEDIATELY before anything else
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

// Bind to 0.0.0.0 to accept external connections
server.listen(PORT, '0.0.0.0', () => {
  console.log(`[HEALTH] Server running on 0.0.0.0:${PORT}`);
});

// Database setup
let db;
try {
  db = new Database('./tokens.db');
  db.exec(`CREATE TABLE IF NOT EXISTS tokens (
    id INTEGER PRIMARY KEY,
    token TEXT UNIQUE,
    email TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    status TEXT DEFAULT 'unverified'
  )`);
  console.log('[DB] Connected');
} catch (e) {
  console.log('[DB] Error:', e.message);
  // Continue even if DB fails
}

const PROXY_WORKERS = 2; // Reduced for Railway starter

async function main() {
  console.log('[GEN] Starting workers in 5s...');
  await new Promise(r => setTimeout(r, 5000)); // Let healthcheck pass first
  
  for (let i = 0; i < PROXY_WORKERS; i++) {
    try {
      const worker = new Worker('./browser.js', {
        workerData: { workerId: i }
      });
      
      worker.on('message', (msg) => {
        if (msg.type === 'token' && db) {
          try {
            db.prepare('INSERT OR IGNORE INTO tokens (token, email) VALUES (?, ?)')
              .run(msg.token, msg.email);
            console.log(`[+] Token: ${msg.token.slice(0, 30)}...`);
          } catch (e) {}
        }
        if (msg.type === 'error') {
          console.log(`[-] Worker ${i}:`, msg.error);
        }
        if (msg.type === 'log') {
          console.log(`[W${i}]`, msg.data);
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

// Keep process alive
setInterval(() => {}, 1000);
