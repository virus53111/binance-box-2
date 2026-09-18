import { useEffect, useMemo, useRef, useState } from 'react';
import Globe from 'react-globe.gl';
import { CheckCircle2, Copy, Gift, Globe2, KeyRound, MapPin, Radio, Satellite, Search, Sparkles, Trophy, Wifi, WifiOff } from 'lucide-react';
import CityCloseup from './CityCloseup';

type Place = {
  id: string;
  tiktokUserId: string;
  username: string;
  city: string;
  lat: number;
  lon: number;
  totalCoins: number;
  totalGifts: number;
  level: number;
  lastGift: string;
  updatedAt: number;
};

type WorldPayload = { places: Place[]; stats: { places: number; gifts: number; coins: number } };
type ControlStatus = { tiktokUsername: string; bridgeLastSeen: number; bridgeOnline: boolean; storage: string };
type ArcPulse = { startLat: number; startLng: number; endLat: number; endLng: number };
type CityRank = { city: string; coins: number; gifts: number; people: number };

const API_BASE = (import.meta.env.VITE_API_BASE || 'http://localhost:8787').replace(/\/$/, '');
const EARTH_DAY = 'https://cdn.jsdelivr.net/npm/three-globe/example/img/earth-blue-marble.jpg';
const EARTH_BUMP = 'https://cdn.jsdelivr.net/npm/three-globe/example/img/earth-topology.png';
const NIGHT_SKY = 'https://cdn.jsdelivr.net/npm/three-globe/example/img/night-sky.png';
const levelNames = ['Plot', 'Beacon', 'Tower', 'City', 'Mega City', 'Empire'];
const giftTiers = [
  { icon: '🌹', value: 'Rose', label: 'name marker' },
  { icon: '✨', value: '50+', label: 'beacon' },
  { icon: '🏙️', value: '500+', label: 'city' },
  { icon: '🌆', value: '1000+', label: 'mega city' },
  { icon: '👑', value: '5000+', label: 'empire' },
];

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, options);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

function adminHeaders(key: string) {
  return { 'content-type': 'application/json', 'x-admin-key': key };
}

function placeColor(place: Place) {
  if (place.level >= 6) return '#ffd86a';
  if (place.level >= 5) return '#b2f0ff';
  if (place.level >= 4) return '#7cf7ff';
  if (place.level >= 2) return '#45d5ff';
  return '#ffffff';
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char] || char);
}

function playGiftTone(level: number) {
  try {
    const context = new AudioContext();
    const now = context.currentTime;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(level >= 5 ? 0.16 : 0.1, now + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.1);
    gain.connect(context.destination);
    const notes = level >= 5 ? [0, 0.09, 0.18, 0.3] : [0, 0.13, 0.26];
    notes.forEach((delay, index) => {
      const oscillator = context.createOscillator();
      oscillator.type = index % 2 === 0 ? 'triangle' : 'sine';
      oscillator.frequency.setValueAtTime(390 + level * 62 + index * 150, now + delay);
      oscillator.connect(gain);
      oscillator.start(now + delay);
      oscillator.stop(now + delay + 0.42);
    });
    window.setTimeout(() => void context.close(), 1500);
  } catch { /* audio can be blocked by browser policy */ }
}

