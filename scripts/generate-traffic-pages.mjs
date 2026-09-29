import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const BASE = "https://murdilimax.com";
const EXPORT_URL = "https://murdilimax-live-earth-api.onrender.com/traffic/export.json";

const esc = value => String(value ?? "").replace(/[&<>"']/g, ch => ({
  "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
})[ch]);

const slugHost = host => String(host || "site")
  .toLowerCase().replace(/^www\./,"").replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"") || "site";

const money = value => {
  const n = Number(value);
  return Number.isFinite(n) ? new Intl.NumberFormat("ru-RU",{maximumFractionDigits:2}).format(n) : "";
};

const response = await fetch(EXPORT_URL, {
  headers: { accept:"application/json", "user-agent":"MurdilimaxTrafficMirror/1.0" },
  signal: AbortSignal.timeout(45000)
});
if (!response.ok) throw new Error(`Traffic export failed: HTTP ${response.status}`);
const payload = await response.json();
const campaigns = Array.isArray(payload.campaigns) ? payload.campaigns : [];

const root = join(process.cwd(),"public","traffic");
await rm(root,{recursive:true,force:true});
await mkdir(root,{recursive:true});

function renderPage(campaign,page,related) {
  const body = page.body || {};
  const lang = page.language || campaign.language || "ru";
  const ru = lang === "ru", lv = lang === "lv";
  const canonical = `${BASE}/traffic/${slugHost(campaign.host)}/${encodeURIComponent(page.slug)}/`;
  const min = Number(body.baseMin || 0), max = Number(body.baseMax || 0);
  const hasPrice = min > 0 && max > 0;
  const unit = body.unit ? ` / ${body.unit}` : "";
  const price = hasPrice ? (min === max ? `${money(min)} €${unit}` : `${money(min)}–${money(max)} €${unit}`) : "—";
  const priceSignals = Array.isArray(body.priceSignals) ? body.priceSignals : [];
  const tasks = Array.isArray(body.freshTasks) ? body.freshTasks : [];
  const facts = Array.isArray(body.facts) ? body.facts : [];
  const checklist = Array.isArray(body.checklist) ? body.checklist : [];
  const sources = Array.isArray(body.sourceLinks) ? body.sourceLinks : [];
  const pulse = page.marketPulse || null;

  const signalsHtml = priceSignals.length ? priceSignals.map(signal => {
    const range = Number(signal.min) === Number(signal.max)
      ? `${money(signal.min)} €`
      : `${money(signal.min)}–${money(signal.max)} €`;
    return `<div class="signal"><strong>${range}${signal.unit ? ` / ${esc(signal.unit)}` : ""}</strong><span>${esc(signal.text || "")}</span>${signal.sourceUrl ? `<a href="${esc(signal.sourceUrl)}" rel="nofollow noopener" target="_blank">${ru?"Источник":lv?"Avots":"Source"} →</a>` : ""}</div>`;
  }).join("") : `<p class="muted">${esc(body.noPriceLabel || (ru?"Надёжный числовой ориентир пока не найден.":lv?"Drošs cenu orientieris vēl nav atrasts.":"No reliable numeric benchmark found yet."))}</p>`;

  const tasksHtml = tasks.map(task => {
    const place = [task.district,task.city].filter(Boolean).join(", ");
    return `<article class="task"><div class="chips">${place?`<span>📍 ${esc(place)}</span>`:""}${task.price?`<span>💶 ${esc(task.price)}</span>`:""}${task.date?`<span>📅 ${esc(task.date)}</span>`:""}</div><h3>${esc(task.service || task.category || (ru?"Задание":"Task"))}</h3>${task.url?`<a href="${esc(task.url)}">Открыть →</a>`:""}</article>`;
  }).join("");

  const relatedHtml = related.map(item => `<a class="related" href="/traffic/${slugHost(campaign.host)}/${encodeURIComponent(item.slug)}/"><strong>${esc(item.title)}</strong><span>${esc(item.description || "")}</span></a>`).join("");
  const sourcesHtml = sources.map(item => `<a class="sourceLink" href="${esc(item.url)}" rel="nofollow noopener" target="_blank">${esc(item.text)}</a>`).join("");
  const factsHtml = facts.map((item,i)=>`<div class="fact"><b>${i+1}</b><span>${esc(item)}</span></div>`).join("");
  const checksHtml = checklist.map(item=>`<div class="check"><b>✓</b><span>${esc(item)}</span></div>`).join("");

  const pulseHtml = pulse ? `<section class="panel"><div class="sectionHead"><span>${ru?"Пульс рынка":lv?"Tirgus pulss":"Market pulse"}</span><small>${page.marketGeneratedAt ? esc(new Date(page.marketGeneratedAt).toLocaleString(ru?"ru-RU":lv?"lv-LV":"en-GB",{timeZone:"Europe/Riga"})) : ""}</small></div><div class="metrics"><div><strong>${Number(pulse.last24h||0)}</strong><span>${ru?"новых публичных предложений за 24ч":lv?"jauni publiski piedāvājumi 24h":"new public listings in 24h"}</span></div><div><strong>${Number(pulse.last7d||0)}</strong><span>${ru?"за 7 дней":lv?"7 dienās":"in 7 days"}</span></div><div><strong>${Number(pulse.riga7d||0)}</strong><span>${ru?"с упоминанием Риги":lv?"ar Rīgas pieminējumu":"mentioning Riga"}</span></div></div><p class="muted">${ru?"Это агрегированная активность публичных предложений специалистов, а не количество заказов.":lv?"Tā ir apkopota publisko speciālistu piedāvājumu aktivitāte, nevis pasūtījumu skaits.":"This is aggregated public specialist-listing activity, not an order count."}</p></section>` : "";

  const schema = {
    "@context":"https://schema.org",
    "@type":"WebPage",
    name:page.title,
    description:page.description,
    url:canonical,
    dateModified:new Date(Number(page.updatedAt||Date.now())).toISOString(),
    about:{"@type":"Thing",name:page.topic || page.title},
    isPartOf:{"@type":"WebSite",name:"MURDILIMAX",url:BASE}
  };

  return `<!doctype html><html lang="${esc(lang)}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(page.title)}</title><meta name="description" content="${esc(page.description||"")}"><meta name="robots" content="index,follow,max-image-preview:large"><link rel="canonical" href="${canonical}"><meta property="og:type" content="article"><meta property="og:title" content="${esc(page.title)}"><meta property="og:description" content="${esc(page.description||"")}"><meta property="og:url" content="${canonical}"><meta property="og:image" content="${BASE}/icon-512.png"><script type="application/ld+json">${JSON.stringify(schema).replace(/</g,"\\u003c")}</script><style>
:root{--green:#176b45;--dark:#15382d;--ink:#17231d;--muted:#6a756f;--line:#dfe6e1;--soft:#edf5f0}*{box-sizing:border-box}body{margin:0;background:#f4f7f4;color:var(--ink);font:16px Arial,sans-serif}a{color:inherit}header,main,footer{width:min(1080px,92vw);margin:auto}header{padding:20px 0;display:flex;justify-content:space-between;align-items:center}header a{text-decoration:none;font-weight:950;color:var(--green)}header span{font-size:.8rem;color:var(--muted)}main{padding-bottom:64px}.hero{background:linear-gradient(135deg,#14362b,#1c6a49);color:white;border-radius:28px;padding:clamp(26px,6vw,58px);display:grid;grid-template-columns:1.3fr .7fr;gap:20px}.badge{display:inline-block;background:#d9ff5c;color:#17321f;padding:8px 11px;border-radius:99px;font-size:.75rem;font-weight:950}.hero h1{font-size:clamp(2.15rem,6vw,4.8rem);line-height:.98;letter-spacing:-.045em;margin:16px 0}.hero p{color:#d8e5df;line-height:1.6;font-size:1.08rem}.priceBox{background:#ffffff12;border:1px solid #ffffff26;border-radius:20px;padding:20px;align-self:end}.priceBox small,.priceBox span{display:block;color:#c7d8d0}.priceBox strong{display:block;font-size:clamp(2rem,4vw,3.4rem);margin:7px 0}.cta{display:inline-block;background:#d9ff5c;color:#17321f;text-decoration:none;font-weight:950;padding:14px 18px;border-radius:14px;margin-top:8px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:16px}.panel{background:white;border:1px solid var(--line);border-radius:20px;padding:22px;margin-top:16px}.panel h2{margin:0 0 14px;font-size:1.45rem}.muted{color:var(--muted);line-height:1.55}.calc{display:grid;grid-template-columns:1fr 1fr;gap:10px}.calc input{width:100%;padding:13px;border:1px solid var(--line);border-radius:12px;font:inherit}.result{background:var(--soft);padding:13px;border-radius:12px}.result strong{display:block;font-size:1.45rem;color:var(--green)}.facts,.checks,.signals{display:grid;gap:9px}.fact,.check,.signal{border:1px solid #e7ebe8;background:#fbfcfb;border-radius:14px;padding:13px}.fact,.check{display:flex;gap:10px}.fact b,.check b{width:26px;height:26px;border-radius:8px;background:var(--soft);display:grid;place-items:center;color:var(--green);flex:0 0 26px}.signal strong,.signal span,.signal a{display:block}.signal span{color:var(--muted);margin-top:4px;line-height:1.4}.signal a,.task a,.sourceLink{color:var(--green);font-weight:850;text-decoration:none;margin-top:7px}.metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.metrics div{background:var(--soft);border-radius:14px;padding:16px}.metrics strong,.metrics span{display:block}.metrics strong{font-size:2rem;color:var(--green)}.metrics span{font-size:.8rem;color:var(--muted);margin-top:4px}.sectionHead{display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:10px}.sectionHead span{font-size:1.35rem;font-weight:900}.sectionHead small{color:var(--muted)}.taskGrid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.task{border:1px solid var(--line);border-radius:14px;padding:14px;background:#fbfcfb}.task h3{font-size:1rem}.chips{display:flex;gap:5px;flex-wrap:wrap}.chips span{background:var(--soft);padding:5px 7px;border-radius:99px;font-size:.7rem}.relatedGrid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}.related{display:block;text-decoration:none;border:1px solid var(--line);border-radius:14px;padding:14px}.related strong,.related span{display:block}.related span{color:var(--muted);font-size:.82rem;margin-top:5px;line-height:1.4}.sourceLinks{display:flex;flex-wrap:wrap;gap:8px}.sourceLink{background:var(--soft);padding:9px 11px;border-radius:99px}.footerCta{background:var(--dark);color:white;display:flex;justify-content:space-between;align-items:center;gap:16px}.footerCta .cta{margin:0;white-space:nowrap}footer{padding:18px 0 40px;color:var(--muted);font-size:.8rem;line-height:1.5}.pixel{position:absolute;width:1px;height:1px;opacity:.01;pointer-events:none}
@media(max-width:760px){.hero,.grid{grid-template-columns:1fr}.metrics,.taskGrid,.relatedGrid{grid-template-columns:1fr}.hero h1{font-size:clamp(2.3rem,11vw,4rem)}.footerCta{align-items:flex-start;flex-direction:column}.footerCta .cta{width:100%;text-align:center}.calc{grid-template-columns:1fr}}
</style></head><body><img class="pixel" alt="" src="https://murdilimax-live-earth-api.onrender.com/traffic/track/${encodeURIComponent(page.id)}/pixel.gif"><header><a href="/">🔨 MURDILIMAX</a><span>Traffic Lab · ${esc(campaign.host)}</span></header><main><section class="hero"><div><span class="badge">${ru?"РЫНОЧНЫЕ ДАННЫЕ":lv?"TIRGUS DATI":"MARKET DATA"}</span><h1>${esc(page.title)}</h1><p>${esc(body.intro || page.description || "")}</p><a class="cta" href="${esc(page.clickUrl)}">${esc(body.openCalculatorLabel || (ru?"Рассчитать на сайте":lv?"Aprēķināt vietnē":"Calculate on website"))} →</a></div><div class="priceBox"><small>${esc(body.sourceDataLabel || (ru?"Ориентир":lv?"Orientieris":"Benchmark"))}</small><strong>${esc(price)}</strong><span>${esc(body.exactLabel || "")}</span></div></section>
<section class="grid"><article class="panel"><h2>${esc(body.calculatorTitle || (ru?"Быстрый расчёт":lv?"Ātrais aprēķins":"Quick estimate"))}</h2>${hasPrice?`<div class="calc"><label>${esc(body.quantityLabel||"Количество")}<input id="qty" type="number" value="1" min="0.1" step="0.1"></label><div class="result"><small>${esc(body.resultLabel||"Итого")}</small><strong id="total"></strong></div></div><p class="muted">${esc(body.exactLabel||"")}</p>`:`<p class="muted">${esc(body.noPriceLabel||"")}</p>`}</article><article class="panel"><h2>${esc(body.factorsTitle || (ru?"Что влияет на цену":lv?"Kas ietekmē cenu":"What affects cost"))}</h2><div class="facts">${factsHtml}</div></article></section>
<section class="grid"><article class="panel"><h2>${esc(body.sourceDataLabel || (ru?"Данные":lv?"Dati":"Data"))}</h2><div class="signals">${signalsHtml}</div></article><article class="panel"><h2>${esc(body.checklistTitle || (ru?"Перед заказом":lv?"Pirms pasūtījuma":"Before ordering"))}</h2><div class="checks">${checksHtml}</div></article></section>
${pulseHtml}
${tasksHtml?`<section class="panel"><h2>${ru?"Свежие реальные задания":lv?"Svaigi reāli uzdevumi":"Fresh real tasks"}</h2><p class="muted">${ru?"Только публичные поля без личных контактов.":lv?"Tikai publiski lauki bez personas kontaktiem.":"Public fields only; no personal contact details."}</p><div class="taskGrid">${tasksHtml}</div></section>`:""}
${sourcesHtml?`<section class="panel"><h2>${ru?"Полезные разделы источника":lv?"Noderīgas avota sadaļas":"Useful source sections"}</h2><div class="sourceLinks">${sourcesHtml}</div></section>`:""}
${relatedHtml?`<section class="panel"><h2>${esc(body.relatedTitle || (ru?"Смотрите также":lv?"Skatiet arī":"Related"))}</h2><div class="relatedGrid">${relatedHtml}</div></section>`:""}
<section class="panel footerCta"><div><h2>${ru?"Нужен точный расчёт?":lv?"Vajag precīzu aprēķinu?":"Need an exact estimate?"}</h2><p>${ru?`Откройте ${esc(campaign.host)} и рассчитайте по своим параметрам.`:lv?`Atveriet ${esc(campaign.host)} un aprēķiniet pēc saviem parametriem.`:`Open ${esc(campaign.host)} and calculate with your own parameters.`}</p></div><a class="cta" href="${esc(page.clickUrl)}">${esc(body.openCalculatorLabel || "Open")} →</a></section></main><footer>Traffic Lab не придумывает цены: числовые ориентиры берутся из опубликованных источников и рыночного benchmark. Итоговая цена зависит от конкретного объекта.</footer>${hasPrice?`<script>(function(){const q=document.getElementById("qty"),o=document.getElementById("total"),mn=${JSON.stringify(min)},mx=${JSON.stringify(max)},u=${JSON.stringify(body.unit||"")};function f(n){return new Intl.NumberFormat("ru-RU",{maximumFractionDigits:2}).format(n)}function calc(){const x=Math.max(.1,Number(q.value)||1),a=mn*x,b=mx*x;o.textContent=(Math.abs(a-b)<.001?f(a):f(a)+"–"+f(b))+" €"+(u?" / "+u:"")}q.addEventListener("input",calc);calc()})();</script>`:""}</body></html>`;
}

