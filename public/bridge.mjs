import { TikTokLiveConnection, WebcastEvent } from 'tiktok-live-connector';

const username = String(process.env.TIKTOK_USER || '').replace(/^@/, '').trim();
const apiBase = String(process.env.BRIDGE_API || '').replace(/\/$/, '');
const token = String(process.env.BRIDGE_TOKEN || '').trim();
if (!username || !apiBase || !token) { console.error('Missing connection settings. Copy the Mac connector command from Live Earth Setup.'); process.exit(1); }
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const post = async (path, payload = {}) => {
  const response = await fetch(`${apiBase}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-bridge-token': token }, body: JSON.stringify(payload) });
  if (!response.ok) throw new Error(`Live Earth ${response.status}: ${await response.text()}`);
  return response.json();
};
const heartbeat = async () => { try { await post('/api/bridge/heartbeat'); } catch (error) { console.warn('Heartbeat failed:', error?.message || error); } };
function attachHandlers(connection) {
  connection.on(WebcastEvent.CHAT, async data => {
    const comment = String(data?.comment || '').trim();
    const match = comment.match(/^CITY\s+(.{2,40})$/i);
    if (!match) return;
    const user = data?.user || data;
    const tiktokUserId = String(user?.userId || user?.uniqueId || '');
    const uniqueId = String(user?.uniqueId || data?.uniqueId || 'viewer');
    if (!tiktokUserId) return;
    try { const result = await post('/api/gifts/ingest', { type: 'city', tiktokUserId, username: uniqueId, city: match[1] }); console.log(`CITY: @${uniqueId} -> ${result.city}`); } catch (error) { console.warn(`CITY rejected for @${uniqueId}: ${error?.message || error}`); }
  });
  connection.on(WebcastEvent.GIFT, async data => {
    const gift = data?.gift || data?.extendedGiftInfo || {};
    const giftType = Number(gift?.giftType ?? data?.giftType ?? 0);
    if (giftType === 1 && !Boolean(data?.repeatEnd)) return;
    const user = data?.user || data;
    const tiktokUserId = String(user?.userId || data?.userId || user?.uniqueId || '');
    const uniqueId = String(user?.uniqueId || data?.uniqueId || 'viewer');
    const quantity = Math.max(1, Number(data?.repeatCount || 1));
    const unitCoins = Math.max(1, Number(gift?.diamondCount ?? gift?.diamond_count ?? data?.diamondCount ?? 1));
    const giftName = String(gift?.name || data?.giftName || `Gift ${data?.giftId || ''}`).trim();
    if (!tiktokUserId) return;
    try { await post('/api/gifts/ingest', { type: 'gift', tiktokUserId, username: uniqueId, coins: unitCoins, quantity, giftName }); console.log(`GIFT: @${uniqueId} -> ${giftName} x${quantity} (${unitCoins * quantity} points)`); } catch (error) { console.error(`Gift send failed: ${error?.message || error}`); }
  });
}
console.log(`Live Earth connector for @${username}`);
console.log('Leave this Terminal window open. Reconnection is automatic.');
while (true) {
  const connection = new TikTokLiveConnection(username, { enableExtendedGiftInfo: true, processInitialData: false });
  attachHandlers(connection);
  let heartbeatTimer;
  try {
    const state = await connection.connect();
    console.log(`CONNECTED to TikTok LIVE @${username} · room ${state.roomId}`);
    await heartbeat();
    heartbeatTimer = setInterval(heartbeat, 20000);
    await new Promise(resolve => connection.once('disconnected', resolve));
    console.log('TikTok connection dropped. Reconnecting in 5 seconds...');
  } catch (error) { console.log('Waiting for TikTok LIVE. Start your LIVE if it is not running yet.'); console.log(error?.message || error); }
  finally { if (heartbeatTimer) clearInterval(heartbeatTimer); }
  await delay(5000);
}