function CinematicGlobe({ places, activeEvent, obs }: { places: Place[]; activeEvent: Place | null; obs: boolean }) {
  const globeRef = useRef<any>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 900, height: 900 });

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;
    const update = () => setSize({ width: shell.clientWidth, height: shell.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(shell);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!activeEvent || !globeRef.current) return;
    const globe = globeRef.current;
    const controls = globe.controls();
    controls.autoRotate = false;
    globe.pointOfView({ lat: activeEvent.lat, lng: activeEvent.lon, altitude: 1.1 }, 900);
    const close = window.setTimeout(() => globe.pointOfView({ lat: activeEvent.lat, lng: activeEvent.lon, altitude: activeEvent.level >= 5 ? 0.36 : 0.46 }, 1350), 950);
    const pullBack = window.setTimeout(() => globe.pointOfView({ lat: activeEvent.lat, lng: activeEvent.lon, altitude: obs ? 1.62 : 1.82 }, 1550), 5200);
    const resume = window.setTimeout(() => { controls.autoRotate = true; }, 7000);
    return () => { window.clearTimeout(close); window.clearTimeout(pullBack); window.clearTimeout(resume); };
  }, [activeEvent, obs]);

  const arcs = useMemo<ArcPulse[]>(() => {
    if (!activeEvent) return [];
    const startLat = Math.max(-68, Math.min(68, activeEvent.lat + (activeEvent.lat >= 0 ? -34 : 34)));
    let startLng = activeEvent.lon - 92;
    if (startLng < -180) startLng += 360;
    return [{ startLat, startLng, endLat: activeEvent.lat, endLng: activeEvent.lon }];
  }, [activeEvent]);

  const labels = useMemo(() => {
    const important = places.filter(place => place.level >= 5).slice(0, 24);
    if (!activeEvent || important.some(place => place.id === activeEvent.id)) return important;
    return [...important, activeEvent];
  }, [activeEvent, places]);

  return (
    <div className="globe-shell" ref={shellRef}>
      <Globe
        ref={globeRef}
        width={size.width}
        height={size.height}
        backgroundImageUrl={NIGHT_SKY}
        backgroundColor="#01040a"
        globeImageUrl={EARTH_DAY}
        bumpImageUrl={EARTH_BUMP}
        showAtmosphere
        atmosphereColor="#79ddff"
        atmosphereAltitude={0.22}
        globeCurvatureResolution={3}
        animateIn
        enablePointerInteraction={!obs}
        pointsData={places}
        pointLat={(item: object) => (item as Place).lat}
        pointLng={(item: object) => (item as Place).lon}
        pointColor={(item: object) => placeColor(item as Place)}
        pointRadius={(item: object) => 0.08 + Math.min((item as Place).level, 6) * 0.055}
        pointAltitude={(item: object) => activeEvent?.id === (item as Place).id ? 0.26 + (item as Place).level * 0.04 : 0.008 + Math.min((item as Place).level, 6) * 0.018}
        pointLabel={(item: object) => { const place = item as Place; return `<b>@${escapeHtml(place.username)}</b><br/>${escapeHtml(place.city)} · ${levelNames[Math.max(0, place.level - 1)] || 'Empire'}<br/>${place.totalCoins.toLocaleString()} gift points`; }}
        pointsTransitionDuration={700}
        labelsData={labels}
        labelLat={(item: object) => (item as Place).lat}
        labelLng={(item: object) => (item as Place).lon}
        labelText={(item: object) => `@${(item as Place).username}`}
        labelColor={(item: object) => (item as Place).level >= 6 ? '#ffd86a' : '#ffffff'}
        labelSize={(item: object) => activeEvent?.id === (item as Place).id ? 1.45 : 0.72 + (item as Place).level * 0.09}
        labelDotRadius={(item: object) => activeEvent?.id === (item as Place).id ? 0.38 : 0.18}
        labelDotOrientation={() => 'bottom'}
        labelAltitude={0.1}
        labelsTransitionDuration={350}
        ringsData={activeEvent ? [activeEvent] : []}
        ringLat={(item: object) => (item as Place).lat}
        ringLng={(item: object) => (item as Place).lon}
        ringColor={() => activeEvent?.level === 6 ? '#ffd86a' : '#67e7ff'}
        ringMaxRadius={(item: object) => 7 + (item as Place).level * 2.7}
        ringPropagationSpeed={5}
        ringRepeatPeriod={520}
        arcsData={arcs}
        arcStartLat={(item: object) => (item as ArcPulse).startLat}
        arcStartLng={(item: object) => (item as ArcPulse).startLng}
        arcEndLat={(item: object) => (item as ArcPulse).endLat}
        arcEndLng={(item: object) => (item as ArcPulse).endLng}
        arcColor={() => ['rgba(95,226,255,0.03)', activeEvent?.level === 6 ? '#ffd86a' : '#f7feff']}
        arcAltitude={0.31}
        arcStroke={0.72}
        arcDashLength={0.28}
        arcDashGap={0.12}
        arcDashAnimateTime={880}
        arcsTransitionDuration={250}
        onGlobeReady={() => {
          const globe = globeRef.current;
          if (!globe) return;
          globe.pointOfView({ lat: 22, lng: 12, altitude: obs ? 1.72 : 1.95 }, 0);
          const controls = globe.controls();
          controls.autoRotate = true;
          controls.autoRotateSpeed = 0.42;
          controls.enablePan = false;
          controls.enableDamping = true;
          controls.dampingFactor = 0.08;
        }}
        onPointClick={(item: object) => {
          if (obs || !globeRef.current) return;
          const place = item as Place;
          globeRef.current.controls().autoRotate = false;
          globeRef.current.pointOfView({ lat: place.lat, lng: place.lon, altitude: 0.72 }, 1150);
        }}
      />
    </div>
  );
}

