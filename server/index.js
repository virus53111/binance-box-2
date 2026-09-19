import './core.js';

const PORT = Number(process.env.PORT || 8787);
const ADMIN_KEY = String(process.env.ADMIN_KEY || '').trim();
const API_BASE = `http://127.0.0.1:${PORT}`;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const cleanUser = value => String(value || '').replace(/^@/, '').trim().toLowerCase();
const allowedUsers = [...new Set(
  String(process.env.LIVE_TIKTOK_USERS || 'murdilimax,studiocomploy2023')
    .split(/[\s,;]+/)
    .map(cleanUser)
    .filter(Boolean)
)];

async function getStatus() {
  const response = await fetch(`${API_BASE}/api/control/status`);
  if (!response.ok) throw new Error(`status ${response.status}`);
  return response.json();
}

async function selectAccount(username) {
  if (!ADMIN_KEY) throw new Error('ADMIN_KEY is missing');
  const response = await fetch(`${API_BASE}/api/control/connect`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-admin-key': ADMIN_KEY },
    body: JSON.stringify({ tiktokUsername: username })
  });
  if (!response.ok) throw new Error(`switch ${response.status}: ${await response.text()}`);
  return response.json();
}

async function waitForApi() {
  for (let i = 0; i < 30; i += 1) {
    try {
      const status = await getStatus();
      return status;
    } catch {}
    await delay(1000);
  }
  throw new Error('Live Earth API did not become ready');
}

async function runAccountRotator() {
  if (allowedUsers.length < 2) {
    console.log(`TikTok account rotator disabled · ${allowedUsers[0] || 'no accounts configured'}`);
    return;
  }
  if (!ADMIN_KEY) {
    console.warn('TikTok account rotator cannot switch accounts because ADMIN_KEY is missing.');
    return;
  }

  await waitForApi();
  console.log(`TikTok account rotator ready · ${allowedUsers.map(x => '@' + x).join(' · ')}`);

  let offlineSince = Date.now();
  let lastOnlineUser = '';

  while (true) {
    try {
      const status = await getStatus();
      const active = cleanUser(status?.tiktokUsername);
      const online = Boolean(status?.bridgeOnline || status?.connector?.online);
      const connecting = Boolean(status?.connector?.connecting || status?.connector?.status === 'connecting');

      if (online) {
        if (lastOnlineUser !== active) console.log(`LIVE account locked: @${active}`);
        lastOnlineUser = active;
        offlineSince = 0;
        await delay(5000);
        continue;
      }

      lastOnlineUser = '';
      if (!offlineSince) offlineSince = Date.now();
      const offlineFor = Date.now() - offlineSince;

      if ((connecting && offlineFor < 12000) || offlineFor < 7000) {
        await delay(3000);
        continue;
      }

      const currentIndex = allowedUsers.indexOf(active);
      const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % allowedUsers.length : 0;
      const next = allowedUsers[nextIndex];
      await selectAccount(next);
      console.log(`Looking for TikTok LIVE on @${next}`);
      offlineSince = Date.now();
    } catch (error) {
      console.warn('TikTok account rotator:', error?.message || error);
    }
    await delay(5000);
  }
}

void runAccountRotator();
