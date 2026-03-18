const axios = require('axios');

const BASE_URL = 'https://www.1secmail.com/api/v1';

async function getTempEmail() {
  const domains = ['1secmail.com', '1secmail.org', '1secmail.net'];
  const domain = domains[Math.floor(Math.random() * domains.length)];
  const username = Math.random().toString(36).substring(2, 12);
  return `${username}@${domain}`;
}

async function checkInbox(email) {
  const [login, domain] = email.split('@');
  
  try {
    const { data } = await axios.get(
      `${BASE_URL}/?action=getMessages&login=${login}&domain=${domain}`
    );
    
    for (const msg of data) {
      if (msg.subject.includes('Discord')) {
        const full = await axios.get(
          `${BASE_URL}/?action=readMessage&login=${login}&domain=${domain}&id=${msg.id}`
        );
        const body = full.data.body || full.data.textBody;
        const match = body.match(/https:\/\/discord\.com\/verify\/[a-zA-Z0-9_-]+/);
        return match ? match[0] : null;
      }
    }
  } catch (e) {}
  
  return null;
}

module.exports = { getTempEmail, checkInbox };
