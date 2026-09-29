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
    priceSignals: priceSignalsFromText(sourceText),
    language,
    siteType,
    location,
    topic: topics[0] || fallbackTopic || base.hostname
  };
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
  const ranked = analysis.priceSignals
    .map(signal => ({ ...signal, score: overlapScore(topic, signal.text) }))
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
  return {
    slug: `${slugPrefix}-${intent}-${slugify(cleanTopic)}`.slice(0, 110),
    title,
    description: introText(analysis.language, cleanTopic, intent, analysis.host, Boolean(primary)).slice(0, 260),
    topic: cleanTopic,
    body: {
      version: 2,
      template: 'intent-page',
      intent,
      siteType: analysis.siteType,
      topic: cleanTopic,
      location: analysis.location,
      host: analysis.host,
      intro: introText(analysis.language, cleanTopic, intent, analysis.host, Boolean(primary)),
      sourceCheckedAt: checkedAt,
      imageUrl: analysis.imageUrl || '',
      targetUrl,
      priceSignals: signals,
      baseMin: primary?.min || null,
      baseMax: primary?.max || null,
      unit: primary?.unit || '',
      sourceDataLabel: c.sourceData,
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
      sourceLinks: analysis.links
        .map(item => ({ ...item, score:overlapScore(cleanTopic, item.text) }))
        .sort((a,b)=>b.score-a.score)
        .filter(item => item.score > 0)
        .slice(0, 5)
        .map(({text,url}) => ({text,url}))
    }
  };
}

