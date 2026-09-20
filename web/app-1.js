const API_BASE = 'https://murdilimax-live-earth-api.onrender.com';

const I18N = {
  ru: {
    live:'LIVE', method:'Метод', eyebrow:'EARLY TOKEN INTELLIGENCE', headline:'Радар, который отбрасывает шум.', subhead:'Новые Solana/Pump.fun токены → рынок → on-chain → security → creator history → публичные CEX-упоминания.',
    newRate:'Новых / мин', tracked:'Под наблюдением', liveUniverse:'живой поток', candidates:'Кандидаты', primeNow:'prime сейчас', riskFlags:'Critical risk', autoFiltered:'авто-фильтруются', alerts24:'Алертов / 24ч', soundReady:'звук для важных',
    search:'Название, тикер или контракт…', all:'Все', candidate:'Кандидаты', fresh:'Свежие <15м', watchlist:'Watchlist', riskAny:'Любой риск', riskLow:'Low', riskMedium:'Medium', riskHigh:'High', sortScore:'Score ↓', sortNew:'Самые новые', sortLiq:'Ликвидность ↓', sortVol:'Объём ↓',
    liveScanner:'LIVE SCANNER', rankedCandidates:'Ранжированные токены', shown:'показано', token:'TOKEN', age:'AGE', holders:'HOLDERS', risk:'RISK', signal:'SIGNAL', connecting:'Подключаем радар…', noFake:'Демо-данных нет — ждём реальные источники.',
    eventStream:'EVENT STREAM', importantNow:'Важное сейчас', sourceHealth:'Источники', sourceNote:'Если источник недоступен, радар показывает это явно и не подменяет данные.', disclaimer:'Radar Score — приоритизация для исследования, а не прогноз доходности и не рекомендация купить. Микрокап-токены могут потерять всю стоимость. Проверяйте контракт и источники самостоятельно.',
    methodTitle:'Как читать Radar Score', mMarket:'Market quality', mMarketText:'Ликвидность, глубина относительно market cap, наличие рынка.', mMomentum:'Momentum', mMomentumText:'Объём, транзакции, баланс buys/sells, ускорение.', mSecurity:'On-chain security', mSecurityText:'Mint/freeze authority и доступные security-флаги.', mDistribution:'Distribution', mDistributionText:'Концентрация крупнейших держателей после bonding curve.', mTransparency:'Transparency', mTransparencyText:'Сайт, X, Telegram, creator context.', mAttention:'Public attention', mAttentionText:'DEX boosts, graduation и совпадения названия/тикера с публичными CEX-анонсами.', methodWarning:'Score не оценивает вероятность 10x/100x. Он нужен, чтобы быстро сузить поток и показать, почему токен поднялся в радаре.',
    sound:'Звук', soundOn:'Звук вкл', online:'онлайн', degraded:'частично', offline:'нет связи', noEvents:'Важных событий пока нет.', score:'Radar Score', market:'Market', momentum:'Momentum', security:'Security', distribution:'Distribution', transparency:'Transparency', attention:'Attention',
    marketData:'Рынок', price:'Цена', marketCap:'Market cap', liquidity:'Ликвидность', volume1h:'Объём 1ч', tx5m:'Сделок 5м', boosts:'DEX boosts', holderIntel:'Holder intelligence', top1:'Top 1', top5:'Top 5', top10:'Top 10', holderCount:'Holders', holderBonding:'Bonding curve активна — концентрация не штрафуется.',
    securityChecks:'Security & controls', mintAuth:'Mint authority', freezeAuth:'Freeze authority', revoked:'REVOKED', active:'ACTIVE', unavailable:'нет данных', creatorIntel:'Creator intelligence', projects:'Проектов найдено', completed:'Graduated', created24:'Создано за 24ч', serial:'Serial deployer', links:'Источники и ссылки', timeline:'Наблюдаемая история', reasons:'Почему поднялся', flags:'Флаги риска', cexWatch:'CEX watch', noCex:'Публичных Binance-упоминаний не найдено.', cexCaution:'Это совпадение названия/тикера с публичным Binance-анонсом. Оно не подтверждает листинг именно этого контракта и не прогнозирует будущий листинг.',
    website:'Сайт', twitter:'X / Twitter', telegram:'Telegram', dex:'DEX Screener', pump:'Pump.fun', solscan:'Solscan', copy:'Копировать', copied:'Скопировано', loading:'Проверяем on-chain и источники…', unknown:'Unknown', noTimeline:'Недостаточно истории.', riskStage:'стадия', source:'Источник', updated:'Обновлено', sourceError:'ошибка источника'
  },
  en: {
    live:'LIVE', method:'Method', eyebrow:'EARLY TOKEN INTELLIGENCE', headline:'A radar built to cut through noise.', subhead:'New Solana/Pump.fun tokens → market → on-chain → security → creator history → public CEX mentions.',
    newRate:'New / min', tracked:'Tracked', liveUniverse:'live universe', candidates:'Candidates', primeNow:'prime now', riskFlags:'Critical risk', autoFiltered:'auto-filtered', alerts24:'Alerts / 24h', soundReady:'sound for important',
    search:'Name, ticker or contract…', all:'All', candidate:'Candidates', fresh:'Fresh <15m', watchlist:'Watchlist', riskAny:'Any risk', riskLow:'Low', riskMedium:'Medium', riskHigh:'High', sortScore:'Score ↓', sortNew:'Newest', sortLiq:'Liquidity ↓', sortVol:'Volume ↓',
    liveScanner:'LIVE SCANNER', rankedCandidates:'Ranked tokens', shown:'shown', token:'TOKEN', age:'AGE', holders:'HOLDERS', risk:'RISK', signal:'SIGNAL', connecting:'Connecting radar…', noFake:'No demo data — waiting for real sources.',
    eventStream:'EVENT STREAM', importantNow:'Important now', sourceHealth:'Sources', sourceNote:'When a source is unavailable, the radar says so explicitly and never replaces it with fake data.', disclaimer:'Radar Score is research triage, not a return forecast or a recommendation to buy. Micro-cap tokens can lose all value. Verify contracts and sources independently.',
    methodTitle:'How to read Radar Score', mMarket:'Market quality', mMarketText:'Liquidity, depth versus market cap and actual market availability.', mMomentum:'Momentum', mMomentumText:'Volume, transactions, buy/sell balance and acceleration.', mSecurity:'On-chain security', mSecurityText:'Mint/freeze authority and available security flags.', mDistribution:'Distribution', mDistributionText:'Largest-holder concentration after the bonding curve.', mTransparency:'Transparency', mTransparencyText:'Website, X, Telegram and creator context.', mAttention:'Public attention', mAttentionText:'DEX boosts, graduation and name/ticker matches against public CEX announcements.', methodWarning:'The score does not estimate the probability of a 10x/100x return. It narrows the stream and explains why a token rose on the radar.',
    sound:'Sound', soundOn:'Sound on', online:'online', degraded:'degraded', offline:'offline', noEvents:'No important events yet.', score:'Radar Score', market:'Market', momentum:'Momentum', security:'Security', distribution:'Distribution', transparency:'Transparency', attention:'Attention',
    marketData:'Market', price:'Price', marketCap:'Market cap', liquidity:'Liquidity', volume1h:'Volume 1h', tx5m:'Trades 5m', boosts:'DEX boosts', holderIntel:'Holder intelligence', top1:'Top 1', top5:'Top 5', top10:'Top 10', holderCount:'Holders', holderBonding:'Bonding curve active — concentration is not penalized.',
    securityChecks:'Security & controls', mintAuth:'Mint authority', freezeAuth:'Freeze authority', revoked:'REVOKED', active:'ACTIVE', unavailable:'unavailable', creatorIntel:'Creator intelligence', projects:'Projects found', completed:'Graduated', created24:'Created in 24h', serial:'Serial deployer', links:'Sources & links', timeline:'Observed history', reasons:'Why it surfaced', flags:'Risk flags', cexWatch:'CEX watch', noCex:'No public Binance mentions detected.', cexCaution:'This is a name/ticker match against a public Binance announcement. It does not verify this exact contract or predict a future listing.',
    website:'Website', twitter:'X / Twitter', telegram:'Telegram', dex:'DEX Screener', pump:'Pump.fun', solscan:'Solscan', copy:'Copy', copied:'Copied', loading:'Checking on-chain and sources…', unknown:'Unknown', noTimeline:'Not enough history.', riskStage:'stage', source:'Source', updated:'Updated', sourceError:'source error'
  }
};

