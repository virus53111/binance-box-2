import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const BASE = "https://murdilimax.com";
const data = JSON.parse(await readFile("public/external-leads.json", "utf8"));
const leads = Array.isArray(data.leads) ? data.leads : [];
const MIN_CITY = 5, MIN_CATEGORY = 8, MIN_CITY_CATEGORY = 6;

const citySlug = {"Рига":"riga","Даугавпилс":"daugavpils","Лиепая":"liepaja","Елгава":"jelgava","Юрмала":"jurmala","Вентспилс":"ventspils","Резекне":"rezekne","Валмиера":"valmiera","Екабпилс":"jekabpils","Огре":"ogre","Тукумс":"tukums","Цесис":"cesis","Саласпилс":"salaspils","Латвия":"latvija","Latvija":"latvija"};
const cityLv = {"Рига":"Rīgā","Даугавпилс":"Daugavpilī","Лиепая":"Liepājā","Елгава":"Jelgavā","Юрмала":"Jūrmalā","Вентспилс":"Ventspilī","Резекне":"Rēzeknē","Валмиера":"Valmierā","Екабпилс":"Jēkabpilī","Огре":"Ogrē","Тукумс":"Tukumā","Цесис":"Cēsīs","Саласпилс":"Salaspilī","Латвия":"Latvijā","Latvija":"Latvijā"};
const lvCat = {courier:"Piegāde",driver:"Pārvadājumi",loader:"Pārvākšanās",cleaner:"Uzkopšana",handyman:"Palīdzība mājās",worker:"Dažādi darbi",assistants:"Palīgs",housemaid:"Palīdzība mājās","yard-keeper":"Māja un teritorija",gardener:"Dārzs","social-worker":"Palīdzība cilvēkiem",nurse2:"Senioru aprūpe","computer-technician":"Datori un tehnika",furniturer:"Mēbeles",assembler:"Montāža",student:"Piestrāde",attendant:"Pavadīšana","sanitary-technician":"Santehnika",electrician:"Elektrība",builder:"Remonts",other:"Citi darbi"};

const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[char]);
const slug = value => String(value).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "latvija";
const groups = (items, field) => items.reduce((result, item) => { (result[field(item)] ||= []).push(item); return result; }, {});
const counts = (items, field) => Object.entries(groups(items, field)).map(([name, values]) => ({name, count: values.length})).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
const newest = items => {
  const dates = items.map(item => Date.parse(item.foundAt)).filter(Number.isFinite);
  return new Date(dates.length ? Math.max(...dates) : Date.parse(data.generatedAt || new Date().toISOString()));
};

for (const root of ["podrabotka","pomoshchniki","category","rabota","lv"])
  await rm(join("public", root), {recursive: true, force: true});

const tasks = leads.filter(item => item.type === "task");
const helpers = leads.filter(item => item.type === "helper");
const pages = [];
const add = (path, page) => pages.push({...page, path, url: `${BASE}/${path}/`});

add("podrabotka", {lang:"ru",alt:`${BASE}/lv/darbs/`,title:"Подработка и вакансии по всей Латвии",desc:"Актуальные задания, вакансии NVA, доставка, уборка, помощь по дому и другие предложения по всей Латвии.",items:tasks,scope:"country"});
add("pomoshchniki", {lang:"ru",alt:`${BASE}/lv/paligi/`,title:"Помощники и исполнители по всей Латвии",desc:"Актуальные публичные предложения помощи, подработки, доставки, уборки и ремонта по всей Латвии.",items:helpers,scope:"country"});
add("lv/darbs", {lang:"lv",alt:`${BASE}/podrabotka/`,title:"Darbs un piestrāde visā Latvijā",desc:"Aktuāli uzdevumi, NVA vakances, piegāde, uzkopšana un citi darba piedāvājumi visā Latvijā.",items:tasks,scope:"country"});
add("lv/paligi", {lang:"lv",alt:`${BASE}/pomoshchniki/`,title:"Palīgi un darbu veicēji visā Latvijā",desc:"Aktuāli publiski palīdzības, uzkopšanas, piegādes un remonta pakalpojumu piedāvājumi Latvijā.",items:helpers,scope:"country"});

for (const [city, items] of Object.entries(groups(leads, item => item.city || "Латвия"))) {
  if (city === "Латвия" || city === "Latvija") continue;
  const ct = items.filter(item => item.type === "task"), ch = items.filter(item => item.type === "helper");
  const cs = citySlug[city] || slug(city), lc = cityLv[city] || city;
  if (ct.length >= MIN_CITY) {
    add(`podrabotka/${cs}`, {lang:"ru",alt:`${BASE}/lv/darbs/${cs}/`,title:`Подработка в городе ${city}`,desc:`${ct.length} актуальных заданий и предложений работы в городе ${city}. Данные обновляются автоматически.`,items:ct,scope:"city"});
    add(`lv/darbs/${cs}`, {lang:"lv",alt:`${BASE}/podrabotka/${cs}/`,title:`Darbs un piestrāde ${lc}`,desc:`${ct.length} aktuāli uzdevumi un darba piedāvājumi ${lc}. Dati tiek atjaunināti automātiski.`,items:ct,scope:"city"});
  }
  if (ch.length >= MIN_CITY) {
    add(`pomoshchniki/${cs}`, {lang:"ru",alt:`${BASE}/lv/paligi/${cs}/`,title:`Помощники в городе ${city}`,desc:`${ch.length} актуальных предложений помощи и услуг в городе ${city}.`,items:ch,scope:"city"});
    add(`lv/paligi/${cs}`, {lang:"lv",alt:`${BASE}/pomoshchniki/${cs}/`,title:`Palīgi un darbu veicēji ${lc}`,desc:`${ch.length} aktuāli palīdzības un pakalpojumu piedāvājumi ${lc}.`,items:ch,scope:"city"});
  }
}

