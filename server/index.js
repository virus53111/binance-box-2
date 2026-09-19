import './core.js';

const PORT = Number(process.env.PORT || 8787);
const ADMIN_KEY = String(process.env.ADMIN_KEY || '').trim();
const API_BASE = `http://127.0.0.1:${PORT}`;
const LOCKED_TIKTOK_USER = 'murdilimax';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const cleanUser = value => String(value || '').replace(/^@/, '').trim().toLowerCase();

async function getStatus() {
  const response = await fetch(`${API_BASE}/api/control/status`);
  if (!response.ok) throw new Error(`status ${response.status}`);
  return response.json();
}

async function selectLockedAccount() {
  if (!ADMIN_KEY) throw new Error('ADMIN_KEY is missing');
  const response = await fetch(`${API_BASE}/api/control/connect`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-admin-key': ADMIN_KEY },
    body: JSON.stringify({ tiktokUsername: LOCKED_TIKTOK_USER })
  });
  if (!response.ok) throw new Error(`lock ${response.status}: ${await response.text()}`);
  return response.json();
}

async function waitForApi() {
  for (let i = 0; i < 30; i += 1) {
    try {
      return await getStatus();
    } catch {}
    await delay(1000);
  }
  throw new Error('Live Earth API did not become ready');
}

async function enforceLockedAccount() {
  try {
    await waitForApi();
  } catch (error) {
    console.error('TikTok account lock:', error?.message || error);
    return;
  }

  console.log(`TikTok account permanently locked to @${LOCKED_TIKTOK_USER}`);

  while (true) {
    try {
      const status = await getStatus();
      const active = cleanUser(status?.tiktokUsername);
      if (active !== LOCKED_TIKTOK_USER) {
        await selectLockedAccount();
        console.log(`TikTok account restored to @${LOCKED_TIKTOK_USER}`);
      }
    } catch (error) {
      console.warn('TikTok account lock:', error?.message || error);
    }
    await delay(5000);
  }
}

void enforceLockedAccount();
