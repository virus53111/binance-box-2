import crypto from 'node:crypto';
import express from 'express';
import cors from 'cors';
import pg from 'pg';

const { Pool } = pg;
const PORT = Number(process.env.PORT || 8787);
const ADMIN_KEY = String(process.env.ADMIN_KEY || '');
const DATABASE_URL = String(process.env.DATABASE_URL || '');
const allowedOrigins = new Set(['https://murdilimax.com', 'https://www.murdilimax.com']);
const app = express();
app.use(cors({ origin(origin, callback) { if (!origin || allowedOrigins.has(origin) || /^http:\/\/localhost:\d+$/.test(origin)) return callback(null, true); return callback(null, false); } }));
app.use(express.json({ limit: '64kb' }));

const pool = DATABASE_URL ? new Pool({ connectionString: DATABASE_URL, ssl: DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false }, max: 8 }) : null;
const memory = { config: { tiktokUsername: '', bridgeTokenHash: '', bridgeLastSeen: 0 }, places: new Map() };
const clients = new Set();
const CITIES = [
  ['Warsaw',52.2297,21.0122],['Berlin',52.52,13.405],['Paris',48.8566,2.3522],['London',51.5072,-0.1276],['Madrid',40.4168,-3.7038],['Rome',41.9028,12.4964],['Prague',50.0755,14.4378],['Vienna',48.2082,16.3738],['Vilnius',54.6872,25.2797],['Riga',56.9496,24.1052],['Tallinn',59.437,24.7536],['Helsinki',60.1699,24.9384],['Stockholm',59.3293,18.0686],['Oslo',59.9139,10.7522],['Lisbon',38.7223,-9.1393],['New York',40.7128,-74.006],['Miami',25.7617,-80.1918],['Los Angeles',34.0522,-118.2437],['Toronto',43.6532,-79.3832],['Mexico City',19.4326,-99.1332],['Sao Paulo',-23.5505,-46.6333],['Buenos Aires',-34.6037,-58.3816],['Tokyo',35.6762,139.6503],['Seoul',37.5665,126.978],['Singapore',1.3521,103.8198],['Bangkok',13.7563,100.5018],['Dubai',25.2048,55.2708],['Istanbul',41.0082,28.9784],['Cairo',30.0444,31.2357],['Cape Town',-33.9249,18.4241],['Sydney',-33.8688,151.2093],['Auckland',-36.8509,174.7645],['Kyiv',50.4501,30.5234],['Amsterdam',52.3676,4.9041],['Brussels',50.8503,4.3517],['Budapest',47.4979,19.0402],['Athens',37.9838,23.7275],['Barcelona',41.3874,2.1686],['Dublin',53.3498,-6.2603],['Chicago',41.8781,-87.6298],['San Francisco',37.7749,-122.4194],['Vancouver',49.2827,-123.1207],['Rio de Janeiro',-22.9068,-43.1729],['Lima',-12.0464,-77.0428],['Bogota',4.711,-74.0721],['Delhi',28.6139,77.209],['Mumbai',19.076,72.8777],['Jakarta',-6.2088,106.8456],['Manila',14.5995,120.9842],['Hong Kong',22.3193,114.1694],['Taipei',25.033,121.5654],['Melbourne',-37.8136,144.9631],['Johannesburg',-26.2041,28.0473],['Casablanca',33.5731,-7.5898],['Bucharest',44.4268,26.1025],['Sofia',42.6977,23.3219],['Belgrade',44.7866,20.4489],['Zagreb',45.815,15.9819],['Ljubljana',46.0569,14.5058],['Copenhagen',55.6761,12.5683],['Reykjavik',64.1466,-21.9426],['Edinburgh',55.9533,-3.1883],['Manchester',53.4808,-2.2426],['Boston',42.3601,-71.0589],['Seattle',47.6062,-122.3321],['Houston',29.7604,-95.3698],['Dallas',32.7767,-96.797],['Las Vegas',36.1699,-115.1398],['Montreal',45.5017,-73.5673],['Santiago',-33.4489,-70.6693],['Quito',-0.1807,-78.4678],['Medellin',6.2442,-75.5812],['Doha',25.2854,51.531],['Riyadh',24.7136,46.6753],['Tel Aviv',32.0853,34.7818],['Kuala Lumpur',3.139,101.6869],['Ho Chi Minh City',10.8231,106.6297],['Hanoi',21.0278,105.8342],['Osaka',34.6937,135.5023],['Beijing',39.9042,116.4074],['Shanghai',31.2304,121.4737],['Guangzhou',23.1291,113.2644],['Bengaluru',12.9716,77.5946],['Karachi',24.8607,67.0011],['Nairobi',-1.2921,36.8219],['Lagos',6.5244,3.3792],['Accra',5.6037,-0.187],['Marrakesh',31.6295,-7.9811],['Tunis',36.8065,10.1815],['Alexandria',31.2001,29.9187]
];

