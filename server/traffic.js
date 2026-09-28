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

function analyzeHtml(html, finalUrl) {
  const title = textOnly(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '', 140);
  let description = '';
  const metas = html.match(/<meta\b[^>]*>/gi) || [];
  for (const tag of metas) {
    const key = (attr(tag, 'name') || attr(tag, 'property')).toLowerCase();
    if (key === 'description' || key === 'og:description') {
      description = textOnly(attr(tag, 'content'), 260);
      if (description) break;
    }
  }
  const headings = [];
  for (const match of html.matchAll(/<h[12]\b[^>]*>([\s\S]*?)<\/h[12]>/gi)) {
    const value = textOnly(match[1], 100);
    if (value.length >= 3 && !headings.some(x => x.toLowerCase() === value.toLowerCase())) headings.push(value);
    if (headings.length >= 12) break;
  }
  const base = new URL(finalUrl);
  const links = [];
  for (const match of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const href = attr(match[1], 'href');
    const label = textOnly(match[2], 70);
    if (!href || !label || href.startsWith('#') || /^(mailto:|tel:|javascript:)/i.test(href)) continue;
    try {
      const url = new URL(href, base);
      if (!['http:', 'https:'].includes(url.protocol)) continue;
      if (url.hostname.replace(/^www\./, '') !== base.hostname.replace(/^www\./, '')) continue;
      url.hash = '';
      if (!links.some(item => item.url === url.toString())) links.push({ text: label, url: url.toString() });
      if (links.length >= 10) break;
    } catch {}
  }
  const fallbackTopic = title.split(/\s+[|—–-]\s+/)[0]?.trim() || base.hostname.replace(/^www\./, '');
  const primaryTopic = headings[0] || fallbackTopic;
  const sample = [title, description, ...headings].join(' ');
  return {
    url: finalUrl,
    host: base.hostname.replace(/^www\./, ''),
    title: title || base.hostname,
    description,
    headings,
    links,
    language: detectLanguage(html, sample),
    topic: textOnly(primaryTopic, 80) || base.hostname
  };
}

const COPY = {
  ru: {
    checklist: t => `${t}: чек-лист перед выбором`,
    questions: t => `${t}: 7 вопросов перед решением`,
    compare: t => `Как сравнить варианты: ${t}`,
    mistakes: t => `${t}: частые ошибки при выборе`,
    first: t => `${t}: с чего начать`,
    value: t => `${t}: что важно проверить`,
    desc: (t, h) => `Короткий интерактивный чек-лист по теме «${t}» со ссылками на полезные разделы ${h}.`,
    intro: t => `Используйте этот мини-инструмент, чтобы быстро проверить основные пункты перед решением по теме «${t}».`,
    checklistTitle: 'Быстрая проверка',
    sectionsTitle: 'Полезные разделы источника',
    source: 'Перейти на сайт',
    score: 'Отмечено',
    criteria: ['Цена и полная стоимость понятны', 'Условия и ограничения подходят', 'Есть понятный способ связи/поддержки', 'Сравнены хотя бы два варианта', 'Проверены сроки, возврат или отмена']
  },
  lv: {
    checklist: t => `${t}: pārbaudes saraksts pirms izvēles`,
    questions: t => `${t}: 7 jautājumi pirms lēmuma`,
    compare: t => `Kā salīdzināt variantus: ${t}`,
    mistakes: t => `${t}: biežākās kļūdas izvēloties`,
    first: t => `${t}: ar ko sākt`,
    value: t => `${t}: ko ir vērts pārbaudīt`,
    desc: (t, h) => `Īss interaktīvs kontrolsaraksts par “${t}” ar saitēm uz noderīgām ${h} sadaļām.`,
    intro: t => `Izmantojiet šo mini rīku, lai ātri pārbaudītu svarīgākos punktus pirms lēmuma par “${t}”.`,
    checklistTitle: 'Ātrā pārbaude',
    sectionsTitle: 'Noderīgas avota sadaļas',
    source: 'Atvērt vietni',
    score: 'Atzīmēts',
    criteria: ['Cena un kopējās izmaksas ir saprotamas', 'Nosacījumi un ierobežojumi der', 'Ir skaidrs saziņas vai atbalsta veids', 'Salīdzināti vismaz divi varianti', 'Pārbaudīti termiņi, atgriešana vai atcelšana']
  },
  en: {
    checklist: t => `${t}: checklist before you choose`,
    questions: t => `${t}: 7 questions before deciding`,
    compare: t => `How to compare options: ${t}`,
    mistakes: t => `${t}: common mistakes to avoid`,
    first: t => `${t}: where to start`,
    value: t => `${t}: what is worth checking`,
    desc: (t, h) => `A short interactive checklist for “${t}” with links to useful sections of ${h}.`,
    intro: t => `Use this mini tool to check the main points before making a decision about “${t}”.`,
    checklistTitle: 'Quick check',
    sectionsTitle: 'Useful source sections',
    source: 'Open website',
    score: 'Checked',
    criteria: ['Price and total cost are clear', 'Terms and limits fit your needs', 'Contact or support options are clear', 'At least two options were compared', 'Timing, returns or cancellation were checked']
  }
};