function renderHub(campaign) {
  const hostSlug = slugHost(campaign.host);
  const canonical = `${BASE}/traffic/${hostSlug}/`;
  const pages = campaign.pages || [];
  const links = pages.map(page => `<a href="/traffic/${hostSlug}/${encodeURIComponent(page.slug)}/"><strong>${esc(page.title)}</strong><span>${esc(page.description||"")}</span></a>`).join("");
  return `<!doctype html><html lang="${esc(campaign.language||"ru")}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(campaign.title||campaign.host)} — цены и калькуляторы</title><meta name="description" content="${esc(campaign.description||`Полезные расчёты и ориентиры для ${campaign.host}`)}"><meta name="robots" content="index,follow"><link rel="canonical" href="${canonical}"><style>body{margin:0;background:#f4f7f4;color:#17231d;font:16px Arial,sans-serif}header,main,footer{width:min(1000px,92vw);margin:auto;padding:22px}header a{color:#176b45;font-weight:950;text-decoration:none}h1{font-size:clamp(2.2rem,7vw,4.7rem);line-height:1;margin:20px 0}.intro{color:#68736d;line-height:1.6}.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}.grid a{background:white;border:1px solid #dfe6e1;border-radius:16px;padding:17px;text-decoration:none}.grid strong,.grid span{display:block}.grid span{color:#68736d;font-size:.85rem;line-height:1.45;margin-top:5px}@media(max-width:700px){.grid{grid-template-columns:1fr}}</style></head><body><header><a href="/">🔨 MURDILIMAX</a></header><main><h1>${esc(campaign.title||campaign.host)}</h1><p class="intro">${esc(campaign.description||"")} · Traffic Lab публикует только страницы, прошедшие внутренний Quality Gate.</p><div class="grid">${links}</div></main><footer>Источник назначения: ${esc(campaign.host)}</footer></body></html>`;
}