const normalizeCity = value => String(value || '').trim().toLowerCase().replace(/[^a-zа-яё\s-]/gi, '').replace(/\s+/g, ' ');
const hashString = value => { let hash = 2166136261; for (let i = 0; i < value.length; i += 1) { hash ^= value.charCodeAt(i); hash = Math.imul(hash, 16777619); } return hash >>> 0; };
const locate = (cityName, seed) => {
  const normalized = normalizeCity(cityName);
  const selected = CITIES.find(city => normalizeCity(city[0]) === normalized) || CITIES[hashString(seed) % CITIES.length];
  const a = hashString(`${seed}:${selected[0]}:angle`);
  const b = hashString(`${seed}:${selected[0]}:radius`);
  const angle = (a / 4294967295) * Math.PI * 2;
  const radius = 0.055 + Math.sqrt(b / 4294967295) * 0.82;
  const latitudeScale = Math.max(0.35, Math.cos(selected[1] * Math.PI / 180));
  return { city: selected[0], lat: selected[1] + Math.sin(angle) * radius, lon: selected[2] + Math.cos(angle) * radius / latitudeScale };
};
const levelFor = coins => coins >= 5000 ? 6 : coins >= 1000 ? 5 : coins >= 500 ? 4 : coins >= 50 ? 3 : coins >= 10 ? 2 : 1;
const hashToken = value => crypto.createHash('sha256').update(value).digest('hex');
const rowToPlace = row => ({ id: row.tiktok_user_id, tiktokUserId: row.tiktok_user_id, username: row.username, city: row.city, lat: Number(row.lat), lon: Number(row.lon), totalCoins: Number(row.total_coins), totalGifts: Number(row.total_gifts), level: Number(row.level), lastGift: row.last_gift, updatedAt: Number(row.updated_at) });

async function init() {
  if (!pool) { console.warn('DATABASE_URL is not configured. Running in temporary memory mode.'); return; }
  await pool.query('CREATE TABLE IF NOT EXISTS liveearth_config (id integer PRIMARY KEY, tiktok_username text NOT NULL DEFAULT \'\', bridge_token_hash text NOT NULL DEFAULT \'\', bridge_last_seen bigint NOT NULL DEFAULT 0)');
  await pool.query('INSERT INTO liveearth_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING');
  await pool.query('CREATE TABLE IF NOT EXISTS liveearth_places (tiktok_user_id text PRIMARY KEY, username text NOT NULL, city text NOT NULL, lat double precision NOT NULL, lon double precision NOT NULL, total_coins integer NOT NULL DEFAULT 0, total_gifts integer NOT NULL DEFAULT 0, level integer NOT NULL DEFAULT 1, last_gift text NOT NULL DEFAULT \'\', updated_at bigint NOT NULL)');
  await pool.query("DELETE FROM liveearth_places WHERE tiktok_user_id='demo-owner'");
}

async function getConfig() {
  if (!pool) return memory.config;
  const { rows } = await pool.query('SELECT * FROM liveearth_config WHERE id=1');
  const row = rows[0];
  return { tiktokUsername: row?.tiktok_username || '', bridgeTokenHash: row?.bridge_token_hash || '', bridgeLastSeen: Number(row?.bridge_last_seen || 0) };
}

async function setConfig(patch) {
  if (!pool) { Object.assign(memory.config, patch); return; }
  const current = await getConfig();
  const next = { ...current, ...patch };
  await pool.query('UPDATE liveearth_config SET tiktok_username=$1, bridge_token_hash=$2, bridge_last_seen=$3 WHERE id=1', [next.tiktokUsername, next.bridgeTokenHash, next.bridgeLastSeen]);
}