function EventEffects({ place }: { place: Place | null }) {
  if (!place) return null;
  return <div className={`event-effects tier-${Math.min(place.level, 6)}`}><div className="event-flash" /><div className="energy-beam" /><div className="impact-core" /><div className="particles">{Array.from({ length: place.level >= 5 ? 22 : 12 }, (_, index) => <i key={index} style={{ '--i': index } as React.CSSProperties} />)}</div></div>;
}

function LiveWorld({ obs }: { obs: boolean }) {
  const [world, setWorld] = useState<WorldPayload>({ places: [], stats: { places: 0, gifts: 0, coins: 0 } });
  const [connected, setConnected] = useState(false);
  const [queue, setQueue] = useState<Place[]>([]);
  const [activeEvent, setActiveEvent] = useState<Place | null>(null);
  const [cityView, setCityView] = useState(false);
  const [search, setSearch] = useState('');
  const [searchMessage, setSearchMessage] = useState('');
  const [rankingMode, setRankingMode] = useState<'people' | 'cities'>('people');
  const [serverError, setServerError] = useState('');

  useEffect(() => {
    let active = true;
    request<WorldPayload>('/api/world').then(data => { if (active) setWorld(data); }).catch(() => setServerError('Connecting to Live Earth server…'));
    const events = new EventSource(`${API_BASE}/api/events`);
    events.onopen = () => { setConnected(true); setServerError(''); };
    events.onerror = () => { setConnected(false); setServerError('Reconnecting to Live Earth server…'); };
    events.onmessage = event => {
      try {
        const update = JSON.parse(event.data) as { place?: Place; stats?: WorldPayload['stats'] };
        if (!update.place) return;
        const incoming = update.place;
        setWorld(previous => {
          const exists = previous.places.some(item => item.id === incoming.id);
          const places = exists ? previous.places.map(item => item.id === incoming.id ? incoming : item) : [...previous.places, incoming];
          return { places, stats: update.stats || previous.stats };
        });
        setQueue(previous => [...previous.slice(-30), incoming]);
      } catch { /* ignore malformed event */ }
    };
    return () => { active = false; events.close(); };
  }, []);

  useEffect(() => {
    if (activeEvent || queue.length === 0) return;
    setActiveEvent(queue[0]);
    setQueue(previous => previous.slice(1));
  }, [activeEvent, queue]);

  useEffect(() => {
    if (!activeEvent) { setCityView(false); return; }
    setCityView(false);
    playGiftTone(activeEvent.level);
    const showCity = window.setTimeout(() => setCityView(true), 2350);
    const hideCity = window.setTimeout(() => setCityView(false), 5200);
    const finish = window.setTimeout(() => setActiveEvent(null), 7500);
    return () => { window.clearTimeout(showCity); window.clearTimeout(hideCity); window.clearTimeout(finish); };
  }, [activeEvent]);

  const topPeople = useMemo(() => [...world.places].sort((a, b) => b.totalCoins - a.totalCoins).slice(0, 6), [world.places]);
  const topCities = useMemo<CityRank[]>(() => {
    const map = new Map<string, CityRank>();
    world.places.forEach(place => {
      const current = map.get(place.city) || { city: place.city, coins: 0, gifts: 0, people: 0 };
      current.coins += place.totalCoins;
      current.gifts += place.totalGifts;
      current.people += 1;
      map.set(place.city, current);
    });
    return [...map.values()].sort((a, b) => b.coins - a.coins).slice(0, 6);
  }, [world.places]);

  const runSearch = () => {
    const query = search.trim().replace(/^@/, '').toLowerCase();
    if (!query) return;
    const found = world.places.find(place => place.username.toLowerCase() === query) || world.places.find(place => place.username.toLowerCase().includes(query));
    if (!found) { setSearchMessage('No saved place found for that username yet.'); return; }
    setSearchMessage(`Flying to @${found.username} in ${found.city}`);
    setQueue(previous => [...previous, found]);
  };

  return (
    <main className={obs ? 'world obs-world' : 'world'}>
      <CinematicGlobe places={world.places} activeEvent={activeEvent} obs={obs} />
      <CityCloseup place={activeEvent} visible={cityView} />
      <EventEffects place={activeEvent} />
      <header className="live-head">
        <div className="live-brand"><Globe2 size={18} /><span>LIVE EARTH</span><i className={connected ? 'signal-dot online' : 'signal-dot'} /></div>
        <div className="headline"><span className="headline-kicker"><Satellite size={14} /> YOUR NAME. YOUR PLACE. PERMANENT.</span><h1>Claim your place on Earth</h1><p>Type <b>CITY London</b> in chat, then send a gift. Earth flies to your city and permanently upgrades your place.</p></div>
        {serverError && <div className="server-note">{serverError}</div>}
      </header>
      <section className="gift-scale">{giftTiers.map(tier => <div key={tier.value}><span>{tier.icon}</span><b>{tier.value}</b><small>{tier.label}</small></div>)}</section>
      <aside className="world-stats"><div><b>{world.stats.places.toLocaleString()}</b><span>places</span></div><div><b>{world.stats.gifts.toLocaleString()}</b><span>gifts</span></div><div><b>{world.stats.coins.toLocaleString()}</b><span>gift points</span></div></aside>
      {activeEvent && <aside className={`arrival-card level-${Math.min(activeEvent.level, 6)}`}><div className="arrival-kicker"><Sparkles size={15} /> {cityView ? 'CITY LOCKED · PLACE SAVED' : 'GIFT DETECTED · FLYING TO LOCATION'}</div><strong>@{activeEvent.username}</strong><span><MapPin size={14} /> {activeEvent.city}</span><div className="arrival-level">{levelNames[Math.max(0, activeEvent.level - 1)] || 'Empire'} · {activeEvent.totalCoins.toLocaleString()} total gift points</div><small>+ {activeEvent.lastGift} · SAVED PERMANENTLY</small></aside>}
      {!obs && <><section className="explore-panel"><div className="search-box"><Search size={15} /><input value={search} onChange={event => setSearch(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') runSearch(); }} placeholder="Find @username" /><button onClick={runSearch}>Fly</button></div>{searchMessage && <small className="search-message">{searchMessage}</small>}</section><aside className="leaderboard"><div className="rank-tabs"><button className={rankingMode === 'people' ? 'active' : ''} onClick={() => setRankingMode('people')}><Trophy size={12} /> People</button><button className={rankingMode === 'cities' ? 'active' : ''} onClick={() => setRankingMode('cities')}><Globe2 size={12} /> Cities</button></div>{rankingMode === 'people' ? (topPeople.length === 0 ? <p className="muted">The Earth is waiting for its first permanent marker.</p> : topPeople.map((place, index) => <button type="button" className="leader" key={place.id} onClick={() => setQueue(previous => [...previous, place])}><span>#{index + 1}</span><div><b>@{place.username}</b><small>{place.city} · {levelNames[Math.max(0, place.level - 1)]}</small></div><strong>{place.totalCoins}</strong></button>)) : topCities.length === 0 ? <p className="muted">No cities claimed yet.</p> : topCities.map((city, index) => <div className="leader city-rank" key={city.city}><span>#{index + 1}</span><div><b>{city.city}</b><small>{city.people} people · {city.gifts} gifts</small></div><strong>{city.coins}</strong></div>)}</aside></>}
      <div className="live-instruction"><Radio size={15} /> <b>1.</b> Type CITY + your city <span>→</span> <b>2.</b> Send a gift <span>→</span> Earth flies to you <span>→</span> your place stays forever</div>
    </main>
  );
}

function ControlPanel() {
  const [status, setStatus] = useState<ControlStatus | null>(null);
  const [username, setUsername] = useState('');
  const [adminKey, setAdminKey] = useState(() => localStorage.getItem('liveearth_admin_key') || '');
  const [verified, setVerified] = useState(false);
  const [command, setCommand] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const next = await request<ControlStatus>('/api/control/status');
      setStatus(next);
      setUsername(next.tiktokUsername || '');
    } catch { setMessage('Server is not ready yet.'); }
  };

  useEffect(() => { void load(); }, []);

  const unlock = async () => {
    try {
      await request<{ ok: boolean }>('/api/control/verify', { method: 'POST', headers: adminHeaders(adminKey), body: '{}' });
      localStorage.setItem('liveearth_admin_key', adminKey);
      setVerified(true);
      setMessage('Owner controls unlocked on this device.');
    } catch { setMessage('Wrong owner key.'); }
  };

  useEffect(() => {
    if (!adminKey) return;
    void request<{ ok: boolean }>('/api/control/verify', { method: 'POST', headers: adminHeaders(adminKey), body: '{}' }).then(() => setVerified(true)).catch(() => setVerified(false));
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => void load(), 12000);
    return () => window.clearInterval(timer);
  }, []);

  const prepareConnection = async () => {
    const cleanUsername = username.replace(/^@/, '').trim();
    if (!cleanUsername) { setMessage('Enter your TikTok username first.'); return; }
    setBusy(true);
    try {
      const data = await request<{ token: string; tiktokUsername: string }>('/api/control/connect', { method: 'POST', headers: adminHeaders(adminKey), body: JSON.stringify({ tiktokUsername: cleanUsername }) });
      const scriptUrl = `${window.location.origin}/bridge.mjs`;
      const nextCommand = `command -v node >/dev/null 2>&1 || { echo 'Node.js is required once. Opening download page...'; open 'https://nodejs.org/en/download'; exit 1; }; mkdir -p ~/LiveEarthBridge && curl -fsSL '${scriptUrl}' -o ~/LiveEarthBridge/bridge.mjs && npm install --prefix ~/LiveEarthBridge tiktok-live-connector@latest >/dev/null 2>&1 && TIKTOK_USER='${cleanUsername.replace(/'/g, '')}' BRIDGE_API='${API_BASE}' BRIDGE_TOKEN='${data.token.replace(/'/g, '')}' node ~/LiveEarthBridge/bridge.mjs`;
      setCommand(nextCommand);
      setUsername(data.tiktokUsername);
      setMessage('Ready. Start TikTok LIVE, then paste the copied command into Terminal.');
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not prepare the connection'); }
    finally { setBusy(false); }
  };

  const simulate = async (coins: number, giftName: string) => {
    try {
      await request('/api/control/simulate', { method: 'POST', headers: adminHeaders(adminKey), body: JSON.stringify({ coins, giftName }) });
      setMessage(`${giftName} sent to the live globe.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Test failed'); }
  };

  const copy = async (text: string) => { await navigator.clipboard.writeText(text); setMessage('Copied.'); };
  const obsUrl = `${window.location.origin}/?obs=1`;
  const bridgeOnline = Boolean(status?.bridgeLastSeen && Date.now() - status.bridgeLastSeen < 45000);

  if (!verified) {
    return <main className="control"><div className="control-card narrow"><KeyRound size={44} /><span className="eyebrow">LIVE EARTH OWNER</span><h1>Unlock setup</h1><p>Enter the private owner key once on this device. It is stored only in your browser.</p><input type="password" value={adminKey} onChange={event => setAdminKey(event.target.value)} placeholder="Owner key" /><button onClick={unlock}>Unlock</button>{message && <div className="notice">{message}</div>}</div></main>;
  }

  return <main className="control"><div className="control-card"><div className="control-heading"><div><span className="eyebrow">LIVE EARTH SETUP</span><h1>Connect and go LIVE</h1><p>Your GitHub site and Render backend are separate from AppDeploy. Places are stored in PostgreSQL.</p></div><a href="?" className="ghost">Open globe</a></div><div className={bridgeOnline ? 'connection-banner connected' : 'connection-banner'}>{bridgeOnline ? <Wifi size={20} /> : <WifiOff size={20} />}<div><b>{bridgeOnline ? 'TikTok LIVE connector is online' : 'TikTok connector is waiting'}</b><small>{bridgeOnline ? `Connected to @${status?.tiktokUsername}` : 'Start your LIVE and run the Mac command below.'}</small></div>{bridgeOnline && <CheckCircle2 size={22} />}</div><div className="storage-note">Storage: <b>{status?.storage || 'checking'}</b></div><div className="setup-grid"><section className="setup-step"><span className="step-number">1</span><div><h2>Connect your TikTok</h2><p>Enter the @username you use for LIVE. A private bridge token is rotated automatically.</p><div className="row"><input value={username} onChange={event => setUsername(event.target.value)} placeholder="your_tiktok_name" /><button onClick={prepareConnection} disabled={busy}>{busy ? 'Preparing…' : 'Connect TikTok'}</button></div>{command && <div className="action-box"><b>Start your TikTok LIVE first.</b><span>Then open Terminal on your Mac and paste this one command.</span><button onClick={() => copy(command)}><Copy size={17} /> Copy Mac connector</button><details><summary>Show command</summary><code>{command}</code></details></div>}</div></section><section className="setup-step"><span className="step-number">2</span><div><h2>Add Live Earth to OBS</h2><p>OBS → Browser Source → paste the link → set 1080 × 1920.</p><div className="url-box"><code>{obsUrl}</code><button className="icon-btn" onClick={() => copy(obsUrl)}><Copy size={17} /></button></div></div></section></div><div className="test-zone"><div><Gift size={22} /><div><b>Test the full effect before LIVE</b><small>Tests use the same persistent upgrade and cinematic queue as real gifts.</small></div></div><div className="row wrap"><button className="secondary" onClick={() => simulate(1, 'Rose')}>🌹 Rose</button><button className="secondary" onClick={() => simulate(100, 'Galaxy Spark')}>✨ 100</button><button className="secondary" onClick={() => simulate(1000, 'City Drop')}>🌆 1000</button><button className="secondary" onClick={() => simulate(5000, 'Empire Crown')}>👑 5000</button><a className="test-link" href="?" target="_blank" rel="noreferrer">Watch globe</a></div></div><div className="how-it-works"><b>Viewer flow:</b> comment <code>CITY Paris</code> → send gift → Earth flies to Paris → detailed city map locks on the plot → @username appears → the place is saved → future gifts upgrade the same place.</div>{message && <div className="notice">{message}</div>}</div></main>;
}

function App() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('control') === '1') return <ControlPanel />;
  return <LiveWorld obs={params.get('obs') === '1'} />;
}

export default App;