for (const [profession, items] of Object.entries(groups(leads, item => item.profession || "other"))) {
  if (items.length < MIN_CATEGORY) continue;
  const ps = slug(profession), ru = items[0].category, lv = lvCat[profession] || "Citi darbi";
  add(`category/${ps}`, {lang:"ru",alt:`${BASE}/lv/kategorija/${ps}/`,title:`${ru} — задания и помощники в Латвии`,desc:`${items.length} актуальных объявлений в категории «${ru}» по всей Латвии.`,items,scope:"category"});
  add(`lv/kategorija/${ps}`, {lang:"lv",alt:`${BASE}/category/${ps}/`,title:`${lv} — darbi un palīgi Latvijā`,desc:`${items.length} aktuāli publiski sludinājumi kategorijā “${lv}” visā Latvijā.`,items,scope:"category"});
}

for (const [city, cityItems] of Object.entries(groups(tasks, item => item.city || "Латвия"))) {
  if (!citySlug[city] || city === "Латвия" || city === "Latvija") continue;
  const cs = citySlug[city], lc = cityLv[city] || city;
  for (const [profession, items] of Object.entries(groups(cityItems, item => item.profession || "other"))) {
    if (items.length < MIN_CITY_CATEGORY || profession === "other") continue;
    const ps = slug(profession), ru = items[0].category, lv = lvCat[profession] || "Citi darbi", sourceCount = new Set(items.map(item => item.source)).size;
    add(`rabota/${cs}/${ps}`, {lang:"ru",alt:`${BASE}/lv/darbs/${cs}/${ps}/`,title:`${ru} в городе ${city} — ${items.length} предложений`,desc:`${items.length} актуальных предложений «${ru}» в городе ${city} из ${sourceCount} публичных источников.`,items,scope:"city-category"});
    add(`lv/darbs/${cs}/${ps}`, {lang:"lv",alt:`${BASE}/rabota/${cs}/${ps}/`,title:`${lv} ${lc} — ${items.length} piedāvājumi`,desc:`${items.length} aktuāli “${lv}” piedāvājumi ${lc} no ${sourceCount} publiskiem avotiem.`,items,scope:"city-category"});
  }
}