async function snapshot() {
  if (!pool) {
    const places = [...memory.places.values()].filter(x => x.totalGifts > 0 && x.tiktokUserId !== 'demo-owner');
    return { places, stats: places.reduce((a,p) => ({ places:a.places+1,gifts:a.gifts+p.totalGifts,coins:a.coins+p.totalCoins }), {places:0,gifts:0,coins:0}) };
  }
  const { rows } = await pool.query("SELECT * FROM liveearth_places WHERE total_gifts > 0 AND tiktok_user_id <> 'demo-owner' ORDER BY updated_at DESC LIMIT 5000");
  const places = rows.map(rowToPlace);
  return { places, stats: places.reduce((a,p) => ({ places:a.places+1,gifts:a.gifts+p.totalGifts,coins:a.coins+p.totalCoins }), {places:0,gifts:0,coins:0}) };
}

async function chooseCity(tiktokUserId, username, cityInput) {
  const exact = CITIES.find(city => normalizeCity(city[0]) === normalizeCity(cityInput));
  if (!exact) return null;
  const position = locate(exact[0], tiktokUserId);
  if (!pool) {
    const current = memory.places.get(tiktokUserId) || { id:tiktokUserId,tiktokUserId,username,totalCoins:0,totalGifts:0,level:1,lastGift:'',updatedAt:Date.now() };
    const next = { ...current, username, city: position.city, lat: position.lat, lon: position.lon, updatedAt: Date.now() };
    memory.places.set(tiktokUserId, next);
    return next;
  }
  const { rows } = await pool.query('INSERT INTO liveearth_places (tiktok_user_id,username,city,lat,lon,total_coins,total_gifts,level,last_gift,updated_at) VALUES ($1,$2,$3,$4,$5,0,0,1,\'\',$6) ON CONFLICT (tiktok_user_id) DO UPDATE SET username=EXCLUDED.username,city=EXCLUDED.city,lat=EXCLUDED.lat,lon=EXCLUDED.lon,updated_at=EXCLUDED.updated_at RETURNING *', [tiktokUserId, username, position.city, position.lat, position.lon, Date.now()]);
  return rowToPlace(rows[0]);
}