const reasonLabels = {
  ru:{liquidity_10k:'Ликвидность > $10k',liquidity_50k:'Ликвидность > $50k',mint_revoked:'Mint authority отозван',freeze_revoked:'Freeze authority отозван',distribution_broad:'Широкое распределение',dex_boosts:'Есть DEX boosts',binance_public_mention:'Публичное Binance-упоминание',pump_graduated:'Pump.fun graduated'},
  en:{liquidity_10k:'Liquidity > $10k',liquidity_50k:'Liquidity > $50k',mint_revoked:'Mint authority revoked',freeze_revoked:'Freeze authority revoked',distribution_broad:'Broad distribution',dex_boosts:'DEX boosts active',binance_public_mention:'Public Binance mention',pump_graduated:'Pump.fun graduated'}
};
const flagLabels = {
  ru:{thin_liquidity:'Тонкая ликвидность',one_sided_flow:'Односторонний flow',vertical_price_move:'Вертикальное движение',mint_authority_active:'Mint authority активен',freeze_authority_active:'Freeze authority активен',token_2022_review:'Token-2022: проверить',creator_flagged:'Creator flagged',top10_extreme:'Top10 экстремально концентрирован',top10_concentrated:'Top10 концентрирован',top1_large:'Крупный Top1',serial_deployer:'Серийный deployer',goplus_mintable:'GoPlus: mintable',goplus_freezable:'GoPlus: freezable',goplus_non_transferable:'GoPlus: non-transferable',goplus_closable:'GoPlus: closable',goplus_balance_mutable:'GoPlus: balance mutable',goplus_fee_upgradable:'GoPlus: fee upgradable',goplus_account_state_upgradable:'GoPlus: account state upgradable'},
  en:{thin_liquidity:'Thin liquidity',one_sided_flow:'One-sided flow',vertical_price_move:'Vertical price move',mint_authority_active:'Mint authority active',freeze_authority_active:'Freeze authority active',token_2022_review:'Token-2022: review',creator_flagged:'Creator flagged',top10_extreme:'Top10 extremely concentrated',top10_concentrated:'Top10 concentrated',top1_large:'Large Top1 holder',serial_deployer:'Serial deployer',goplus_mintable:'GoPlus: mintable',goplus_freezable:'GoPlus: freezable',goplus_non_transferable:'GoPlus: non-transferable',goplus_closable:'GoPlus: closable',goplus_balance_mutable:'GoPlus: balance mutable',goplus_fee_upgradable:'GoPlus: fee upgradable',goplus_account_state_upgradable:'GoPlus: account state upgradable'}
};