const pageUrls = new Set(pages.map(page => page.url));
function render(page) {
  const lv = page.lang === "lv", modified = newest(page.items);
  const sources = counts(page.items, item => item.source || (lv ? "Cits avots" : "Другой источник"));
  const cities = counts(page.items, item => item.city || (lv ? "Latvija" : "Латвия"));
  const categories = counts(page.items, item => lv ? (lvCat[item.profession] || "Citi darbi") : item.category);
  const top = (page.scope === "category" ? cities : categories).slice(0, 4).map(item => `${item.name} — ${item.count}`).join("; ");
  const sourceText = sources.slice(0, 3).map(item => `${item.name}: ${item.count}`).join(" · ");
  const related = cities.slice(0, 6).map(item => {
    const cs = citySlug[item.name] || slug(item.name), url = lv ? `${BASE}/lv/darbs/${cs}/` : `${BASE}/podrabotka/${cs}/`;
    return pageUrls.has(url) && url !== page.url ? `<a href="${esc(url.replace(BASE, ""))}">${esc(item.name)}</a>` : "";
  }).filter(Boolean).slice(0, 5).join("");
  const rows = page.items.slice(0, 60).map(item => `<article><span>${esc(lv ? (lvCat[item.profession] || "Citi darbi") : item.category)} · ${esc(item.city)}</span><h2>${esc(item.title)}</h2><a href="${esc(item.url)}" rel="nofollow noopener" target="_blank">${lv ? "Atvērt avotā" : "Открыть на"} ${esc(item.source)}</a></article>`).join("");
  const schema = {"@context":"https://schema.org","@type":"CollectionPage",inLanguage:page.lang,name:page.title,description:page.desc,url:page.url,dateModified:modified.toISOString(),mainEntity:{"@type":"ItemList",numberOfItems:page.items.length,itemListElement:page.items.slice(0,30).map((item,index)=>({"@type":"ListItem",position:index+1,url:item.url,name:item.title}))}};
  const nav = lv ? `<nav><a href="/lv/darbs/">Darbs</a><a href="/lv/paligi/">Palīgi</a><a href="/lv/darbs/riga/">Rīga</a><a href="/lv/darbs/daugavpils/">Daugavpils</a><a href="/lv/darbs/liepaja/">Liepāja</a></nav>` : `<nav><a href="/podrabotka/">Подработка</a><a href="/pomoshchniki/">Помощники</a><a href="/podrabotka/riga/">Рига</a><a href="/podrabotka/daugavpils/">Даугавпилс</a><a href="/podrabotka/liepaja/">Лиепая</a></nav>`;
  return `<!doctype html><html lang="${page.lang}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(page.title)}</title><meta name="description" content="${esc(page.desc)}"><meta name="robots" content="index,follow,max-image-preview:large"><link rel="canonical" href="${page.url}"><link rel="alternate" hreflang="${page.lang}" href="${page.url}"><link rel="alternate" hreflang="${lv ? "ru" : "lv"}" href="${page.alt}"><link rel="alternate" hreflang="x-default" href="${lv ? page.alt : page.url}"><meta property="og:title" content="${esc(page.title)}"><meta property="og:description" content="${esc(page.desc)}"><meta property="og:image" content="${BASE}/icon-512.png"><script type="application/ld+json">${JSON.stringify(schema).replace(/</g,"\\u003c")}</script><style>body{margin:0;background:#f3f6f3;color:#17231d;font:16px Arial,sans-serif}header,main,footer{max-width:1050px;margin:auto;padding:24px}header a,nav a,article a,.related a{color:#176b45;font-weight:900;text-decoration:none}nav,.related{display:flex;flex-wrap:wrap;gap:9px;margin:18px 0}nav a,.related a{background:white;border:1px solid #dfe6e1;border-radius:30px;padding:9px 12px}h1{font-size:clamp(2rem,6vw,4.4rem);line-height:1}.cta{display:inline-block;background:#176b45;color:white;padding:14px 18px;border-radius:13px;text-decoration:none;font-weight:900;margin:10px 0 24px}.facts{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:24px}.facts div{background:#e5efe8;border-radius:14px;padding:14px}.facts b,.facts span{display:block}.facts span{color:#65716a;font-size:.8rem;margin-top:4px}.insight{background:white;border:1px solid #dfe6e1;border-radius:16px;padding:18px;margin-bottom:18px;line-height:1.55}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px}article{background:white;border:1px solid #dfe6e1;border-radius:16px;padding:16px}article span{color:#176b45;font-size:.75rem;font-weight:800}article h2{font-size:1rem;line-height:1.4}footer,main>p{color:#68736d;line-height:1.55}@media(max-width:600px){.facts{grid-template-columns:1fr}}</style></head><body><header><a href="/">🔨 MURDILIMAX</a></header><main><h1>${esc(page.title)}</h1><p>${esc(page.desc)}</p>${nav}<section class="facts"><div><b>${page.items.length}</b><span>${lv ? "aktuāli piedāvājumi" : "актуальных предложений"}</span></div><div><b>${cities.length}</b><span>${lv ? "pilsētas un vietas" : "городов и мест"}</span></div><div><b>${sources.length}</b><span>${lv ? "publiski avoti" : "публичных источника"}</span></div></section><section class="insight"><b>${lv ? "Kas šobrīd ir pieprasīts" : "Что сейчас востребовано"}</b><p>${esc(top || page.desc)}</p><small>${lv ? "Avoti" : "Источники"}: ${esc(sourceText)}. ${lv ? "Pēdējais faktiskais papildinājums" : "Последнее фактическое пополнение"}: ${modified.toLocaleString(lv ? "lv-LV" : "ru-RU",{timeZone:"Europe/Riga"})}.</small></section>${related ? `<p><b>${lv ? "Saistītās pilsētas" : "Смотрите также по городам"}</b></p><div class="related">${related}</div>` : ""}<a class="cta" href="/?lang=${page.lang}">${lv ? "Atvērt MURDILIMAX" : "Открыть MURDILIMAX"}</a><div class="grid">${rows}</div></main><footer>${lv ? "Sarakstā ir tikai publiski piedāvājumi; kontakti paliek avota vietnē." : "В каталоге показаны только публичные предложения; контакты остаются на сайте источника."}</footer></body></html>`;
}

for (const page of pages) {
  const directory = join("public", page.path);
  await mkdir(directory, {recursive: true});
  await writeFile(join(directory, "index.html"), render(page), "utf8");
}
const homeDate = newest(leads).toISOString().slice(0, 10);
const sitemap = [`  <url><loc>${BASE}/</loc><lastmod>${homeDate}</lastmod><changefreq>daily</changefreq></url>`, ...pages.map(page => `  <url><loc>${page.url}</loc><lastmod>${newest(page.items).toISOString().slice(0,10)}</lastmod><changefreq>daily</changefreq></url>`)].join("\n");
await writeFile("public/sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemap}\n</urlset>\n`, "utf8");
console.log(`Generated ${pages.length} quality-filtered RU/LV pages from ${leads.length} listings`);