async function applyGift({ tiktokUserId, username, coins, quantity, giftName }) {
  quantity = Math.max(1, Math.floor(Number(quantity) || 1));
  coins = Math.max(1, Math.floor(Number(coins) || 1)) * quantity;
  if (!pool) {
    const current = memory.places.get(tiktokUserId);
    const position = current || locate('', tiktokUserId);
    const totalCoins = (current?.totalCoins || 0) + coins;
    const next = { id:tiktokUserId,tiktokUserId,username,city:current?.city || position.city,lat:current?.lat ?? position.lat,lon:current?.lon ?? position.lon,totalCoins,totalGifts:(current?.totalGifts || 0)+quantity,level:levelFor(totalCoins),lastGift:giftName,updatedAt:Date.now() };
    memory.places.set(tiktokUserId,next);
    return next;
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const found = await client.query('SELECT * FROM liveearth_places WHERE tiktok_user_id=$1 FOR UPDATE', [tiktokUserId]);
    let row;
    if (!found.rows[0]) {
      const position = locate('', tiktokUserId);
      const inserted = await client.query('INSERT INTO liveearth_places (tiktok_user_id,username,city,lat,lon,total_coins,total_gifts,level,last_gift,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *', [tiktokUserId,username,position.city,position.lat,position.lon,coins,quantity,levelFor(coins),giftName,Date.now()]);
      row = inserted.rows[0];
    } else {
      const current = found.rows[0];
      const totalCoins = Number(current.total_coins) + coins;
      const updated = await client.query('UPDATE liveearth_places SET username=$2,total_coins=$3,total_gifts=total_gifts+$4,level=$5,last_gift=$6,updated_at=$7 WHERE tiktok_user_id=$1 RETURNING *', [tiktokUserId,username,totalCoins,quantity,levelFor(totalCoins),giftName,Date.now()]);
      row = updated.rows[0];
    }
    await client.query('COMMIT');
    return rowToPlace(row);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

function broadcast(payload) {
  const line = `data: ${JSON.stringify(payload)}\n\n`;
  for (const client of clients) client.write(line);
}
function sameSecret(a,b) { if (!a || !b) return false; const x=Buffer.from(String(a)); const y=Buffer.from(String(b)); return x.length===y.length && crypto.timingSafeEqual(x,y); }
function requireAdmin(req,res,next) { if (!ADMIN_KEY) return res.status(503).json({ error:'ADMIN_KEY is not configured' }); if (!sameSecret(req.get('x-admin-key'),ADMIN_KEY)) return res.status(401).json({ error:'Unauthorized' }); next(); }
async function requireBridge(req,res,next) { const config = await getConfig(); const token = String(req.get('x-bridge-token') || ''); if (!token || hashToken(token) !== config.bridgeTokenHash) return res.status(401).json({ error:'Invalid bridge token' }); next(); }

app.get('/api/health', async (_req,res) => { try { if (pool) await pool.query('SELECT 1'); res.json({ ok:true, storage:pool?'postgres':'memory' }); } catch (error) { res.status(503).json({ ok:false,error:String(error) }); } });
app.get('/api/world', async (_req,res) => res.json(await snapshot()));
app.get('/api/events', (req,res) => { res.setHeader('Content-Type','text/event-stream'); res.setHeader('Cache-Control','no-cache'); res.setHeader('Connection','keep-alive'); res.flushHeaders(); res.write(': live-earth\n\n'); clients.add(res); const keepAlive=setInterval(()=>res.write(': ping\n\n'),20000); req.on('close',()=>{ clearInterval(keepAlive); clients.delete(res); }); });
app.get('/api/control/status', async (_req,res) => { const config=await getConfig(); res.json({ tiktokUsername:config.tiktokUsername, bridgeLastSeen:config.bridgeLastSeen, bridgeOnline:Boolean(config.bridgeLastSeen && Date.now()-config.bridgeLastSeen<45000), storage:pool?'postgres':'memory' }); });
app.post('/api/control/verify', requireAdmin, (_req,res) => res.json({ ok:true }));
app.post('/api/control/connect', requireAdmin, async (req,res) => { const username=String(req.body?.tiktokUsername || '').replace(/^@/,'').trim().slice(0,64); if(!username) return res.status(400).json({error:'TikTok username is required'}); const token=crypto.randomBytes(24).toString('hex'); await setConfig({ tiktokUsername:username, bridgeTokenHash:hashToken(token), bridgeLastSeen:0 }); res.json({ token, tiktokUsername:username }); });
app.post('/api/control/simulate', requireAdmin, async (req,res) => {
  const coins=Math.max(1,Number(req.body?.coins || 1));
  const giftName=String(req.body?.giftName || 'Rose').slice(0,80);
  const position = locate('Tokyo', 'demo-owner');
  const place = { id:'demo-owner', tiktokUserId:'demo-owner', username:'preview_viewer', city:position.city, lat:position.lat, lon:position.lon, totalCoins:coins, totalGifts:1, level:levelFor(coins), lastGift:giftName, updatedAt:Date.now() };
  const world=await snapshot();
  broadcast({place,stats:world.stats,preview:true});
  res.json({ok:true,place,preview:true});
});
app.post('/api/bridge/heartbeat', requireBridge, async (_req,res) => { const bridgeLastSeen=Date.now(); await setConfig({bridgeLastSeen}); res.json({ok:true,bridgeLastSeen}); });
app.post('/api/gifts/ingest', requireBridge, async (req,res) => { const type=String(req.body?.type || 'gift'); const tiktokUserId=String(req.body?.tiktokUserId || '').slice(0,100); const username=String(req.body?.username || 'viewer').replace(/^@/,'').slice(0,80); if(!tiktokUserId) return res.status(400).json({error:'tiktokUserId is required'}); if(type==='city'){ const place=await chooseCity(tiktokUserId,username,String(req.body?.city || '').slice(0,80)); if(!place) return res.status(400).json({error:'Unknown city'}); return res.json({ok:true,city:place.city}); } const place=await applyGift({tiktokUserId,username,coins:req.body?.coins,quantity:req.body?.quantity,giftName:String(req.body?.giftName || 'Gift').slice(0,80)}); const world=await snapshot(); broadcast({place,stats:world.stats}); res.json({ok:true,place}); });
app.use((error,_req,res,_next) => { console.error(error); res.status(500).json({error:'Server error'}); });

await init();
app.listen(PORT,'0.0.0.0',()=>console.log(`Live Earth API listening on ${PORT} · storage=${pool?'postgres':'memory'} · persistent-names=on`));