const state = {
  lang: localStorage.getItem('radar-lang') || 'ru',
  sound: localStorage.getItem('radar-sound') === 'on',
  data: null,
  tier: 'all', risk: 'all', sort: 'score', search: '',
  watchlist: new Set(JSON.parse(localStorage.getItem('radar-watchlist') || '[]')),
  selectedMint: null,
  audio: null,
  lastFetch: 0,
  connected: false
};

const $ = id => document.getElementById(id);
const t = key => I18N[state.lang][key] || key;
const esc = value => String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const short = value => value ? `${value.slice(0,5)}…${value.slice(-4)}` : '—';

function formatMoney(v){v=Number(v)||0;if(!v)return '—';const a=Math.abs(v);if(a>=1e9)return `$${(v/1e9).toFixed(a>=1e10?1:2)}B`;if(a>=1e6)return `$${(v/1e6).toFixed(a>=1e7?1:2)}M`;if(a>=1e3)return `$${(v/1e3).toFixed(a>=1e5?0:1)}K`;if(a<.01)return `$${v.toExponential(2)}`;return `$${v.toFixed(2)}`}
function formatPrice(v){v=Number(v)||0;if(!v)return '—';if(v<.000001)return `$${v.toExponential(3)}`;if(v<.01)return `$${v.toPrecision(4)}`;return `$${v.toFixed(v<1?4:2)}`}
function formatAge(ms){ms=Math.max(0,Number(ms)||0);const m=Math.floor(ms/60000);if(m<1)return '<1m';if(m<60)return `${m}m`;const h=Math.floor(m/60);if(h<24)return `${h}h ${m%60}m`;return `${Math.floor(h/24)}d`}
function timeAgo(ts){const d=Date.now()-Number(ts||0);if(d<60000)return state.lang==='ru'?'сейчас':'now';if(d<3600000)return `${Math.floor(d/60000)}m`;if(d<86400000)return `${Math.floor(d/3600000)}h`;return `${Math.floor(d/86400000)}d`}
function pct(v){return Number.isFinite(Number(v))?`${Number(v).toFixed(Number(v)>=10?1:2)}%`:'—'}
function numFmt(v){v=Number(v)||0;return new Intl.NumberFormat(state.lang==='ru'?'ru-RU':'en-US',{maximumFractionDigits:0}).format(v)}

