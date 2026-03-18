const axios = require('axios');
const cheerio = require('cheerio');

const HOTMAIL007_URL = 'https://www.hotmail007.com';

async function getTempEmail() {
  try {
    // Get random email from hotmail007
    const { data } = await axios.get(`${HOTMAIL007_URL}/getEmail`, {
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json'
      }
    });
    
    if (data && data.email) {
      return data.email;
    }
    
    // Fallback to 1secmail if hotmail007 fails
    return fallbackEmail();
  } catch (e) {
    return fallbackEmail();
  }
}

async function checkInbox(email) {
  const [login, domain] = email.split('@');
  
  // Try hotmail007 first
  try {
    const { data } = await axios.get(
      `${HOTMAIL007_URL}/check/${email}`,
      { timeout: 10000 }
    );
    
    if (data && data.messages) {
      for (const msg of data.messages) {
        if (msg.subject.includes('Discord') || msg.from.includes('discord')) {
          const full = await axios.get(
            `${HOTMAIL007_URL}/message/${email}/${msg.id}`,
            { timeout: 10000 }
          );
          const body = full.data.body || '';
          const match = body.match(/https:\/\/discord\.com\/verify\/[a-zA-Z0-9_-]+/);
          if (match) return match[0];
        }
      }
    }
  } catch (e) {
    // Fallback to 1secmail
    return fallbackCheckInbox(login, domain);
  }
  
  return null;
}

async function fallbackEmail() {
  const domains = ['1secmail.com', '1secmail.org', '1secmail.net'];
  const domain = domains[Math.floor(Math.random() * domains.length)];
  const username = Math.random().toString(36).substring(2, 15);
  return `${username}@${domain}`;
}

async function fallbackCheckInbox(login, domain) {
  try {
    const { data } = await axios.get(
      `https://www.1secmail.com/api/v1/?action=getMessages&login=${login}&domain=${domain}`,
      { timeout: 10000 }
    );
    
    for (const msg of data) {
      if (msg.subject.includes('Discord')) {
        const full = await axios.get(
          `https://www.1secmail.com/api/v1/?action=readMessage&login=${login}&domain=${domain}&id=${msg.id}`,
          { timeout: 10000 }
        );
        const body = full.data.body || '';
        const match = body.match(/https:\/\/discord\.com\/verify\/[a-zA-Z0-9_-]+/);
        return match ? match[0] : null;
      }
    }
  } catch (e) {}
  return null;
}

module.exports = { getTempEmail, checkInbox };
