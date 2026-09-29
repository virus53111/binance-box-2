import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import net from 'node:net';
import { createRemoteJWKSet, jwtVerify } from 'jose';

const OWNER_EMAIL = String(process.env.TRAFFIC_OWNER_EMAIL || 'dshtriters@gmail.com').toLowerCase();
const FIREBASE_PROJECT_ID = String(process.env.FIREBASE_PROJECT_ID || 'murdilimax');
const PUBLIC_BASE = String(process.env.TRAFFIC_PUBLIC_BASE || 'https://murdilimax-live-earth-api.onrender.com').replace(/\/$/, '');
const FIREBASE_JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'));
const INDEXNOW_KEY = crypto.createHash('sha256').update(`${FIREBASE_PROJECT_ID}:murdilimax-traffic-lab`).digest('hex').slice(0, 32);

const HTML_HEADERS = {
  'user-agent': 'Mozilla/5.0 (compatible; MurdilimaxTrafficLab/1.0; +https://murdilimax.com)',
  'accept': 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1'
};

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
}

function xml(value) {
  return esc(value).replace(/&#39;/g, '&apos;');
}

function decode(value) {
  return String(value || '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function textOnly(value, max = 180) {
  return decode(String(value || '').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function slugify(value) {
  const slug = String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72);
  return slug || 'guide';
}

function attr(tag, name) {
  const quoted = tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, 'i'));
  if (quoted) return decode(quoted[1]);
  const bare = tag.match(new RegExp(`\\b${name}\\s*=\\s*([^\\s>]+)`, 'i'));
  return bare ? decode(bare[1]) : '';
}

function isPrivateIp(ip) {
  if (!ip) return true;
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    if (v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe8') || v.startsWith('fe9') || v.startsWith('fea') || v.startsWith('feb')) return true;
    if (v.startsWith('::ffff:')) return isPrivateIp(v.slice(7));
  }
  return false;
}

async function assertPublicUrl(raw) {
  let url;
  try { url = new URL(String(raw || '').trim()); } catch { throw new Error('Некорректный URL'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Разрешены только http/https URL');
  if (url.username || url.password) throw new Error('URL с логином/паролем не поддерживается');
  const host = url.hostname.toLowerCase();
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) throw new Error('Локальные адреса запрещены');
  if (net.isIP(host)) {
    if (isPrivateIp(host)) throw new Error('Приватные IP запрещены');
  } else {
    const addresses = await dns.lookup(host, { all: true, verbatim: true });
    if (!addresses.length || addresses.some(item => isPrivateIp(item.address))) throw new Error('Адрес сайта недоступен для безопасного сканирования');
  }
  return url;
}

async function fetchHtml(rawUrl) {
  let current = (await assertPublicUrl(rawUrl)).toString();
  for (let hop = 0; hop < 5; hop += 1) {
    await assertPublicUrl(current);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    let response;
    try {
      response = await fetch(current, { headers: HTML_HEADERS, redirect: 'manual', signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) throw new Error('Сайт вернул пустой redirect');
      current = new URL(location, current).toString();
      continue;
    }
    if (!response.ok) throw new Error(`Сайт ответил HTTP ${response.status}`);
    const type = String(response.headers.get('content-type') || '');
    if (type && !/text\/html|application\/xhtml\+xml/i.test(type)) throw new Error('URL не похож на HTML-страницу');
    const length = Number(response.headers.get('content-length') || 0);
    if (length > 2_000_000) throw new Error('Главная страница слишком большая для тестового сканера');
    const html = (await response.text()).slice(0, 900_000);
    return { html, finalUrl: current };
  }
  throw new Error('Слишком много redirect');
}

function detectLanguage(html, sample) {
  const htmlTag = html.match(/<html\b[^>]*>/i)?.[0] || '';
  const code = attr(htmlTag, 'lang').toLowerCase();
  if (code.startsWith('ru')) return 'ru';
  if (code.startsWith('lv')) return 'lv';
  if (code.startsWith('en')) return 'en';
  const text = String(sample || '');
  const cyr = (text.match(/[а-яё]/gi) || []).length;
  const lv = (text.match(/[āčēģīķļņšūž]/gi) || []).length;
  if (cyr > 6) return 'ru';
  if (lv > 2) return 'lv';
  return 'en';
}

function plainText(html) {
  return decode(String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<(?:br\s*\/?>|\/(?:p|div|li|tr|h[1-6]|section|article))>/gi, '\n')
    .replace(/<[^>]+>/g, ' '))
    .replace(/\r/g, '')
    .split('\n')
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

function metaValue(metas, keys) {
  const wanted = new Set(keys.map(x => x.toLowerCase()));
  for (const tag of metas) {
    const key = (attr(tag, 'name') || attr(tag, 'property')).toLowerCase();
    if (wanted.has(key)) {
      const value = textOnly(attr(tag, 'content'), 500);
      if (value) return value;
    }
  }
  return '';
}

function topicNorm(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9а-яёāčēģīķļņšūž]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const TOPIC_NOISE = /^(главная|home|menu|меню|контакты|contacts?|о нас|about|privacy|cookies?|login|войти|регистрация|register|поиск|search|далее|подробнее|читать|more|ru|lv|en)$/i;
function usefulTopic(value) {
  const clean = textOnly(value, 96).replace(/\s*[|·•]\s*.*$/, '').trim();
  if (clean.length < 4 || clean.length > 96 || TOPIC_NOISE.test(clean)) return '';
  if (/^(murdilimax|cenaradar)$/i.test(clean)) return '';
  return clean;
}

function classifySite(sample) {
  const s = topicNorm(sample);
  const construction = [
    'ремонт','строитель','строительство','отделка','плитк','шпаклев','штукатур','покраск','маляр',
    'электрик','электромонтаж','сантех','ванн','кухн','пол','ламинат','паркет','кровл','фасад',
    'buvniec','remont','fliz','santeh','krasos','apdare','jumt','grida','elektr','renovat',
    'construction','renovation','tiling','plumbing','painting','flooring','roofing','electrician'
  ];
  if (construction.some(k => s.includes(topicNorm(k)))) return 'construction';
  const commerce = ['цена','цены','купить','товар','магазин','price','prices','shop','product','cena','veikals'];
  if (commerce.some(k => s.includes(topicNorm(k)))) return 'commerce';
  return 'general';
}

function parsePriceSignal(line) {
  const raw = textOnly(line, 260);
  if (!/(?:€|\bEUR\b)/i.test(raw)) return null;
  let min = null;
  let max = null;
  const range = raw.match(/(\d{1,5}(?:[.,]\d{1,2})?)\s*(?:-|–|—|\bдо\b|\bto\b)\s*(\d{1,5}(?:[.,]\d{1,2})?)\s*(?:€|EUR)/i);
  if (range) {
    min = Number(range[1].replace(',', '.'));
    max = Number(range[2].replace(',', '.'));
  } else {
    const after = raw.match(/(?:€|EUR)\s*(\d{1,5}(?:[.,]\d{1,2})?)/i);
    const before = raw.match(/(\d{1,5}(?:[.,]\d{1,2})?)\s*(?:€|EUR)/i);
    const value = Number((after?.[1] || before?.[1] || '').replace(',', '.'));
    if (Number.isFinite(value) && value > 0) min = max = value;
  }
  if (!(min > 0) || !(max > 0) || min > 100000 || max > 100000) return null;
  const unitMatch = raw.match(/(?:\/\s*)?(м²|m²|m2|м2|м\^2|m\^2|час|часа|h|st\.?|gab\.?|шт\.?|vien\.?|м|m)\b/i);
  return { text: raw, min: Math.min(min, max), max: Math.max(min, max), unit: unitMatch?.[1] || '' };
}

function priceSignalsFromText(text) {
  const out = [];
  for (const line of String(text || '').split('\n')) {
    const parsed = parsePriceSignal(line);
    if (!parsed) continue;
    const key = topicNorm(parsed.text);
    if (!out.some(x => topicNorm(x.text) === key)) out.push(parsed);
    if (out.length >= 40) break;
  }
  return out;
}

function detectLocation(sample, language) {
  const s = String(sample || '');
  if (/\b(riga|rīga|рига)\b/i.test(s)) return language === 'lv' ? 'Rīgā' : language === 'ru' ? 'Риге' : 'Riga';
  if (/\b(latvia|latvija|латви[ия])\b/i.test(s)) return language === 'lv' ? 'Latvijā' : language === 'ru' ? 'Латвии' : 'Latvia';
  return '';
}

function analyzeHtml(html, finalUrl) {
  const title = textOnly(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '', 150);
  const metas = html.match(/<meta\b[^>]*>/gi) || [];
  const description = metaValue(metas, ['description', 'og:description']);
  const imageUrlRaw = metaValue(metas, ['og:image', 'twitter:image']);
  const base = new URL(finalUrl);
  let imageUrl = '';
  if (imageUrlRaw) {
    try { imageUrl = new URL(imageUrlRaw, base).toString(); } catch {}
  }

  const headings = [];
  for (const match of html.matchAll(/<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/gi)) {
    const value = usefulTopic(match[1]);
    if (value && !headings.some(x => topicNorm(x) === topicNorm(value))) headings.push(value);
    if (headings.length >= 50) break;
  }

  const links = [];
  for (const match of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const href = attr(match[1], 'href');
    const label = usefulTopic(match[2]);
    if (!href || !label || href.startsWith('#') || /^(mailto:|tel:|javascript:)/i.test(href)) continue;
    try {
      const url = new URL(href, base);
      if (!['http:', 'https:'].includes(url.protocol)) continue;
      if (url.hostname.replace(/^www\./, '') !== base.hostname.replace(/^www\./, '')) continue;
      url.hash = '';
      if (!links.some(item => item.url === url.toString())) links.push({ text: label, url: url.toString() });
      if (links.length >= 60) break;
    } catch {}
  }

  const sourceText = plainText(html).slice(0, 90000);
  const language = detectLanguage(html, [title, description, sourceText.slice(0, 12000)].join(' '));
  const sample = [title, description, ...headings, ...links.map(x => x.text), sourceText.slice(0, 20000)].join(' ');
  const siteType = classifySite(sample);
  const location = detectLocation(sample, language);
  const fallbackTopic = usefulTopic(title.split(/\s+[|—–-]\s+/)[0]) || base.hostname.replace(/^www\./, '');
  const topics = [];
  for (const candidate of [headings[0], ...headings, ...links.map(x => x.text), fallbackTopic]) {
    const value = usefulTopic(candidate);
    if (!value) continue;
    if (!topics.some(x => topicNorm(x) === topicNorm(value))) topics.push(value);
    if (topics.length >= 40) break;
  }

  return {
    url: finalUrl,
    host: base.hostname.replace(/^www\./, ''),
    title: title || base.hostname,
    description,
    imageUrl,
    headings,
    links,
    topics,
    priceSignals: priceSignalsFromText(sourceText).map(signal => ({ ...signal, sourceUrl: finalUrl })),
    sourceText: sourceText.slice(0, 25000),
    language,
    siteType,
    location,
    topic: topics[0] || fallbackTopic || base.hostname
  };
}

function uniqueBy(items, keyFn, limit = 100) {
  const out = [];
  const seen = new Set();
  for (const item of items || []) {
    const key = keyFn(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= limit) break;
  }
  return out;
}

function crawlPriority(link) {
  const text = topicNorm(`${link.text || ''} ${link.url || ''}`);
  let score = 0;
  const strong = ['цен','price','cena','расцен','стоим','calculator','калькуля','smeta','смет','услуг','service','pakalpoj','remont','ремонт','buv','строит','fliz','плит','elektr','сантех','santeh','paint','krās','покрас','roof','jumt','кров'];
  for (const key of strong) if (text.includes(topicNorm(key))) score += 2;
  if (/\/(?:ru|lv|en)?\/?[^?#]{3,}\/?$/i.test(new URL(link.url).pathname)) score += 1;
  return score;
}

function crawlableInternal(link, host) {
  try {
    const url = new URL(link.url);
    if (url.hostname.replace(/^www\./,'') !== host.replace(/^www\./,'')) return false;
    if (url.search || url.hash) return false;
    if (/\.(?:pdf|jpg|jpeg|png|gif|webp|svg|zip|rar|mp4|mp3|xml|json)$/i.test(url.pathname)) return false;
    if (/\/(?:admin|login|signin|signup|account|cart|checkout|privacy|terms|cookie)(?:\/|$)/i.test(url.pathname)) return false;
    return url.pathname !== '/' && url.pathname.length <= 180;
  } catch {
    return false;
  }
}

async function analyzeSite(rawUrl) {
  const fetched = await fetchHtml(rawUrl);
  const home = analyzeHtml(fetched.html, fetched.finalUrl);
  const candidates = home.links
    .filter(link => crawlableInternal(link, home.host))
    .map(link => ({ ...link, priority:crawlPriority(link) }))
    .sort((a,b) => b.priority - a.priority)
    .slice(0, 10);

  const analyses = [home];
  for (const link of candidates) {
    if (analyses.length >= 7) break;
    try {
      const page = await fetchHtml(link.url);
      analyses.push(analyzeHtml(page.html, page.finalUrl));
    } catch (error) {
      console.warn('Traffic Lab internal crawl skipped:', link.url, error?.message || error);
    }
  }

  const headings = uniqueBy(analyses.flatMap(x => x.headings || []), x => topicNorm(x), 100);
  const links = uniqueBy(analyses.flatMap(x => x.links || []), x => x.url, 140);
  const topics = uniqueBy(analyses.flatMap(x => x.topics || []), x => topicNorm(x), 80);
  const priceSignals = uniqueBy(analyses.flatMap(x => x.priceSignals || []), x => `${topicNorm(x.text)}|${x.min}|${x.max}`, 120);
  const sample = analyses.map(x => `${x.title} ${x.description} ${x.sourceText || ''}`).join(' ').slice(0, 70000);
  const siteType = analyses.some(x => x.siteType === 'construction') ? 'construction' : home.siteType;
  const language = home.language;
  const location = detectLocation(sample, language) || home.location;

  const freshTasks = siteType === 'construction' ? await loadFreshTasks() : [];
  const marketPrices = siteType === 'construction' ? await loadConstructionPrices(language) : [];
  return {
    ...home,
    headings,
    links,
    topics,
    priceSignals,
    siteType,
    location,
    freshTasks,
    marketPrices,
    crawledPages: analyses.map(x => ({ url:x.url, title:x.title })).slice(0, 7),
    crawlCount: analyses.length
  };
}

const TASK_FEED_URL = String(process.env.TRAFFIC_TASK_FEED_URL || 'https://murdilimax.com/task-feed.json');
const PRICE_FEED_URL = String(process.env.TRAFFIC_PRICE_FEED_URL || 'https://murdilimax.com/construction-prices.json');
const MARKET_SIGNAL_URL = String(process.env.TRAFFIC_MARKET_SIGNAL_URL || 'https://murdilimax.com/construction-market-signals.json');
let taskFeedCache = { at:0, tasks:[] };
let priceFeedCache = { at:0, services:[], reviewedAt:'' };
let marketSignalCache = { at:0, generatedAt:'', signals:[] };

async function loadFreshTasks() {
  if (Date.now() - taskFeedCache.at < 5 * 60 * 1000) return taskFeedCache.tasks;
  try {
    const response = await fetch(TASK_FEED_URL, {
      headers: { 'user-agent':'MurdilimaxTrafficLab/2.0 (+https://murdilimax.com)', accept:'application/json' },
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    const tasks = Array.isArray(payload.tasks) ? payload.tasks : [];
    taskFeedCache = { at:Date.now(), tasks:tasks.slice(0,300) };
    return taskFeedCache.tasks;
  } catch (error) {
    console.warn('Traffic Lab task feed unavailable:', error?.message || error);
    return taskFeedCache.tasks || [];
  }
}

async function loadConstructionPrices(language='ru') {
  if (Date.now() - priceFeedCache.at >= 30 * 60 * 1000 || !priceFeedCache.services.length) {
    try {
      const response = await fetch(PRICE_FEED_URL, {
        headers: { 'user-agent':'MurdilimaxTrafficLab/2.0 (+https://murdilimax.com)', accept:'application/json' },
        signal: AbortSignal.timeout(8000)
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      priceFeedCache = {
        at:Date.now(),
        services:Array.isArray(payload.services) ? payload.services : [],
        reviewedAt:String(payload.reviewedAt || ''),
        sources:Array.isArray(payload.sources) ? payload.sources : []
      };
    } catch (error) {
      console.warn('Traffic Lab price feed unavailable:', error?.message || error);
    }
  }
  const isLv = language === 'lv';
  const guideUrl = isLv ? 'https://murdilimax.com/lv/buvdarbu-cenas/' : 'https://murdilimax.com/stroitelnye-rascenki/';
  return (priceFeedCache.services || []).map(service => ({
    topic:textOnly(isLv ? service.nameLv : service.nameRu, 100),
    category:textOnly(isLv ? service.categoryLv : service.categoryRu, 100),
    text:`${textOnly(isLv ? service.nameLv : service.nameRu, 100)} — €${service.min}–${service.max}/${textOnly(isLv ? service.unitLv : service.unitRu,20)}`,
    min:Number(service.min),
    max:Number(service.max),
    unit:textOnly(isLv ? service.unitLv : service.unitRu,20),
    sourceUrl:guideUrl,
    sourceLabel:'MURDILIMAX market benchmark',
    reviewedAt:priceFeedCache.reviewedAt,
    benchmark:true
  })).filter(item => item.topic && item.min > 0 && item.max > 0);
}

async function loadConstructionMarketSignals() {
  if (Date.now() - marketSignalCache.at < 10 * 60 * 1000 && marketSignalCache.signals.length) return marketSignalCache;
  try {
    const response = await fetch(MARKET_SIGNAL_URL, {
      headers: { 'user-agent':'MurdilimaxTrafficLab/3.0 (+https://murdilimax.com)', accept:'application/json' },
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    marketSignalCache = {
      at:Date.now(),
      generatedAt:String(payload.generatedAt || ''),
      signals:Array.isArray(payload.signals) ? payload.signals : []
    };
  } catch (error) {
    console.warn('Traffic Lab market pulse unavailable:', error?.message || error);
  }
  return marketSignalCache;
}

function marketPulseForTopic(topic, signals) {
  const cluster = constructionCluster(topic);
  if (!cluster) return null;
  const row = (signals || []).find(item => item.cluster === cluster);
  if (!row) return null;
  return {
    cluster,
    labelRu:textOnly(row.labelRu || '',80),
    labelLv:textOnly(row.labelLv || '',80),
    last24h:Number(row.last24h || 0),
    last7d:Number(row.last7d || 0),
    riga7d:Number(row.riga7d || 0),
    total:Number(row.total || 0),
    latestAt:String(row.latestAt || '')
  };
}

function constructionCluster(value) {
  const s = topicNorm(value);
  const clusters = [
    ['electrician', ['электр','elektr']],
    ['plumber', ['сантех','водопровод','канализ','santeh','cauru','plumb']],
    ['painter', ['маляр','покрас','шпакл','штукатур','krās','spakte','apmet','paint','plaster']],
    ['tiler', ['плит','кафел','fliz','tile']],
    ['roofer', ['кров','крыша','jumt','roof']],
    ['floor', ['ламин','паркет','пол','grīd','floor']],
    ['carpenter', ['плотниц','дерев','galdnie','koka','carpent']],
    ['door', ['двер','durv']],
    ['builder', ['ремонт','строит','отдел','buv','celtn','remont','renovat','construction']]
  ];
  return clusters.find(([,keys]) => keys.some(key => s.includes(topicNorm(key))))?.[0] || '';
}

function freshTasksForTopic(topic, tasks, limit = 3) {
  const cluster = constructionCluster(topic);
  const now = Date.now();
  return (tasks || [])
    .map(task => {
      const taskCluster = constructionCluster(`${task.service || ''} ${task.category || ''}`);
      const published = Date.parse(task.publishedAt || '') || 0;
      const ageDays = published ? (now - published) / 86400000 : 999;
      let score = overlapScore(topic, `${task.service || ''} ${task.category || ''}`);
      if (cluster && taskCluster === cluster) score += 6;
      if (cluster && taskCluster === 'builder' && cluster !== 'builder') score += 1;
      if (ageDays <= 7) score += 2;
      return { task, score, published, ageDays };
    })
    .filter(x => x.score >= 5 && x.ageDays <= 45)
    .sort((a,b) => b.score - a.score || b.published - a.published)
    .slice(0, limit)
    .map(({task}) => ({
      service:textOnly(task.service,120),
      category:textOnly(task.category,80),
      city:textOnly(task.city,80),
      district:textOnly(task.district,80),
      price:textOnly(task.price,60),
      date:textOnly(task.date,40),
      url:String(task.url || ''),
      publishedAt:String(task.publishedAt || '')
    }));
}

const COPY = {
  ru: {
    sourceChecked: 'Источник проверен',
    sourceData: 'Данные с сайта-источника',
    exact: 'Точная цена зависит от объёма и условий',
    openCalculator: 'Рассчитать на сайте',
    viewSource: 'Открыть источник',
    factors: 'Что сильнее всего влияет на стоимость',
    beforeOrder: 'Что проверить перед заказом',
    related: 'Ещё полезное по теме',
    calculator: 'Быстрый расчёт',
    quantity: 'Количество / площадь',
    result: 'Ориентировочная сумма',
    perUnit: 'за единицу',
    noPrice: 'На исходной странице не найден надёжный числовой ориентир — поэтому мы не придумываем цену.',
    facts: ['Подготовка поверхности и демонтаж', 'Материалы и расходники — входят или оплачиваются отдельно', 'Сложность, доступ и объём работ', 'Вывоз мусора, доставка и дополнительные работы'],
    checklist: ['Цена указана за понятную единицу измерения', 'Понятно, входят ли материалы', 'Согласованы сроки и дополнительные работы', 'Есть итоговая смета до начала работ']
  },
  lv: {
    sourceChecked: 'Avots pārbaudīts',
    sourceData: 'Dati no avota vietnes',
    exact: 'Precīza cena atkarīga no apjoma un apstākļiem',
    openCalculator: 'Aprēķināt vietnē',
    viewSource: 'Atvērt avotu',
    factors: 'Kas visvairāk ietekmē izmaksas',
    beforeOrder: 'Ko pārbaudīt pirms pasūtījuma',
    related: 'Vēl noderīgi par tēmu',
    calculator: 'Ātrais aprēķins',
    quantity: 'Daudzums / platība',
    result: 'Aptuvenā summa',
    perUnit: 'par vienību',
    noPrice: 'Avota lapā netika atrasts pietiekami drošs skaitlisks orientieris, tāpēc cenu neizdomājam.',
    facts: ['Virsmas sagatavošana un demontāža', 'Materiāli un palīgmateriāli — iekļauti vai atsevišķi', 'Darbu sarežģītība, piekļuve un apjoms', 'Atkritumu izvešana, piegāde un papildu darbi'],
    checklist: ['Cena norādīta par saprotamu mērvienību', 'Skaidrs, vai materiāli ir iekļauti', 'Saskaņoti termiņi un papildu darbi', 'Pirms darbu sākuma ir gala tāme']
  },
  en: {
    sourceChecked: 'Source checked',
    sourceData: 'Data from the source website',
    exact: 'Exact price depends on scope and conditions',
    openCalculator: 'Calculate on website',
    viewSource: 'Open source',
    factors: 'What affects the cost most',
    beforeOrder: 'What to check before ordering',
    related: 'More useful pages',
    calculator: 'Quick estimate',
    quantity: 'Quantity / area',
    result: 'Estimated total',
    perUnit: 'per unit',
    noPrice: 'No reliable numeric price was found on the source page, so we do not invent one.',
    facts: ['Preparation and demolition', 'Materials and consumables — included or separate', 'Complexity, access and job size', 'Waste removal, delivery and extra work'],
    checklist: ['Price uses a clear unit', 'Material inclusion is clear', 'Timing and extras are agreed', 'A final estimate exists before work starts']
  }
};

const INTENTS = ['price','calculator','estimate','compare','guide'];

function cleanTopicCandidate(value) {
  return usefulTopic(String(value || '')
    .replace(/\b(?:CenaRadar|MURDILIMAX|Traffic Lab)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim());
}

function topicTokens(value) {
  return topicNorm(value).split(' ').filter(x => x.length >= 4 && !/^(цена|цены|стоимость|работы|работа|latvija|латвии|riga|риге|cena|darbi|price|cost|work)$/.test(x));
}

function overlapScore(a, b) {
  const aa = topicTokens(a);
  const bb = new Set(topicTokens(b));
  let score = 0;
  for (const token of aa) if (bb.has(token)) score += token.length >= 7 ? 3 : 2;
  return score;
}

function bestSourceLink(analysis, topic) {
  const ranked = analysis.links
    .map(item => ({ ...item, score: overlapScore(topic, item.text) }))
    .sort((a,b) => b.score - a.score);
  return ranked[0]?.score > 0 ? ranked[0].url : analysis.url;
}

function matchedPriceSignals(analysis, topic) {
  const combined = [...(analysis.priceSignals || []), ...(analysis.marketPrices || [])];
  const ranked = combined
    .map(signal => ({
      ...signal,
      score: overlapScore(topic, signal.topic || signal.text) + (signal.benchmark ? 0 : 2)
    }))
    .sort((a,b) => b.score - a.score);
  const matched = ranked.filter(x => x.score > 0).slice(0, 5);
  return matched.length ? matched : [];
}

function intentTitle(language, intent, topic, location='') {
  const t = textOnly(topic, 82);
  const place = location ? (language === 'ru' ? ` в ${location}` : language === 'lv' ? ` ${location}` : ` in ${location}`) : '';
  const ru = {
    price: `Сколько стоит ${t}${place}: цены и что входит`,
    calculator: `Калькулятор стоимости: ${t}${place}`,
    estimate: `Смета на ${t}: из чего складывается цена`,
    compare: `Как сравнить цены на ${t} и не переплатить`,
    guide: `${t}: цены, расчёт и что проверить перед заказом`
  };
  const lv = {
    price: `Cik maksā ${t}${place}: cenas un kas ir iekļauts`,
    calculator: `${t} izmaksu kalkulators${place}`,
    estimate: `${t} tāme: no kā veidojas cena`,
    compare: `Kā salīdzināt ${t} cenas un nepārmaksāt`,
    guide: `${t}: cenas, aprēķins un ko pārbaudīt pirms pasūtījuma`
  };
  const en = {
    price: `How much does ${t} cost${place}: prices and inclusions`,
    calculator: `${t} cost calculator${place}`,
    estimate: `${t} estimate: what makes up the price`,
    compare: `How to compare ${t} prices without overpaying`,
    guide: `${t}: prices, estimate and what to check before ordering`
  };
  const table = language === 'ru' ? ru : language === 'lv' ? lv : en;
  return table[intent] || table.guide;
}

function introText(language, topic, intent, host, hasPrice) {
  if (language === 'ru') {
    if (hasPrice) return `Разбираем «${topic}» на основе актуально доступных данных ${host}: ориентиры по цене, что влияет на итоговую сумму и как быстро проверить предложение.`;
    return `Практическая страница по теме «${topic}»: что влияет на стоимость, как сравнить предложения и где получить точный расчёт на ${host}.`;
  }
  if (language === 'lv') {
    if (hasPrice) return `“${topic}” apskats, izmantojot pašlaik pieejamos ${host} datus: cenu orientieri, galvenie izmaksu faktori un piedāvājumu salīdzināšana.`;
    return `Praktiska lapa par “${topic}”: kas ietekmē cenu, kā salīdzināt piedāvājumus un kur saņemt precīzu aprēķinu vietnē ${host}.`;
  }
  if (hasPrice) return `A practical ${topic} guide based on currently available data from ${host}: price signals, cost drivers and how to compare quotes.`;
  return `A practical guide to ${topic}: what affects cost, how to compare quotes and where to get an exact calculation on ${host}.`;
}

function buildIntentDraft(analysis, topic, intent='guide', slugPrefix='intent') {
  const c = COPY[analysis.language] || COPY.en;
  const cleanTopic = cleanTopicCandidate(topic) || analysis.topic;
  const signals = matchedPriceSignals(analysis, cleanTopic);
  const primary = signals[0] || null;
  const targetUrl = bestSourceLink(analysis, cleanTopic);
  const title = intentTitle(analysis.language, intent, cleanTopic, analysis.location);
  const checkedAt = new Date().toISOString();
  const sourceLinks = analysis.links
    .map(item => ({ ...item, score:overlapScore(cleanTopic, item.text) }))
    .sort((a,b)=>b.score-a.score)
    .filter(item => item.score > 0)
    .slice(0, 5)
    .map(({text,url}) => ({text,url}));
  const freshTasks = analysis.siteType === 'construction'
    ? freshTasksForTopic(cleanTopic, analysis.freshTasks || [], 3)
    : [];
  const usesBenchmark = Boolean(primary?.benchmark);
  let qualityScore = 0;
  if (signals.length) qualityScore += 4;
  if (sourceLinks.length) qualityScore += 2;
  if (freshTasks.length) qualityScore += 2;
  if (Number(analysis.crawlCount || 0) >= 2) qualityScore += 1;
  if (analysis.siteType === 'construction') qualityScore += 1;
  qualityScore = Math.min(10, qualityScore);

  return {
    slug: `${slugPrefix}-${intent}-${slugify(cleanTopic)}`.slice(0, 110),
    title,
    description: introText(analysis.language, cleanTopic, intent, analysis.host, Boolean(primary)).slice(0, 260),
    topic: cleanTopic,
    body: {
      version: 3,
      template: 'intent-page',
      intent,
      qualityScore,
      siteType: analysis.siteType,
      topic: cleanTopic,
      location: analysis.location,
      host: analysis.host,
      intro: introText(analysis.language, cleanTopic, intent, analysis.host, Boolean(primary)),
      sourceCheckedAt: checkedAt,
      crawlCount: Number(analysis.crawlCount || 1),
      crawledPages: (analysis.crawledPages || []).slice(0, 7),
      imageUrl: analysis.imageUrl || '',
      targetUrl,
      priceSignals: signals,
      baseMin: primary?.min || null,
      baseMax: primary?.max || null,
      unit: primary?.unit || '',
      freshTasks,
      priceOrigin: usesBenchmark ? 'market-benchmark' : (primary ? 'target-site' : 'none'),
      sourceDataLabel: usesBenchmark
        ? (analysis.language === 'ru' ? 'Рыночный ориентир по Латвии' : analysis.language === 'lv' ? 'Tirgus orientieris Latvijā' : 'Latvia market benchmark')
        : c.sourceData,
      sourceCheckedLabel: c.sourceChecked,
      exactLabel: c.exact,
      openCalculatorLabel: c.openCalculator,
      viewSourceLabel: c.viewSource,
      factorsTitle: c.factors,
      checklistTitle: c.beforeOrder,
      relatedTitle: c.related,
      calculatorTitle: c.calculator,
      quantityLabel: c.quantity,
      resultLabel: c.result,
      perUnitLabel: c.perUnit,
      noPriceLabel: c.noPrice,
      facts: c.facts,
      checklist: c.checklist,
      sourceLinks
    }
  };
}

function rankedTopics(analysis) {
  const constructionHints = /ремонт|строит|отдел|плит|шпак|штукатур|покрас|маляр|электр|сантех|ванн|кухн|пол|ламин|паркет|кров|фасад|buv|remont|fliz|santeh|kras|apdar|jumt|grīd|grid|elektr|renovat|til|plumb|paint|floor|roof/i;
  const seen = new Set();
  const scored = [];
  const benchmarkTopics = (analysis.marketPrices || []).map(x => x.topic);
  for (const raw of [...benchmarkTopics, analysis.topic, ...(analysis.topics || []), ...analysis.headings, ...analysis.links.map(x=>x.text)]) {
    const topic = cleanTopicCandidate(raw);
    if (!topic) continue;
    const key = topicNorm(topic);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    let score = 0;
    if (analysis.siteType === 'construction' && constructionHints.test(topic)) score += 8;
    if ((analysis.priceSignals || []).some(s => overlapScore(topic, s.text) > 0)) score += 6;
    if ((analysis.marketPrices || []).some(s => topicNorm(s.topic) === topicNorm(topic))) score += 14;
    else if ((analysis.marketPrices || []).some(s => overlapScore(topic, s.topic) > 0)) score += 8;
    if (analysis.links.some(x => overlapScore(topic, x.text) > 0)) score += 2;
    if (topic.length >= 10 && topic.length <= 64) score += 2;
    scored.push({topic,score});
  }
  scored.sort((a,b)=>b.score-a.score);
  return scored.map(x=>x.topic).slice(0, 18);
}

function pageDrafts(analysis, limit = 20) {
  const topics = rankedTopics(analysis);
  if (!topics.length) topics.push(analysis.topic || analysis.host);
  const drafts = [];
  const seen = new Set();

  const push = (topic, intent) => {
    const draft = buildIntentDraft(analysis, topic, intent, 'intent');
    if (seen.has(draft.slug)) return;
    seen.add(draft.slug);
    drafts.push(draft);
  };

  for (const topic of topics.slice(0, 8)) {
    push(topic, 'price');
    if (drafts.length >= limit) break;
    push(topic, 'calculator');
    if (drafts.length >= limit) break;
  }
  for (const topic of topics.slice(0, 6)) {
    if (drafts.length >= limit) break;
    push(topic, 'estimate');
    if (drafts.length >= limit) break;
    push(topic, 'compare');
  }
  let cursor = 0;
  while (drafts.length < limit && cursor < topics.length * INTENTS.length) {
    const topic = topics[cursor % topics.length];
    const intent = INTENTS[Math.floor(cursor / topics.length) % INTENTS.length];
    push(topic, intent);
    cursor += 1;
  }
  return drafts.slice(0, limit);
}

function adaptiveDrafts(analysis, topic) {
  return ['guide','estimate','compare','price','calculator'].map(intent =>
    buildIntentDraft(analysis, topic, intent, 'expand')
  );
}

function isBot(ua) {
  return /bot|crawler|spider|slurp|bingpreview|facebookexternalhit|headless|lighthouse|preview/i.test(String(ua || ''));
}

function pageUrl(page) {
  return `${PUBLIC_BASE}/traffic/p/${encodeURIComponent(page.id)}/${encodeURIComponent(page.slug)}`;
}

function campaignUrl(id) {
  return `${PUBLIC_BASE}/traffic/c/${encodeURIComponent(id)}`;
}

function safeJson(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function formatPrice(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(n);
}

function renderShell({ title, description, canonical, lang = 'en', body, robots = 'index,follow', imageUrl = '', schema = null }) {
  const imageMeta = imageUrl ? `<meta property="og:image" content="${esc(imageUrl)}">` : '';
  const schemaTag = schema ? `<script type="application/ld+json">${safeJson(schema)}</script>` : '';
  return `<!doctype html><html lang="${esc(lang)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><meta name="description" content="${esc(description)}"><meta name="robots" content="${esc(robots)}"><link rel="canonical" href="${esc(canonical)}"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${esc(canonical)}"><meta property="og:type" content="article">${imageMeta}${schemaTag}<style>
  :root{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#17202a;background:#f6f7f4;--ink:#17202a;--muted:#65717c;--line:#dde3de;--card:#fff;--accent:#146c55;--accent2:#0b4d3c;--soft:#eef6f1}
  *{box-sizing:border-box}body{margin:0;background:linear-gradient(180deg,#f8faf7 0,#f3f5f2 100%);min-height:100vh;color:var(--ink)}a{color:inherit}main{width:min(1080px,92vw);margin:0 auto;padding:24px 0 72px}.topbar{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 0 24px}.brand{display:flex;align-items:center;gap:10px;font-weight:900;letter-spacing:-.02em}.brandmark{width:34px;height:34px;border-radius:12px;display:grid;place-items:center;background:var(--accent);color:#fff}.fresh{font-size:12px;color:var(--muted);padding:7px 10px;border:1px solid var(--line);border-radius:999px;background:#fff}.hero{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(260px,.65fr);gap:18px;align-items:stretch}.heroCard,.panel{background:var(--card);border:1px solid var(--line);border-radius:24px;box-shadow:0 14px 44px rgba(29,46,38,.06)}.heroCard{padding:clamp(24px,5vw,54px);position:relative;overflow:hidden}.heroCard:after{content:"";position:absolute;right:-70px;top:-90px;width:240px;height:240px;border-radius:50%;background:radial-gradient(circle,#d9f0e5 0,rgba(217,240,229,0) 70%);pointer-events:none}.eyebrow{display:inline-flex;padding:7px 10px;border-radius:999px;background:var(--soft);color:var(--accent2);font-size:12px;font-weight:900;letter-spacing:.06em;text-transform:uppercase}.hero h1{font-size:clamp(34px,5.6vw,66px);line-height:.98;letter-spacing:-.052em;margin:16px 0 18px;max-width:820px}.hero p{font-size:18px;line-height:1.65;color:var(--muted);max-width:760px}.heroSide{padding:20px;display:flex;flex-direction:column;justify-content:space-between;gap:16px}.heroImage{width:100%;aspect-ratio:16/10;object-fit:cover;border-radius:17px;background:linear-gradient(135deg,#e7efe9,#d7e7dd)}.priceLabel{font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;font-weight:800}.priceBig{font-size:34px;font-weight:950;letter-spacing:-.04em;margin:4px 0}.priceNote{font-size:13px;line-height:1.45;color:var(--muted)}.cta{display:inline-flex;align-items:center;justify-content:center;gap:8px;text-decoration:none;background:var(--accent);color:#fff;padding:14px 18px;border-radius:14px;font-weight:900;border:0}.cta:hover{background:var(--accent2)}.cta.secondary{background:#fff;color:var(--accent2);border:1px solid var(--line)}.grid{display:grid;grid-template-columns:1.05fr .95fr;gap:18px;margin-top:18px}.panel{padding:24px}.panel h2{font-size:24px;letter-spacing:-.03em;margin:0 0 14px}.panel p{color:var(--muted);line-height:1.6}.facts{display:grid;gap:10px}.fact{display:flex;gap:12px;align-items:flex-start;padding:14px;border:1px solid #e5e9e5;border-radius:16px;background:#fbfcfa}.num{width:30px;height:30px;flex:0 0 30px;border-radius:10px;background:var(--soft);display:grid;place-items:center;font-weight:900;color:var(--accent2)}.sourceSignals{display:grid;gap:9px}.signal{padding:13px 14px;border-radius:14px;background:#f7f9f6;border:1px solid #e5e9e5}.signal b{display:block;margin-bottom:4px}.signal small{display:block;color:var(--muted);line-height:1.4}.signal a{display:inline-block;margin-top:7px;color:var(--accent2);font-size:11px;font-weight:900;text-decoration:none}.calc{display:grid;grid-template-columns:1fr 1fr;gap:12px;align-items:end}.calc label{font-size:12px;font-weight:800;color:var(--muted);display:grid;gap:7px}.calc input{width:100%;padding:13px 14px;border:1px solid #ccd5ce;border-radius:12px;font:inherit;background:#fff}.calcResult{padding:13px 14px;border-radius:12px;background:var(--soft)}.calcResult strong{display:block;font-size:23px;color:var(--accent2)}.checklist{display:grid;gap:9px}.check{display:flex;gap:10px;align-items:flex-start}.check i{font-style:normal;width:24px;height:24px;border-radius:8px;background:#e6f4ec;color:var(--accent2);display:grid;place-items:center;font-weight:950;flex:0 0 24px}.sourceLinks,.related{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.mini{display:block;text-decoration:none;padding:14px;border:1px solid var(--line);border-radius:15px;background:#fff}.mini b{display:block;font-size:14px;line-height:1.35}.mini small{display:block;color:var(--muted);margin-top:5px;line-height:1.35}.footerCta{margin-top:18px;padding:28px;border-radius:24px;background:#173b31;color:#fff;display:flex;justify-content:space-between;gap:20px;align-items:center}.footerCta h2{margin:0 0 8px;font-size:28px}.footerCta p{margin:0;color:#c8d8d1;line-height:1.5}.footerCta .cta{background:#fff;color:#173b31;white-space:nowrap}.marketPulse{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.marketMetric{padding:18px;border-radius:16px;background:var(--soft);border:1px solid #dce9e1}.marketMetric strong{display:block;font-size:30px;letter-spacing:-.04em;color:var(--accent2)}.marketMetric span{display:block;margin-top:5px;color:var(--muted);font-size:12px;line-height:1.35}.taskGrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.taskCard{padding:16px;border:1px solid var(--line);border-radius:16px;background:#fbfcfa;display:flex;flex-direction:column;gap:10px}.taskCard h3{font-size:16px;line-height:1.35;margin:0}.taskMeta{display:flex;flex-wrap:wrap;gap:6px}.taskMeta span{font-size:11px;padding:6px 8px;border-radius:999px;background:var(--soft);color:var(--accent2);font-weight:800}.taskCard a{font-size:12px;font-weight:900;color:var(--accent2);text-decoration:none;margin-top:auto}.qualityNote{margin-top:8px;font-size:11px;color:var(--muted)}.disclaimer{margin-top:18px;color:#7b8580;font-size:12px;line-height:1.5;text-align:center}
  @media(max-width:780px){main{width:min(94vw,720px);padding-top:12px}.hero,.grid{grid-template-columns:1fr}.hero h1{font-size:clamp(34px,11vw,54px)}.heroCard{padding:26px 22px}.hero p{font-size:16px}.sourceLinks,.related,.taskGrid,.marketPulse{grid-template-columns:1fr}.footerCta{align-items:flex-start;flex-direction:column}.footerCta .cta{width:100%}.calc{grid-template-columns:1fr}}
  </style></head><body><main>${body}</main></body></html>`;
}

function renderTrafficPage(row, relatedRows = [], marketPulse = null, marketGeneratedAt = '') {
  const body = row.body_json || {};
  const canonical = pageUrl(row);
  const active = row.status === 'active';
  const checked = body.sourceCheckedAt ? new Date(body.sourceCheckedAt).toLocaleDateString(row.language === 'ru' ? 'ru-RU' : row.language === 'lv' ? 'lv-LV' : 'en-GB') : '';
  const priceSignals = Array.isArray(body.priceSignals) ? body.priceSignals : [];
  const min = Number(body.baseMin || 0);
  const max = Number(body.baseMax || 0);
  const hasPrice = min > 0 && max > 0;
  const unit = body.unit ? ` / ${esc(body.unit)}` : '';
  const priceText = hasPrice ? (min === max ? `${formatPrice(min)} €${unit}` : `${formatPrice(min)}–${formatPrice(max)} €${unit}`) : '—';
  const source = `/traffic/go/${encodeURIComponent(row.id)}`;

  const signalsHtml = priceSignals.length
    ? priceSignals.map(signal => {
        const sourceLink = signal.sourceUrl
          ? `<a href="${esc(signal.sourceUrl)}" target="_blank" rel="noopener nofollow">${esc(signal.benchmark ? (row.language === 'ru' ? 'Рыночный источник' : row.language === 'lv' ? 'Tirgus avots' : 'Market source') : (body.viewSourceLabel || 'Source'))} →</a>`
          : '';
        return `<div class="signal"><b>${formatPrice(signal.min)}${Number(signal.max)!==Number(signal.min)?`–${formatPrice(signal.max)}`:''} €${signal.unit?` / ${esc(signal.unit)}`:''}</b><small>${esc(signal.text)}</small>${sourceLink}</div>`;
      }).join('')
    : `<div class="signal"><small>${esc(body.noPriceLabel || 'No reliable numeric price found.')}</small></div>`;

  const factsHtml = (body.facts || []).map((item,i)=>`<div class="fact"><span class="num">${i+1}</span><div>${esc(item)}</div></div>`).join('');
  const checksHtml = (body.checklist || []).map(item=>`<div class="check"><i>✓</i><span>${esc(item)}</span></div>`).join('');
  const sourceLinksHtml = (body.sourceLinks || []).map(item=>`<a class="mini" href="${esc(item.url)}" rel="noopener"><b>${esc(item.text)}</b><small>${esc(row.host)}</small></a>`).join('');
  const relatedHtml = relatedRows.map(item=>`<a class="mini" href="${esc(pageUrl(item))}"><b>${esc(item.title)}</b><small>${esc(item.description || '')}</small></a>`).join('');
  const freshTasks = Array.isArray(body.freshTasks) ? body.freshTasks : [];
  const tasksHtml = freshTasks.map(task => {
    const place = [task.district,task.city].filter(Boolean).join(', ');
    const meta = [
      place ? `<span>📍 ${esc(place)}</span>` : '',
      task.price ? `<span>💶 ${esc(task.price)}</span>` : '',
      task.date ? `<span>📅 ${esc(task.date)}</span>` : ''
    ].filter(Boolean).join('');
    return `<article class="taskCard"><div class="taskMeta">${meta}</div><h3>${esc(task.service || task.category || 'Задание')}</h3><a href="${esc(task.url)}" target="_blank" rel="noopener">Открыть публичное задание →</a></article>`;
  }).join('');
  const marketLabel = marketPulse
    ? (row.language === 'lv' ? marketPulse.labelLv : row.language === 'ru' ? marketPulse.labelRu : marketPulse.labelRu)
    : '';
  const marketDate = marketGeneratedAt ? new Date(marketGeneratedAt).toLocaleString(row.language === 'lv' ? 'lv-LV' : row.language === 'ru' ? 'ru-RU' : 'en-GB') : '';
  const marketHtml = marketPulse ? `
    <div class="marketPulse">
      <div class="marketMetric"><strong>${marketPulse.last24h}</strong><span>${esc(row.language === 'ru' ? 'новых публичных предложений специалистов за 24 часа' : row.language === 'lv' ? 'jauni publiski speciālistu piedāvājumi 24 stundās' : 'new public specialist listings in 24h')}</span></div>
      <div class="marketMetric"><strong>${marketPulse.last7d}</strong><span>${esc(row.language === 'ru' ? 'за последние 7 дней' : row.language === 'lv' ? 'pēdējās 7 dienās' : 'in the last 7 days')}</span></div>
      <div class="marketMetric"><strong>${marketPulse.riga7d}</strong><span>${esc(row.language === 'ru' ? 'из них с упоминанием Риги за 7 дней' : row.language === 'lv' ? 'no tiem ar Rīgas pieminējumu 7 dienās' : 'mentioning Riga in 7 days')}</span></div>
    </div>
  ` : '';

  const calcHtml = hasPrice ? `<div class="calc"><label>${esc(body.quantityLabel || 'Quantity')}<input id="qty" type="number" value="1" min="0.1" step="0.1" inputmode="decimal"></label><div class="calcResult"><small>${esc(body.resultLabel || 'Estimated total')}</small><strong id="calcValue">${priceText}</strong></div></div><p class="priceNote">${esc(body.exactLabel || '')}</p>` : `<p>${esc(body.noPriceLabel || '')}</p><a class="cta secondary" href="${source}">${esc(body.openCalculatorLabel || 'Open website')} →</a>`;

  const image = body.imageUrl ? `<img class="heroImage" src="${esc(body.imageUrl)}" alt="" loading="eager">` : `<div class="heroImage"></div>`;
  const bodyHtml = `
    <div class="topbar"><div class="brand"><span class="brandmark">↗</span><span>Murdilimax Traffic Lab</span></div><span class="fresh">${esc(body.sourceCheckedLabel || 'Source checked')}${checked ? ` · ${esc(checked)}` : ''}</span></div>
    <section class="hero">
      <article class="heroCard">
        <span class="eyebrow">${esc(body.siteType === 'construction' ? (row.language === 'ru' ? 'Цены на ремонт' : row.language === 'lv' ? 'Remonta cenas' : 'Renovation prices') : row.host)}</span>
        <h1>${esc(row.title)}</h1>
        <p>${esc(body.intro || row.description)}</p>
        <a class="cta" href="${source}">${esc(body.openCalculatorLabel || 'Open website')} →</a>
      </article>
      <aside class="heroSide panel">
        ${image}
        <div><div class="priceLabel">${esc(body.sourceDataLabel || 'Source data')}</div><div class="priceBig">${priceText}</div><div class="priceNote">${esc(body.exactLabel || '')}</div></div>
      </aside>
    </section>

    <section class="grid">
      <article class="panel"><h2>${esc(body.calculatorTitle || 'Quick estimate')}</h2>${calcHtml}</article>
      <article class="panel"><h2>${esc(body.factorsTitle || 'What affects cost')}</h2><div class="facts">${factsHtml}</div></article>
    </section>

    <section class="grid">
      <article class="panel"><h2>${esc(body.sourceDataLabel || 'Source data')}</h2><div class="sourceSignals">${signalsHtml}</div></article>
      <article class="panel"><h2>${esc(body.checklistTitle || 'Before ordering')}</h2><div class="checklist">${checksHtml}</div></article>
    </section>

    ${marketHtml ? `<section class="panel" style="margin-top:18px"><h2>${esc(row.language === 'ru' ? `Пульс рынка: ${marketLabel || 'ремонт'}` : row.language === 'lv' ? `Tirgus pulss: ${marketLabel || 'remonts'}` : `Market pulse: ${marketLabel || 'renovation'}`)}</h2><p>${esc(row.language === 'ru' ? `Агрегированная активность публичных предложений специалистов из мониторинга Murdilimax. Это не число заказов и не гарантия спроса.${marketDate ? ' Обновлено: '+marketDate+'.' : ''}` : row.language === 'lv' ? `Apkopota publisko speciālistu piedāvājumu aktivitāte Murdilimax monitoringā. Tas nav pasūtījumu skaits un negarantē pieprasījumu.${marketDate ? ' Atjaunots: '+marketDate+'.' : ''}` : `Aggregated public specialist-listing activity from Murdilimax monitoring. This is not an order count or a demand guarantee.${marketDate ? ' Updated: '+marketDate+'.' : ''}`)}</p>${marketHtml}</section>` : ''}
    ${tasksHtml ? `<section class="panel" style="margin-top:18px"><h2>${esc(row.language === 'ru' ? 'Свежие реальные задания' : row.language === 'lv' ? 'Svaigi reāli uzdevumi' : 'Fresh real tasks')}</h2><p>${esc(row.language === 'ru' ? 'Публичные задания из Murdilimax по близкой теме. Показываем только услугу, место, дату и бюджет — без личных данных.' : row.language === 'lv' ? 'Publiski Murdilimax uzdevumi par līdzīgu tēmu. Rādām tikai pakalpojumu, vietu, datumu un budžetu — bez personas datiem.' : 'Public Murdilimax tasks on a related topic. Only service, location, date and budget are shown — no personal data.')}</p><div class="taskGrid">${tasksHtml}</div></section>` : ''}
    ${sourceLinksHtml ? `<section class="panel" style="margin-top:18px"><h2>${esc(row.language === 'ru' ? 'Разделы исходного сайта по этой теме' : row.language === 'lv' ? 'Avota vietnes sadaļas par šo tēmu' : 'Relevant source sections')}</h2><div class="sourceLinks">${sourceLinksHtml}</div></section>` : ''}
    ${relatedHtml ? `<section class="panel" style="margin-top:18px"><h2>${esc(body.relatedTitle || 'Related')}</h2><div class="related">${relatedHtml}</div></section>` : ''}

    <section class="footerCta"><div><h2>${esc(row.language === 'ru' ? 'Нужен точный расчёт?' : row.language === 'lv' ? 'Vajag precīzu aprēķinu?' : 'Need an exact estimate?')}</h2><p>${esc(row.language === 'ru' ? `Откройте ${row.host} и рассчитайте стоимость по своим параметрам.` : row.language === 'lv' ? `Atveriet ${row.host} un aprēķiniet izmaksas pēc saviem parametriem.` : `Open ${row.host} and calculate using your own parameters.`)}</p></div><a class="cta" href="${source}">${esc(body.openCalculatorLabel || 'Open website')} →</a></section>
    <div class="disclaimer">${esc(row.language === 'ru' ? 'Traffic Lab не придумывает цены: ориентиры берутся либо с целевого сайта, либо из опубликованного рыночного benchmark Murdilimax по Латвии. Итоговая цена всегда зависит от конкретного объекта.' : row.language === 'lv' ? 'Traffic Lab neizdomā cenas: orientieri tiek ņemti no mērķa vietnes vai publicētā Murdilimax Latvijas tirgus benchmark. Gala cena vienmēr ir atkarīga no konkrētā objekta.' : 'Traffic Lab does not invent prices: benchmarks come from the target site or the published Murdilimax Latvia market benchmark. Final pricing depends on the actual job.')}</div>
    ${hasPrice ? `<script>(function(){const q=document.getElementById('qty'),o=document.getElementById('calcValue'),mn=${JSON.stringify(min)},mx=${JSON.stringify(max)},unit=${JSON.stringify(body.unit||'')};function fmt(n){return new Intl.NumberFormat(document.documentElement.lang==='ru'?'ru-RU':'en-GB',{maximumFractionDigits:2}).format(n)}function run(){const v=Math.max(.1,Number(q.value)||1),a=mn*v,b=mx*v;o.textContent=(Math.abs(a-b)<.001?fmt(a):fmt(a)+'–'+fmt(b))+' €'+(unit?' / '+unit:'')}q.addEventListener('input',run);run()})()</script>` : ''}
  `;

  const schema = {
    '@context':'https://schema.org',
    '@type':'WebPage',
    name:row.title,
    description:row.description,
    url:canonical,
    dateModified:body.sourceCheckedAt || new Date(Number(row.updated_at || Date.now())).toISOString(),
    about:{ '@type':'Thing', name:body.topic || row.topic || row.title },
    isPartOf:{ '@type':'WebSite', name:'Murdilimax Traffic Lab', url:campaignUrl(row.campaign_id) }
  };

  const indexable = active && Number(body.qualityScore || 0) >= 4;
  return renderShell({ title:row.title, description:row.description, canonical, lang:row.language || 'en', body:bodyHtml, robots:indexable?'index,follow,max-image-preview:large':'noindex,follow', imageUrl:body.imageUrl || '', schema });
}

async function verifyOwner(req, res, next) {
  try {
    const header = String(req.get('authorization') || '');
    const token = header.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return res.status(401).json({ error: 'Owner login required' });
    const { payload } = await jwtVerify(token, FIREBASE_JWKS, {
      issuer: `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`,
      audience: FIREBASE_PROJECT_ID
    });
    const email = String(payload.email || '').toLowerCase();
    if (!payload.email_verified || email !== OWNER_EMAIL) return res.status(403).json({ error: 'Owner access required' });
    req.trafficOwner = payload;
    next();
  } catch (error) {
    console.warn('Traffic owner auth failed:', error?.message || error);
    return res.status(401).json({ error: 'Invalid owner session' });
  }
}

export function registerTrafficRoutes({ app, pool }) {
  let schemaPromise = null;

  async function ensureSchema() {
    if (!pool) throw new Error('PostgreSQL storage is required for Traffic Lab');
    if (!schemaPromise) schemaPromise = (async () => {
      await pool.query(`CREATE TABLE IF NOT EXISTS traffic_campaigns (
        id text PRIMARY KEY,
        target_url text NOT NULL UNIQUE,
        host text NOT NULL,
        title text NOT NULL DEFAULT '',
        description text NOT NULL DEFAULT '',
        language text NOT NULL DEFAULT 'en',
        status text NOT NULL DEFAULT 'active',
        last_error text NOT NULL DEFAULT '',
        indexnow_status text NOT NULL DEFAULT '',
        created_at bigint NOT NULL,
        updated_at bigint NOT NULL,
        last_run_at bigint NOT NULL DEFAULT 0
      )`);
      await pool.query(`CREATE TABLE IF NOT EXISTS traffic_pages (
        id text PRIMARY KEY,
        campaign_id text NOT NULL REFERENCES traffic_campaigns(id) ON DELETE CASCADE,
        slug text NOT NULL,
        title text NOT NULL,
        description text NOT NULL DEFAULT '',
        topic text NOT NULL DEFAULT '',
        body_json jsonb NOT NULL DEFAULT '{}'::jsonb,
        views integer NOT NULL DEFAULT 0,
        crawls integer NOT NULL DEFAULT 0,
        clicks integer NOT NULL DEFAULT 0,
        created_at bigint NOT NULL,
        updated_at bigint NOT NULL,
        UNIQUE(campaign_id, slug)
      )`);
      await pool.query('CREATE INDEX IF NOT EXISTS traffic_pages_campaign_idx ON traffic_pages(campaign_id)');
    })().catch(error => { schemaPromise = null; throw error; });
    return schemaPromise;
  }

  async function getCampaign(id) {
    const { rows } = await pool.query('SELECT * FROM traffic_campaigns WHERE id=$1', [id]);
    return rows[0] || null;
  }

  async function listCampaigns() {
    await ensureSchema();
    const { rows: campaigns } = await pool.query(`SELECT c.*,
      COALESCE(SUM(p.views),0)::int AS views,
      COALESCE(SUM(p.crawls),0)::int AS crawls,
      COALESCE(SUM(p.clicks),0)::int AS clicks,
      COUNT(p.id)::int AS page_count,
      COUNT(p.id) FILTER (WHERE COALESCE(NULLIF(p.body_json->>'qualityScore','')::int,0) >= 4)::int AS indexable_count,
      COUNT(p.id) FILTER (WHERE jsonb_array_length(COALESCE(p.body_json->'freshTasks','[]'::jsonb)) > 0)::int AS pages_with_tasks,
      COALESCE(MAX(COALESCE(NULLIF(p.body_json->>'crawlCount','')::int,0)),0)::int AS crawl_count
      FROM traffic_campaigns c
      LEFT JOIN traffic_pages p ON p.campaign_id=c.id
      GROUP BY c.id
      ORDER BY c.created_at DESC`);
    const { rows: pages } = await pool.query('SELECT id,campaign_id,slug,title,views,crawls,clicks FROM traffic_pages ORDER BY created_at ASC');
    return campaigns.map(c => ({
      id: c.id,
      url: c.target_url,
      host: c.host,
      title: c.title,
      description: c.description,
      language: c.language,
      status: c.status,
      lastError: c.last_error,
      indexNowStatus: c.indexnow_status,
      createdAt: Number(c.created_at),
      updatedAt: Number(c.updated_at),
      lastRunAt: Number(c.last_run_at),
      views: Number(c.views || 0),
      crawls: Number(c.crawls || 0),
      clicks: Number(c.clicks || 0),
      pageCount: Number(c.page_count || 0),
      indexableCount: Number(c.indexable_count || 0),
      pagesWithTasks: Number(c.pages_with_tasks || 0),
      crawlCount: Number(c.crawl_count || 0),
      publicHubUrl: campaignUrl(c.id),
      pages: pages.filter(p => p.campaign_id === c.id).map(p => ({ ...p, views:Number(p.views||0), crawls:Number(p.crawls||0), clicks:Number(p.clicks||0), url:pageUrl(p) }))
    }));
  }

  async function submitIndexNow(pageRows, campaignId) {
    const indexableRows = (pageRows || []).filter(row => Number(row.qualityScore || 0) >= 4);
    const urls = [campaignUrl(campaignId), ...indexableRows.map(pageUrl)];
    try {
      const response = await fetch('https://api.indexnow.org/indexnow', {
        method: 'POST',
        headers: { 'content-type': 'application/json; charset=utf-8' },
        body: JSON.stringify({
          host: new URL(PUBLIC_BASE).host,
          key: INDEXNOW_KEY,
          keyLocation: `${PUBLIC_BASE}/traffic/indexnow-key.txt`,
          urlList: urls
        }),
        signal: AbortSignal.timeout(9000)
      });
      return `HTTP ${response.status} · ${new Date().toISOString()}`;
    } catch (error) {
      return `error: ${String(error?.message || error).slice(0, 120)}`;
    }
  }

  async function persistAnalysis(campaign, analysis) {
    const now = Date.now();
    await pool.query('UPDATE traffic_campaigns SET target_url=$2,host=$3,title=$4,description=$5,language=$6,status=\'active\',last_error=\'\',updated_at=$7,last_run_at=$7 WHERE id=$1',
      [campaign.id, analysis.url, analysis.host, analysis.title, analysis.description, analysis.language, now]);

    const rows = [];
    const upsertDraft = async draft => {
      const found = await pool.query('SELECT id FROM traffic_pages WHERE campaign_id=$1 AND slug=$2', [campaign.id, draft.slug]);
      let id = found.rows[0]?.id;
      if (id) {
        await pool.query('UPDATE traffic_pages SET title=$3,description=$4,topic=$5,body_json=$6::jsonb,updated_at=$7 WHERE id=$1 AND campaign_id=$2',
          [id, campaign.id, draft.title, draft.description, draft.topic, JSON.stringify(draft.body), now]);
      } else {
        id = crypto.randomUUID();
        await pool.query('INSERT INTO traffic_pages (id,campaign_id,slug,title,description,topic,body_json,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$8)',
          [id, campaign.id, draft.slug, draft.title, draft.description, draft.topic, JSON.stringify(draft.body), now]);
      }
      rows.push({ id, slug:draft.slug, qualityScore:Number(draft.body?.qualityScore || 0) });
      return Boolean(!found.rows[0]?.id);
    };

    for (const draft of pageDrafts(analysis, 20)) {
      await upsertDraft(draft);
    }

    // Upgrade pages generated by the first Traffic Lab version in place.
    // Preserve URLs and counters so already-crawled pages become useful instead of being replaced by duplicates.
    const legacy = await pool.query('SELECT id,slug,topic,body_json FROM traffic_pages WHERE campaign_id=$1 ORDER BY created_at ASC', [campaign.id]);
    let legacyIndex = 0;
    for (const page of legacy.rows) {
      if (Number(page.body_json?.version || 0) >= 3) continue;
      const intent = INTENTS[legacyIndex % INTENTS.length] || 'guide';
      const upgraded = buildIntentDraft(analysis, page.topic || analysis.topic, intent, 'legacy');
      await pool.query(
        'UPDATE traffic_pages SET title=$3,description=$4,topic=$5,body_json=$6::jsonb,updated_at=$7 WHERE id=$1 AND campaign_id=$2',
        [page.id, campaign.id, upgraded.title, upgraded.description, upgraded.topic, JSON.stringify(upgraded.body), now]
      );
      rows.push({ id:page.id, slug:page.slug, qualityScore:Number(upgraded.body?.qualityScore || 0) });
      legacyIndex += 1;
    }

    const countResult = await pool.query('SELECT COUNT(*)::int AS count FROM traffic_pages WHERE campaign_id=$1', [campaign.id]);
    let pageCount = Number(countResult.rows[0]?.count || 0);

    if (pageCount < 60) {
      const winners = await pool.query(`
        SELECT topic, SUM(views)::int AS views, SUM(clicks)::int AS clicks
        FROM traffic_pages
        WHERE campaign_id=$1 AND topic <> ''
        GROUP BY topic
        HAVING SUM(views) >= 3 OR SUM(clicks) >= 1
        ORDER BY SUM(clicks) DESC, SUM(views) DESC
        LIMIT 6
      `, [campaign.id]);
      const existingResult = await pool.query('SELECT slug FROM traffic_pages WHERE campaign_id=$1', [campaign.id]);
      const existingSlugs = new Set(existingResult.rows.map(row => row.slug));
      let added = 0;
      outer:
      for (const winner of winners.rows) {
        for (const draft of adaptiveDrafts(analysis, winner.topic)) {
          if (pageCount >= 60 || added >= 8) break outer;
          if (existingSlugs.has(draft.slug)) continue;
          await upsertDraft(draft);
          existingSlugs.add(draft.slug);
          pageCount += 1;
          added += 1;
        }
      }
    }

    const indexStatus = await submitIndexNow(rows, campaign.id);
    await pool.query('UPDATE traffic_campaigns SET indexnow_status=$2,updated_at=$3 WHERE id=$1', [campaign.id, indexStatus, Date.now()]);
  }

  async function refreshCampaign(campaign) {
    try {
      const analysis = await analyzeSite(campaign.target_url);
      await persistAnalysis(campaign, analysis);
      return true;
    } catch (error) {
      const message = String(error?.message || error).slice(0, 300);
      await pool.query('UPDATE traffic_campaigns SET last_error=$2,updated_at=$3,last_run_at=$3 WHERE id=$1', [campaign.id, message, Date.now()]);
      throw error;
    }
  }

  app.get('/traffic/indexnow-key.txt', (_req, res) => {
    res.type('text/plain').send(INDEXNOW_KEY);
  });

  app.get('/robots.txt', async (_req, res) => {
    res.type('text/plain').send(`User-agent: *\nAllow: /traffic/\nDisallow: /api/\nSitemap: ${PUBLIC_BASE}/traffic/sitemap.xml\n`);
  });

  app.get('/traffic/sitemap.xml', async (_req, res) => {
    try {
      await ensureSchema();
      const { rows } = await pool.query(`SELECT p.id,p.slug,p.updated_at FROM traffic_pages p JOIN traffic_campaigns c ON c.id=p.campaign_id WHERE c.status='active' AND COALESCE(NULLIF(p.body_json->>'qualityScore','')::int,0) >= 4 ORDER BY p.updated_at DESC`);
      const urls = rows.map(row => `<url><loc>${xml(pageUrl(row))}</loc><lastmod>${new Date(Number(row.updated_at)).toISOString()}</lastmod></url>`).join('');
      res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`);
    } catch (error) {
      res.status(503).type('text/plain').send('Traffic sitemap unavailable');
    }
  });

  app.get('/traffic/c/:id', async (req, res) => {
    try {
      await ensureSchema();
      const campaign = await getCampaign(req.params.id);
      if (!campaign) return res.status(404).send('Not found');
      const { rows } = await pool.query("SELECT id,slug,title,description FROM traffic_pages WHERE campaign_id=$1 AND COALESCE(NULLIF(body_json->>'qualityScore','')::int,0) >= 4 ORDER BY created_at ASC", [campaign.id]);
      const list = rows.map(page => `<a href="${esc(pageUrl(page))}"><b>${esc(page.title)}</b><span>${esc(page.description)}</span></a>`).join('');
      const body = `<span class="tag">Murdilimax Traffic Lab</span><section class="card"><h1>${esc(campaign.title || campaign.host)}</h1><p>${esc(campaign.description || `Useful decision tools for ${campaign.host}`)}</p><div class="links">${list}</div><a class="cta" href="${esc(campaign.target_url)}" rel="noopener">Open ${esc(campaign.host)} →</a></section>`;
      res.type('html').send(renderShell({ title:`${campaign.title || campaign.host} — tools`, description:campaign.description || `Useful tools for ${campaign.host}`, canonical:campaignUrl(campaign.id), lang:campaign.language, body, robots:campaign.status === 'active' ? 'index,follow' : 'noindex,nofollow' }));
    } catch (error) {
      res.status(500).send('Traffic hub unavailable');
    }
  });

  app.get('/traffic/p/:id/:slug', async (req, res) => {
    try {
      await ensureSchema();
      const { rows } = await pool.query(`SELECT p.*,c.status,c.target_url,c.host,c.language FROM traffic_pages p JOIN traffic_campaigns c ON c.id=p.campaign_id WHERE p.id=$1`, [req.params.id]);
      const row = rows[0];
      if (!row) return res.status(404).send('Not found');
      const column = isBot(req.get('user-agent')) ? 'crawls' : 'views';
      await pool.query(`UPDATE traffic_pages SET ${column}=${column}+1 WHERE id=$1`, [row.id]);
      const related = await pool.query(
        'SELECT id,slug,title,description FROM traffic_pages WHERE campaign_id=$1 AND id<>$2 AND COALESCE(NULLIF(body_json->>\'qualityScore\',\'\')::int,0) >= 4 ORDER BY clicks DESC,views DESC,created_at ASC LIMIT 6',
        [row.campaign_id, row.id]
      );
      const market = row.body_json?.siteType === 'construction' ? await loadConstructionMarketSignals() : { signals:[], generatedAt:'' };
      const pulse = marketPulseForTopic(row.topic || row.body_json?.topic || '', market.signals);
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.type('html').send(renderTrafficPage(row, related.rows, pulse, market.generatedAt));
    } catch (error) {
      console.error('Traffic page error', error);
      res.status(500).send('Traffic page unavailable');
    }
  });

  app.get('/traffic/go/:id', async (req, res) => {
    try {
      await ensureSchema();
      const { rows } = await pool.query(`SELECT p.id,p.slug,p.body_json,c.target_url,c.host FROM traffic_pages p JOIN traffic_campaigns c ON c.id=p.campaign_id WHERE p.id=$1`, [req.params.id]);
      const row = rows[0];
      if (!row) return res.status(404).send('Not found');
      await pool.query('UPDATE traffic_pages SET clicks=clicks+1 WHERE id=$1', [row.id]);
      let target = new URL(row.target_url);
      try {
        const deep = row.body_json?.targetUrl ? new URL(row.body_json.targetUrl) : null;
        if (deep && deep.hostname.replace(/^www\./,'') === target.hostname.replace(/^www\./,'')) target = deep;
      } catch {}
      if (!target.searchParams.has('utm_source')) target.searchParams.set('utm_source', 'murdilimax-traffic');
      if (!target.searchParams.has('utm_medium')) target.searchParams.set('utm_medium', 'organic-tool');
      if (!target.searchParams.has('utm_campaign')) target.searchParams.set('utm_campaign', slugify(row.host));
      if (!target.searchParams.has('utm_content')) target.searchParams.set('utm_content', row.slug);
      return res.redirect(302, target.toString());
    } catch {
      return res.status(404).send('Not found');
    }
  });

  app.get('/api/traffic/campaigns', verifyOwner, async (_req, res) => {
    try { return res.json({ campaigns: await listCampaigns(), maxActive: 2 }); }
    catch (error) { return res.status(503).json({ error: String(error?.message || error) }); }
  });

  app.post('/api/traffic/campaigns', verifyOwner, async (req, res) => {
    try {
      await ensureSchema();
      const requested = (await assertPublicUrl(req.body?.url)).toString();
      const existing = await pool.query('SELECT * FROM traffic_campaigns WHERE target_url=$1', [requested]);
      if (!existing.rows[0]) {
        const count = await pool.query("SELECT COUNT(*)::int AS count FROM traffic_campaigns WHERE status='active'");
        if (Number(count.rows[0]?.count || 0) >= 2) return res.status(409).json({ error: 'В тесте уже запущены два сайта. Остановите один из них.' });
      }
      const analysis = await analyzeSite(requested);
      const now = Date.now();
      let campaign = existing.rows[0];
      if (campaign) {
        await pool.query("UPDATE traffic_campaigns SET status='active',updated_at=$2 WHERE id=$1", [campaign.id, now]);
        campaign = { ...campaign, status:'active', target_url:analysis.url };
      } else {
        campaign = { id:crypto.randomUUID(), target_url:analysis.url };
        await pool.query('INSERT INTO traffic_campaigns (id,target_url,host,title,description,language,status,created_at,updated_at,last_run_at) VALUES ($1,$2,$3,$4,$5,$6,\'active\',$7,$7,0)',
          [campaign.id, analysis.url, analysis.host, analysis.title, analysis.description, analysis.language, now]);
      }
      await persistAnalysis(campaign, analysis);
      return res.status(201).json({ ok:true, campaigns:await listCampaigns() });
    } catch (error) {
      console.error('Traffic create failed', error);
      return res.status(400).json({ error: String(error?.message || error).slice(0, 300) });
    }
  });

  app.post('/api/traffic/campaigns/:id/refresh', verifyOwner, async (req, res) => {
    try {
      await ensureSchema();
      const campaign = await getCampaign(req.params.id);
      if (!campaign) return res.status(404).json({ error:'Campaign not found' });
      await refreshCampaign(campaign);
      return res.json({ ok:true, campaigns:await listCampaigns() });
    } catch (error) {
      return res.status(400).json({ error:String(error?.message || error).slice(0, 300) });
    }
  });

  app.post('/api/traffic/campaigns/:id/stop', verifyOwner, async (req, res) => {
    try {
      await ensureSchema();
      await pool.query("UPDATE traffic_campaigns SET status='paused',updated_at=$2 WHERE id=$1", [req.params.id, Date.now()]);
      return res.json({ ok:true, campaigns:await listCampaigns() });
    } catch (error) {
      return res.status(400).json({ error:String(error?.message || error) });
    }
  });

  app.post('/api/traffic/campaigns/:id/start', verifyOwner, async (req, res) => {
    try {
      await ensureSchema();
      const active = await pool.query("SELECT COUNT(*)::int AS count FROM traffic_campaigns WHERE status='active' AND id<>$1", [req.params.id]);
      if (Number(active.rows[0]?.count || 0) >= 2) return res.status(409).json({ error:'Уже активны два тестовых сайта.' });
      const campaign = await getCampaign(req.params.id);
      if (!campaign) return res.status(404).json({ error:'Campaign not found' });
      await pool.query("UPDATE traffic_campaigns SET status='active',updated_at=$2 WHERE id=$1", [campaign.id, Date.now()]);
      await refreshCampaign({ ...campaign, status:'active' });
      return res.json({ ok:true, campaigns:await listCampaigns() });
    } catch (error) {
      return res.status(400).json({ error:String(error?.message || error).slice(0, 300) });
    }
  });

  const upgradeLegacyCampaigns = async () => {
    try {
      await ensureSchema();
      const { rows } = await pool.query(`
        SELECT c.*
        FROM traffic_campaigns c
        WHERE c.status='active'
        ORDER BY c.created_at ASC
        LIMIT 2
      `);
      for (const campaign of rows) {
        try {
          await refreshCampaign(campaign);
          console.log(`Traffic Lab startup refresh: ${campaign.host} -> v3`);
        } catch (error) {
          console.warn('Traffic Lab intent upgrade failed:', campaign.target_url, error?.message || error);
        }
      }
    } catch (error) {
      console.warn('Traffic Lab intent upgrade unavailable:', error?.message || error);
    }
  };

  const logTrafficHealth = async () => {
    try {
      const taskCount = (await loadFreshTasks()).length;
      const priceCount = (await loadConstructionPrices('ru')).length;
      const marketCount = (await loadConstructionMarketSignals()).signals.length;
      const { rows } = await pool.query(`
        SELECT c.host,
          COUNT(p.id)::int AS pages,
          COUNT(p.id) FILTER (WHERE COALESCE(NULLIF(p.body_json->>'qualityScore','')::int,0) >= 4)::int AS indexable,
          COUNT(p.id) FILTER (WHERE jsonb_array_length(COALESCE(p.body_json->'freshTasks','[]'::jsonb)) > 0)::int AS with_tasks,
          COALESCE(MAX(COALESCE(NULLIF(p.body_json->>'crawlCount','')::int,0)),0)::int AS crawled
        FROM traffic_campaigns c
        LEFT JOIN traffic_pages p ON p.campaign_id=c.id
        GROUP BY c.host
        ORDER BY c.host
      `);
      console.log('Traffic Lab v3 health', JSON.stringify({ taskFeed:taskCount, priceFeed:priceCount, marketSignals:marketCount, campaigns:rows }));
    } catch (error) {
      console.warn('Traffic Lab v3 health unavailable:', error?.message || error);
    }
  };

  const backfillSeedPages = async () => {
    try {
      await ensureSchema();
      const { rows } = await pool.query(`
        SELECT c.*, COUNT(p.id)::int AS page_count
        FROM traffic_campaigns c
        LEFT JOIN traffic_pages p ON p.campaign_id=c.id
        WHERE c.status='active'
        GROUP BY c.id
        HAVING COUNT(p.id) < 20
        ORDER BY c.created_at ASC
        LIMIT 2
      `);
      for (const campaign of rows) {
        try {
          await refreshCampaign(campaign);
          console.log(`Traffic Lab seed backfill: ${campaign.host} -> 20 pages target`);
        } catch (error) {
          console.warn('Traffic Lab seed backfill failed:', campaign.target_url, error?.message || error);
        }
      }
    } catch (error) {
      console.warn('Traffic Lab seed backfill unavailable:', error?.message || error);
    }
  };

  const refreshDue = async () => {
    try {
      await ensureSchema();
      const cutoff = Date.now() - 24 * 60 * 60 * 1000;
      const { rows } = await pool.query("SELECT * FROM traffic_campaigns WHERE status='active' AND last_run_at<$1 ORDER BY last_run_at ASC LIMIT 2", [cutoff]);
      for (const campaign of rows) {
        try { await refreshCampaign(campaign); }
        catch (error) { console.warn('Automatic Traffic Lab refresh failed:', campaign.target_url, error?.message || error); }
      }
    } catch (error) {
      console.warn('Traffic Lab scheduler unavailable:', error?.message || error);
    }
  };

  if (pool) {
    void ensureSchema()
      .then(() => console.log('Traffic Lab ready · postgres=ok · maxActive=2'))
      .catch(error => console.error('Traffic Lab startup failed:', error?.message || error));
    setTimeout(() => void upgradeLegacyCampaigns(), 8_000).unref();
    setTimeout(() => void logTrafficHealth(), 35_000).unref();
    setTimeout(() => void backfillSeedPages(), 50_000).unref();
    setTimeout(() => void refreshDue(), 90_000).unref();
    setInterval(() => void refreshDue(), 6 * 60 * 60 * 1000).unref();
  } else {
    console.warn('Traffic Lab disabled: PostgreSQL is not configured');
  }
}