function applyLang(){
  document.documentElement.lang=state.lang;
  document.querySelectorAll('[data-i18n]').forEach(el=>{const k=el.dataset.i18n;if(I18N[state.lang][k])el.textContent=I18N[state.lang][k]});
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el=>{const k=el.dataset.i18nPlaceholder;el.placeholder=I18N[state.lang][k]||''});
  $('langLabel').textContent=state.lang.toUpperCase();
  updateSoundButton();
  renderAll();
}

function updateSoundButton(){
  $('soundBtn').classList.toggle('sound-on',state.sound);
  $('soundIcon').textContent=state.sound?'◉':'◼';
  $('soundLabel').textContent=state.sound?t('soundOn'):t('sound');
}

function initAudio(){if(!state.audio)state.audio=new (window.AudioContext||window.webkitAudioContext)();if(state.audio.state==='suspended')state.audio.resume()}
function beep(severity='important'){
  if(!state.sound)return;initAudio();const ctx=state.audio;const at=ctx.currentTime;
  const notes=severity==='critical'?[740,980,740]:[620,820];
  notes.forEach((freq,i)=>{const o=ctx.createOscillator();const g=ctx.createGain();o.type='sine';o.frequency.value=freq;g.gain.setValueAtTime(0.0001,at+i*.13);g.gain.exponentialRampToValueAtTime(.07,at+i*.13+.015);g.gain.exponentialRampToValueAtTime(.0001,at+i*.13+.11);o.connect(g).connect(ctx.destination);o.start(at+i*.13);o.stop(at+i*.13+.12)})
}

async function fetchRadar(){
  try{
    const res=await fetch(`${API_BASE}/api/radar?limit=220&maxAgeHours=48`,{cache:'no-store'});if(!res.ok)throw new Error(`HTTP ${res.status}`);
    state.data=await res.json();state.lastFetch=Date.now();state.connected=true;renderAll();updateConnection();
  }catch(e){state.connected=false;updateConnection(e.message);if(!state.data)renderAll()}
}

function connectEvents(){
  try{
    const es=new EventSource(`${API_BASE}/api/events`);
    es.addEventListener('hello',()=>{state.connected=true;updateConnection()});
    es.addEventListener('alert',event=>{try{const alert=JSON.parse(event.data);handleAlert(alert)}catch{}});
    es.addEventListener('new-token',()=>{if(Date.now()-state.lastFetch>2500)fetchRadar()});
    es.onerror=()=>{state.connected=false;updateConnection();setTimeout(()=>{try{es.close()}catch{};connectEvents()},8000)};
  }catch{}
}

function handleAlert(alert){
  if(state.data){state.data.alerts=[alert,...(state.data.alerts||[]).filter(a=>a.id!==alert.id)].slice(0,50)}
  renderAlerts();
  if(alert.severity==='critical'||alert.severity==='important'){beep(alert.severity);showToast(alert);fetchRadar()}
}

function showToast(alert){
  const box=document.createElement('div');box.className=`toast ${alert.severity||''}`;
  box.innerHTML=`<i></i><div><strong>${esc(alert.symbol||'RADAR')} · ${esc(alertTitle(alert))}</strong><span>${esc(alert.message||'')}</span></div><button>×</button>`;
  box.querySelector('button').onclick=()=>box.remove();
  box.onclick=e=>{if(e.target.tagName!=='BUTTON'&&alert.mint)openToken(alert.mint)};
  $('toastStack').prepend(box);setTimeout(()=>box.remove(),9000)
}

function alertTitle(a){const map={RADAR_CANDIDATE:state.lang==='ru'?'Новый кандидат':'New candidate',PRIME_WATCH:'PRIME WATCH',LIQUIDITY_SURGE:state.lang==='ru'?'Скачок ликвидности':'Liquidity surge',VOLUME_ACCELERATION:state.lang==='ru'?'Ускорение объёма':'Volume acceleration',BINANCE_PUBLIC_MENTION:state.lang==='ru'?'Binance упоминание':'Binance mention'};return map[a?.title]||a?.title||'Alert'}

function updateConnection(error=''){
  const chip=$('latencyChip');const txt=$('latencyText');chip.classList.remove('ok','bad');
  const sources=state.data?.sources||{};const live=Object.values(sources).filter(s=>s.ok).length;const total=Object.keys(sources).length||5;
  if(state.connected&&live>=3){chip.classList.add('ok');txt.textContent=`${live}/${total} ${t('online')}`}
  else if(state.connected||live){txt.textContent=`${live}/${total} ${t('degraded')}`}
  else{chip.classList.add('bad');txt.textContent=error?t('sourceError'):t('offline')}
}