const trafficUrls = [];
for (const campaign of campaigns) {
  const pages = Array.isArray(campaign.pages) ? campaign.pages : [];
  if (!pages.length) continue;
  const hostSlug = slugHost(campaign.host);
  const campaignDir = join(root,hostSlug);
  await mkdir(campaignDir,{recursive:true});
  await writeFile(join(campaignDir,"index.html"),renderHub(campaign),"utf8");
  trafficUrls.push({url:`${BASE}/traffic/${hostSlug}/`,updated:payload.generatedAt});
  for (let i=0;i<pages.length;i++) {
    const page = pages[i];
    const related = pages.filter((_,idx)=>idx!==i).slice(0,6);
    const dir = join(campaignDir,page.slug);
    await mkdir(dir,{recursive:true});
    await writeFile(join(dir,"index.html"),renderPage(campaign,page,related),"utf8");
    trafficUrls.push({url:`${BASE}/traffic/${hostSlug}/${encodeURIComponent(page.slug)}/`,updated:page.updatedAt ? new Date(page.updatedAt).toISOString() : payload.generatedAt});
  }
}

const sitemapPath = join(process.cwd(),"public","sitemap.xml");
let sitemap = await readFile(sitemapPath,"utf8");
const additions = trafficUrls
  .filter(item => !sitemap.includes(`<loc>${item.url}</loc>`))
  .map(item => `  <url><loc>${item.url}</loc><lastmod>${String(item.updated||payload.generatedAt||new Date().toISOString()).slice(0,10)}</lastmod><changefreq>daily</changefreq></url>`)
  .join("\n");
if (additions) sitemap = sitemap.replace("</urlset>",`${additions}\n</urlset>`);
await writeFile(sitemapPath,sitemap,"utf8");

console.log(`Generated ${trafficUrls.length} branded Traffic Lab URLs from ${campaigns.length} active campaigns`);
