const { Worker } = require('worker_threads');
const Database = require('better-sqlite3');
const fs = require('fs');

const db = new Database('./tokens.db');
db.exec(`CREATE TABLE IF NOT EXISTS tokens (
  id INTEGER PRIMARY KEY,
  token TEXT UNIQUE,
  email TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  status TEXT DEFAULT 'unverified'
)`);

const PROXY_WORKERS = 5;

async function main() {
  console.log('[GEN] Starting workers...');
  
  for (let i = 0; i < PROXY_WORKERS; i++) {
    const worker = new Worker('./browser.js', {
      workerData: { workerId: i }
    });
    
    worker.on('message', (msg) => {
      if (msg.type === 'token') {
        db.prepare('INSERT OR IGNORE INTO tokens (token, email) VALUES (?, ?)')
          .run(msg.token, msg.email);
        console.log(`[+] Token saved: ${msg.token.slice(0, 30)}...`);
      }
      if (msg.type === 'error') {
        console.log(`[-] Worker ${i} error:`, msg.error);
      }
    });
  }
}

main();