function pageDrafts(analysis) {
  const c = COPY[analysis.language] || COPY.en;
  const candidates = [analysis.topic, ...analysis.headings].map(x => textOnly(x, 78)).filter(Boolean);
  const unique = [];
  for (const item of candidates) if (!unique.some(x => x.toLowerCase() === item.toLowerCase())) unique.push(item);
  while (unique.length < 6) unique.push(analysis.topic);
  const kinds = ['checklist', 'questions', 'compare', 'mistakes', 'first', 'value'];
  return kinds.map((kind, index) => {
    const topic = unique[index] || analysis.topic;
    const title = c[kind](topic);
    return {
      slug: `${kind}-${slugify(topic)}`.slice(0, 96),
      title,
      description: c.desc(topic, analysis.host),
      topic,
      body: {
        intro: c.intro(topic),
        checklistTitle: c.checklistTitle,
        sectionsTitle: c.sectionsTitle,
        sourceLabel: c.source,
        scoreLabel: c.score,
        criteria: c.criteria,
        sections: analysis.headings.slice(0, 7),
        links: analysis.links.slice(0, 7)
      }
    };
  });
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

function renderShell({ title, description, canonical, lang = 'en', body, robots = 'index,follow' }) {
  return `<!doctype html><html lang="${esc(lang)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><meta name="description" content="${esc(description)}"><meta name="robots" content="${esc(robots)}"><link rel="canonical" href="${esc(canonical)}"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${esc(canonical)}"><meta property="og:type" content="website"><style>
  :root{font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#eaf5ff;background:#061019}
  *{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 20% 0,#153652,#061019 42%,#03070b);min-height:100vh}main{width:min(880px,92vw);margin:0 auto;padding:52px 0 70px}.tag{display:inline-flex;padding:7px 10px;border:1px solid #24516c;border-radius:999px;color:#7cdbff;font-size:12px;letter-spacing:.08em;text-transform:uppercase}.card{margin-top:18px;padding:24px;border:1px solid #17384c;border-radius:22px;background:rgba(6,19,30,.9);box-shadow:0 22px 70px rgba(0,0,0,.28)}h1{font-size:clamp(31px,5vw,56px);line-height:1.02;letter-spacing:-.04em;margin:14px 0}h2{font-size:20px;margin:28px 0 10px}p{color:#9ab2c3;line-height:1.65}label{display:flex;gap:10px;align-items:flex-start;padding:11px 0;border-bottom:1px solid rgba(255,255,255,.06)}input{margin-top:3px}.score{margin:14px 0;color:#7de1ff;font-weight:800}.links{display:grid;gap:8px}.links a{color:#a8e8ff;text-decoration:none;padding:10px 12px;border-radius:12px;background:#0a1d2b}.cta{display:inline-flex;margin-top:22px;padding:13px 18px;border-radius:13px;background:#6cddff;color:#001018;text-decoration:none;font-weight:900}.small{font-size:12px;color:#66859b}
  </style></head><body><main>${body}</main></body></html>`;
}

function renderTrafficPage(row) {
  const body = row.body_json || {};
  const canonical = pageUrl(row);
  const active = row.status === 'active';
  const criteria = (body.criteria || []).map((item, i) => `<label><input class="criterion" type="checkbox" value="${i}"><span>${esc(item)}</span></label>`).join('');
  const sections = (body.sections || []).map(item => `<li>${esc(item)}</li>`).join('');
  const links = (body.links || []).map(item => `<a href="${esc(item.url)}" rel="noopener">${esc(item.text)}</a>`).join('');
  const source = `/traffic/go/${encodeURIComponent(row.id)}`;
  const htmlBody = `<span class="tag">Murdilimax Traffic Lab</span><section class="card"><h1>${esc(row.title)}</h1><p>${esc(body.intro || row.description)}</p><h2>${esc(body.checklistTitle || 'Quick check')}</h2><div id="criteria">${criteria}</div><div class="score"><span id="done">0</span>/${(body.criteria || []).length} ${esc(body.scoreLabel || 'checked')}</div>${sections ? `<h2>${esc(body.sectionsTitle || 'Useful sections')}</h2><ul>${sections}</ul>` : ''}${links ? `<div class="links">${links}</div>` : ''}<a class="cta" href="${source}">${esc(body.sourceLabel || 'Open website')} →</a><p class="small">Source: ${esc(row.host)} · utility page generated from publicly visible website information.</p></section><script>const boxes=[...document.querySelectorAll('.criterion')],done=document.getElementById('done');function update(){done.textContent=String(boxes.filter(x=>x.checked).length)}boxes.forEach(x=>x.addEventListener('change',update));</script>`;
  return renderShell({ title: row.title, description: row.description, canonical, lang: row.language || 'en', body: htmlBody, robots: active ? 'index,follow' : 'noindex,nofollow' });
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
      COUNT(p.id)::int AS page_count
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
      publicHubUrl: campaignUrl(c.id),
      pages: pages.filter(p => p.campaign_id === c.id).map(p => ({ ...p, views:Number(p.views||0), crawls:Number(p.crawls||0), clicks:Number(p.clicks||0), url:pageUrl(p) }))
    }));
  }

  async function submitIndexNow(pageRows, campaignId) {
    const urls = [campaignUrl(campaignId), ...pageRows.map(pageUrl)];
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
    for (const draft of pageDrafts(analysis)) {
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
      rows.push({ id, slug: draft.slug });
    }
    const indexStatus = await submitIndexNow(rows, campaign.id);
    await pool.query('UPDATE traffic_campaigns SET indexnow_status=$2,updated_at=$3 WHERE id=$1', [campaign.id, indexStatus, Date.now()]);
  }

  async function refreshCampaign(campaign) {
    try {
      const fetched = await fetchHtml(campaign.target_url);
      const analysis = analyzeHtml(fetched.html, fetched.finalUrl);
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
      const { rows } = await pool.query(`SELECT p.id,p.slug,p.updated_at FROM traffic_pages p JOIN traffic_campaigns c ON c.id=p.campaign_id WHERE c.status='active' ORDER BY p.updated_at DESC`);
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
      const { rows } = await pool.query('SELECT id,slug,title,description FROM traffic_pages WHERE campaign_id=$1 ORDER BY created_at ASC', [campaign.id]);
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
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.type('html').send(renderTrafficPage(row));
    } catch (error) {
      console.error('Traffic page error', error);
      res.status(500).send('Traffic page unavailable');
    }
  });

  app.get('/traffic/go/:id', async (req, res) => {
    try {
      await ensureSchema();
      const { rows } = await pool.query(`SELECT p.id,p.slug,c.target_url,c.host FROM traffic_pages p JOIN traffic_campaigns c ON c.id=p.campaign_id WHERE p.id=$1`, [req.params.id]);
      const row = rows[0];
      if (!row) return res.status(404).send('Not found');
      await pool.query('UPDATE traffic_pages SET clicks=clicks+1 WHERE id=$1', [row.id]);
      const target = new URL(row.target_url);
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
      const fetched = await fetchHtml(requested);
      const analysis = analyzeHtml(fetched.html, fetched.finalUrl);
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
    setTimeout(() => void refreshDue(), 90_000).unref();
    setInterval(() => void refreshDue(), 6 * 60 * 60 * 1000).unref();
  }
}