function rankedTopics(analysis) {
  const constructionHints = /ремонт|строит|отдел|плит|шпак|штукатур|покрас|маляр|электр|сантех|ванн|кухн|пол|ламин|паркет|кров|фасад|buv|remont|fliz|santeh|kras|apdar|jumt|grīd|grid|elektr|renovat|til|plumb|paint|floor|roof/i;
  const seen = new Set();
  const scored = [];
  for (const raw of [analysis.topic, ...(analysis.topics || []), ...analysis.headings, ...analysis.links.map(x=>x.text)]) {
    const topic = cleanTopicCandidate(raw);
    if (!topic) continue;
    const key = topicNorm(topic);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    let score = 0;
    if (analysis.siteType === 'construction' && constructionHints.test(topic)) score += 8;
    if (analysis.priceSignals.some(s => overlapScore(topic, s.text) > 0)) score += 6;
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
  *{box-sizing:border-box}body{margin:0;background:linear-gradient(180deg,#f8faf7 0,#f3f5f2 100%);min-height:100vh;color:var(--ink)}a{color:inherit}main{width:min(1080px,92vw);margin:0 auto;padding:24px 0 72px}.topbar{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 0 24px}.brand{display:flex;align-items:center;gap:10px;font-weight:900;letter-spacing:-.02em}.brandmark{width:34px;height:34px;border-radius:12px;display:grid;place-items:center;background:var(--accent);color:#fff}.fresh{font-size:12px;color:var(--muted);padding:7px 10px;border:1px solid var(--line);border-radius:999px;background:#fff}.hero{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(260px,.65fr);gap:18px;align-items:stretch}.heroCard,.panel{background:var(--card);border:1px solid var(--line);border-radius:24px;box-shadow:0 14px 44px rgba(29,46,38,.06)}.heroCard{padding:clamp(24px,5vw,54px);position:relative;overflow:hidden}.heroCard:after{content:"";position:absolute;right:-70px;top:-90px;width:240px;height:240px;border-radius:50%;background:radial-gradient(circle,#d9f0e5 0,rgba(217,240,229,0) 70%);pointer-events:none}.eyebrow{display:inline-flex;padding:7px 10px;border-radius:999px;background:var(--soft);color:var(--accent2);font-size:12px;font-weight:900;letter-spacing:.06em;text-transform:uppercase}.hero h1{font-size:clamp(34px,5.6vw,66px);line-height:.98;letter-spacing:-.052em;margin:16px 0 18px;max-width:820px}.hero p{font-size:18px;line-height:1.65;color:var(--muted);max-width:760px}.heroSide{padding:20px;display:flex;flex-direction:column;justify-content:space-between;gap:16px}.heroImage{width:100%;aspect-ratio:16/10;object-fit:cover;border-radius:17px;background:linear-gradient(135deg,#e7efe9,#d7e7dd)}.priceLabel{font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;font-weight:800}.priceBig{font-size:34px;font-weight:950;letter-spacing:-.04em;margin:4px 0}.priceNote{font-size:13px;line-height:1.45;color:var(--muted)}.cta{display:inline-flex;align-items:center;justify-content:center;gap:8px;text-decoration:none;background:var(--accent);color:#fff;padding:14px 18px;border-radius:14px;font-weight:900;border:0}.cta:hover{background:var(--accent2)}.cta.secondary{background:#fff;color:var(--accent2);border:1px solid var(--line)}.grid{display:grid;grid-template-columns:1.05fr .95fr;gap:18px;margin-top:18px}.panel{padding:24px}.panel h2{font-size:24px;letter-spacing:-.03em;margin:0 0 14px}.panel p{color:var(--muted);line-height:1.6}.facts{display:grid;gap:10px}.fact{display:flex;gap:12px;align-items:flex-start;padding:14px;border:1px solid #e5e9e5;border-radius:16px;background:#fbfcfa}.num{width:30px;height:30px;flex:0 0 30px;border-radius:10px;background:var(--soft);display:grid;place-items:center;font-weight:900;color:var(--accent2)}.sourceSignals{display:grid;gap:9px}.signal{padding:13px 14px;border-radius:14px;background:#f7f9f6;border:1px solid #e5e9e5}.signal b{display:block;margin-bottom:4px}.signal small{color:var(--muted);line-height:1.4}.calc{display:grid;grid-template-columns:1fr 1fr;gap:12px;align-items:end}.calc label{font-size:12px;font-weight:800;color:var(--muted);display:grid;gap:7px}.calc input{width:100%;padding:13px 14px;border:1px solid #ccd5ce;border-radius:12px;font:inherit;background:#fff}.calcResult{padding:13px 14px;border-radius:12px;background:var(--soft)}.calcResult strong{display:block;font-size:23px;color:var(--accent2)}.checklist{display:grid;gap:9px}.check{display:flex;gap:10px;align-items:flex-start}.check i{font-style:normal;width:24px;height:24px;border-radius:8px;background:#e6f4ec;color:var(--accent2);display:grid;place-items:center;font-weight:950;flex:0 0 24px}.sourceLinks,.related{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.mini{display:block;text-decoration:none;padding:14px;border:1px solid var(--line);border-radius:15px;background:#fff}.mini b{display:block;font-size:14px;line-height:1.35}.mini small{display:block;color:var(--muted);margin-top:5px;line-height:1.35}.footerCta{margin-top:18px;padding:28px;border-radius:24px;background:#173b31;color:#fff;display:flex;justify-content:space-between;gap:20px;align-items:center}.footerCta h2{margin:0 0 8px;font-size:28px}.footerCta p{margin:0;color:#c8d8d1;line-height:1.5}.footerCta .cta{background:#fff;color:#173b31;white-space:nowrap}.disclaimer{margin-top:18px;color:#7b8580;font-size:12px;line-height:1.5;text-align:center}
  @media(max-width:780px){main{width:min(94vw,720px);padding-top:12px}.hero,.grid{grid-template-columns:1fr}.hero h1{font-size:clamp(34px,11vw,54px)}.heroCard{padding:26px 22px}.hero p{font-size:16px}.sourceLinks,.related{grid-template-columns:1fr}.footerCta{align-items:flex-start;flex-direction:column}.footerCta .cta{width:100%}.calc{grid-template-columns:1fr}}
  </style></head><body><main>${body}</main></body></html>`;
}

function renderTrafficPage(row, relatedRows = []) {
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
    ? priceSignals.map(signal => `<div class="signal"><b>${formatPrice(signal.min)}${Number(signal.max)!==Number(signal.min)?`–${formatPrice(signal.max)}`:''} €${signal.unit?` / ${esc(signal.unit)}`:''}</b><small>${esc(signal.text)}</small></div>`).join('')
    : `<div class="signal"><small>${esc(body.noPriceLabel || 'No reliable numeric price found.')}</small></div>`;

  const factsHtml = (body.facts || []).map((item,i)=>`<div class="fact"><span class="num">${i+1}</span><div>${esc(item)}</div></div>`).join('');
  const checksHtml = (body.checklist || []).map(item=>`<div class="check"><i>✓</i><span>${esc(item)}</span></div>`).join('');
  const sourceLinksHtml = (body.sourceLinks || []).map(item=>`<a class="mini" href="${esc(item.url)}" rel="noopener"><b>${esc(item.text)}</b><small>${esc(row.host)}</small></a>`).join('');
  const relatedHtml = relatedRows.map(item=>`<a class="mini" href="${esc(pageUrl(item))}"><b>${esc(item.title)}</b><small>${esc(item.description || '')}</small></a>`).join('');

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

    ${sourceLinksHtml ? `<section class="panel" style="margin-top:18px"><h2>${esc(row.language === 'ru' ? 'Разделы исходного сайта по этой теме' : row.language === 'lv' ? 'Avota vietnes sadaļas par šo tēmu' : 'Relevant source sections')}</h2><div class="sourceLinks">${sourceLinksHtml}</div></section>` : ''}
    ${relatedHtml ? `<section class="panel" style="margin-top:18px"><h2>${esc(body.relatedTitle || 'Related')}</h2><div class="related">${relatedHtml}</div></section>` : ''}

    <section class="footerCta"><div><h2>${esc(row.language === 'ru' ? 'Нужен точный расчёт?' : row.language === 'lv' ? 'Vajag precīzu aprēķinu?' : 'Need an exact estimate?')}</h2><p>${esc(row.language === 'ru' ? `Откройте ${row.host} и рассчитайте стоимость по своим параметрам.` : row.language === 'lv' ? `Atveriet ${row.host} un aprēķiniet izmaksas pēc saviem parametriem.` : `Open ${row.host} and calculate using your own parameters.`)}</p></div><a class="cta" href="${source}">${esc(body.openCalculatorLabel || 'Open website')} →</a></section>
    <div class="disclaimer">${esc(row.language === 'ru' ? 'Traffic Lab не придумывает цены: числовые ориентиры показываются только когда они найдены на публичной странице источника.' : row.language === 'lv' ? 'Traffic Lab neizdomā cenas: skaitliskie orientieri tiek rādīti tikai tad, ja tie atrasti publiskajā avota lapā.' : 'Traffic Lab does not invent prices: numeric signals are shown only when found on the public source page.')}</div>
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

  return renderShell({ title:row.title, description:row.description, canonical, lang:row.language || 'en', body:bodyHtml, robots:active?'index,follow':'noindex,nofollow', imageUrl:body.imageUrl || '', schema });
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
      rows.push({ id, slug:draft.slug });
      return Boolean(!found.rows[0]?.id);
    };

    for (const draft of pageDrafts(analysis, 20)) await upsertDraft(draft);

    // Upgrade pages generated by the first Traffic Lab version in place.
    // This preserves their URLs, crawl history and counters while replacing thin checklist content.
    const legacy = await pool.query('SELECT id,slug,topic,body_json FROM traffic_pages WHERE campaign_id=$1', [campaign.id]);
    for (const page of legacy.rows) {
      if (Number(page.body_json?.version || 0) >= 2) continue;
      const upgraded = buildIntentDraft(analysis, page.topic || analysis.topic, 'guide', 'legacy');
      await pool.query(
        'UPDATE traffic_pages SET title=$3,description=$4,topic=$5,body_json=$6::jsonb,updated_at=$7 WHERE id=$1 AND campaign_id=$2',
        [page.id, campaign.id, upgraded.title, upgraded.description, upgraded.topic, JSON.stringify(upgraded.body), now]
      );
      rows.push({ id:page.id, slug:page.slug });
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
      const related = await pool.query(
        'SELECT id,slug,title,description FROM traffic_pages WHERE campaign_id=$1 AND id<>$2 ORDER BY clicks DESC,views DESC,created_at ASC LIMIT 6',
        [row.campaign_id, row.id]
      );
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.type('html').send(renderTrafficPage(row, related.rows));
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
    setTimeout(() => void backfillSeedPages(), 20_000).unref();
    setTimeout(() => void refreshDue(), 90_000).unref();
    setInterval(() => void refreshDue(), 6 * 60 * 60 * 1000).unref();
  } else {
    console.warn('Traffic Lab disabled: PostgreSQL is not configured');
  }
}
