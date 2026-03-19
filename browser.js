// Worker main loop - NO top-level await
function main() {
  log('Worker started');
  
  async function loop() {
    while (true) {
      try {
        await createAccount();
        const delay = isDirectMode() ? 120000 : 45000 + Math.random() * 45000;
        log(`Wait ${Math.round(delay/1000)}s...`);
        await new Promise(r => setTimeout(r, delay));
      } catch (err) {
        log(`Loop error: ${err.message}`);
        await new Promise(r => setTimeout(r, 60000));
      }
    }
  }
  
  // Start without await
  setTimeout(loop, 1000);
}

main();
