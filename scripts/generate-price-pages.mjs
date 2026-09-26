import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const BASE = "https://murdilimax.com";
const REVIEWED = "26.09.2026";
const groups = [
  ["🎨", "Малярные работы", "Krāsošanas darbi", [
    ["Удаление старого покрытия", "Vecā pārklājuma noņemšana", "м²", "m²", 3.5, 6],
    ["Грунтование", "Gruntēšana", "м²", "m²", 2, 4],
    ["Шпаклевание стен", "Sienu špaktelēšana", "м²", "m²", 10, 18],
    ["Шлифование", "Slīpēšana", "м²", "m²", 3.5, 5],
    ["Покраска стен в два слоя", "Sienu krāsošana divās kārtās", "м²", "m²", 6, 10],
    ["Покраска потолка в два слоя", "Griestu krāsošana divās kārtās", "м²", "m²", 7, 12],
    ["Подготовка и покраска под ключ", "Pilna sagatavošana un krāsošana", "м²", "m²", 15, 26],
    ["Поклейка обоев", "Tapešu līmēšana", "м²", "m²", 6, 11],
  ]],
  ["⬜", "Плиточные работы", "Flīzēšanas darbi", [
    ["Демонтаж старой плитки", "Veco flīžu demontāža", "м²", "m²", 8, 12],
    ["Укладка плитки на стены", "Sienu flīzēšana", "м²", "m²", 25, 45],
    ["Укладка плитки на пол", "Grīdas flīzēšana", "м²", "m²", 28, 45],
    ["Крупноформатная плитка или мозаика", "Lielformāta flīzes vai mozaīka", "м²", "m²", 35, 55],
    ["Гидроизоляция", "Hidroizolācija", "м²", "m²", 5, 10],
    ["Плинтус из плитки", "Flīžu grīdlīste", "м", "m", 10, 14],
  ]],
  ["🪵", "Ламинат и пол", "Lamināts un grīda", [
    ["Укладка подложки", "Apakšklāja ieklāšana", "м²", "m²", 1.5, 2.5],
    ["Укладка ламината", "Lamināta ieklāšana", "м²", "m²", 7, 12],
    ["Ламинат в маленьком помещении", "Lamināts mazā telpā", "м²", "m²", 10, 15],
    ["Пластиковый плинтус", "Plastmasas grīdlīstes montāža", "м", "m", 5, 8],
    ["Деревянный плинтус", "Koka grīdlīstes montāža", "м", "m", 7, 11],
    ["Установка порога", "Sliekšņa uzstādīšana", "шт.", "gab.", 10, 18],
  ]],
  ["⚡", "Электрика", "Elektrodarbi", [
    ["Прокладка кабеля", "Kabeļa montāža", "м", "m", 2, 4],
    ["Штробление и прокладка кабеля", "Gropes izveide un kabeļa montāža", "м", "m", 5, 9],
    ["Новая розетка или выключатель", "Jauna rozete vai slēdzis", "шт.", "gab.", 15, 30],
    ["Замена розетки или выключателя", "Rozetes vai slēdža nomaiņa", "шт.", "gab.", 10, 15],
    ["Светильник или люстра", "Gaismekļa vai lustras uzstādīšana", "шт.", "gab.", 18, 40],
    ["Точечный светильник", "Iebūvētā gaismekļa uzstādīšana", "шт.", "gab.", 12, 20],
    ["Сборка квартирного электрощита", "Dzīvokļa elektrosadales montāža", "компл.", "kompl.", 250, 400],
  ]],
  ["🚪", "Установка дверей", "Durvju uzstādīšana", [
    ["Межкомнатная дверь", "Iekšdurvju uzstādīšana", "шт.", "gab.", 90, 120],
    ["Демонтаж старой двери", "Veco durvju demontāža", "шт.", "gab.", 15, 30],
    ["Входная дверь", "Ārdurvju uzstādīšana", "шт.", "gab.", 100, 180],
    ["Установка наличников", "Durvju aplodu montāža", "м", "m", 5, 7],
    ["Регулировка или мелкий ремонт", "Durvju regulēšana vai neliels remonts", "шт.", "gab.", 25, 60],
  ]],
];
const sources = [
  ["ABC.lv", "https://abc.lv/raksts/ieksejo-apdares-darbu-izmaksas"],
  ["Nordgroup", "https://nordgroup.lv/buvdarbu-izmaksas/"],
  ["Brigada.lv", "https://brigada.lv/buvdarbu-izmaksas/"],
  ["Kilowats", "https://kilowats.lv/cenas"],
  ["BAU Fonds", "https://baufonds.lv/lv/buvnieciba/remontdarbu-cenas.html"],
];
const esc = value => String(value).replace(/[&<>"']/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[char]);

function render(lang) {
  const lv = lang === "lv";
  const title = lv ? "Būvdarbu cenas Latvijā 2026" : "Расценки на строительные работы в Латвии 2026";
  const description = lv
    ? "Orientējošas privāto meistaru darba cenas Latvijā: krāsošana, flīzēšana, lamināts, elektrodarbi un durvis."
    : "Ориентировочные расценки частных мастеров в Латвии: малярные и плиточные работы, ламинат, электрика и двери.";
  const canonical = lv ? `${BASE}/lv/buvdarbu-cenas/` : `${BASE}/stroitelnye-rascenki/`;
  const alternate = lv ? `${BASE}/stroitelnye-rascenki/` : `${BASE}/lv/buvdarbu-cenas/`;
  const options = groups.flatMap((group, groupIndex) => group[3].map((item, itemIndex) =>
    `<option value="${groupIndex}:${itemIndex}">${esc(lv ? item[1] : item[0])} — €${item[4]}–${item[5]}/${lv ? item[3] : item[2]}</option>`
  )).join("");
  const sections = groups.map((group, groupIndex) => `<section class="price-group">
    <h2>${group[0]} ${esc(lv ? group[2] : group[1])}</h2><div class="table-wrap"><table>
    <thead><tr><th>${lv ? "Darbs" : "Работа"}</th><th>${lv ? "Vienība" : "Единица"}</th><th>${lv ? "Cena" : "Цена работы"}</th></tr></thead>
    <tbody>${group[3].map((item, itemIndex) => `<tr><td>${esc(lv ? item[1] : item[0])}</td><td>${esc(lv ? item[3] : item[2])}</td><td><b>€${item[4]}–${item[5]}</b><button class="calc-add" data-key="${groupIndex}:${itemIndex}">${lv ? "Aprēķināt" : "Рассчитать"}</button></td></tr>`).join("")}</tbody>
    </table></div></section>`).join("");
  const calculatorData = JSON.stringify(groups.map(group => group[3].map(item => ({
    unit: lv ? item[3] : item[2], min: item[4], max: item[5],
  })))).replace(/</g, "\\u003c");
  const sourceLinks = sources.map(([name, url]) => `<a href="${url}" rel="nofollow noopener" target="_blank">${name}</a>`).join(" · ");
  const schema = { "@context": "https://schema.org", "@type": "WebPage", name: title, description, url: canonical, dateModified: "2026-09-26", inLanguage: lang };
  const resultPrefix = lv ? "Aptuveni" : "Примерно";
  return `<!doctype html><html lang="${lang}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><meta name="description" content="${description}"><meta name="robots" content="index,follow,max-image-preview:large"><link rel="canonical" href="${canonical}"><link rel="alternate" hreflang="${lang}" href="${canonical}"><link rel="alternate" hreflang="${lv ? "ru" : "lv"}" href="${alternate}"><link rel="alternate" hreflang="x-default" href="${BASE}/stroitelnye-rascenki/"><meta property="og:title" content="${title}"><meta property="og:description" content="${description}"><meta property="og:image" content="${BASE}/icon-512.png"><script type="application/ld+json">${JSON.stringify(schema)}</script><style>:root{--green:#176b45;--lime:#d9ff5c;--ink:#17231d;--muted:#68736d;--line:#dfe6e1}*{box-sizing:border-box}body{margin:0;background:#f4f7f4;color:var(--ink);font:16px Arial,sans-serif}header,main,footer{max-width:1080px;margin:auto;padding:22px}header{display:flex;align-items:center;justify-content:space-between}header a{color:var(--green);font-weight:900;text-decoration:none}.lang{background:white;border:1px solid var(--line);padding:9px 13px;border-radius:12px}.hero{background:linear-gradient(135deg,#13251c,#1f6d4b);color:white;padding:clamp(24px,6vw,58px);border-radius:26px}.hero h1{font-size:clamp(2rem,6vw,4rem);line-height:1;margin:14px 0}.hero p{line-height:1.55}.badge{display:inline-block;background:var(--lime);color:#16251d;padding:8px 12px;border-radius:99px;font-weight:900}.calculator,.price-group,.note{background:white;border:1px solid var(--line);border-radius:18px;padding:20px;margin:16px 0}.calculator-grid{display:grid;grid-template-columns:2fr 1fr auto;gap:10px}.calculator select,.calculator input,.calculator button{width:100%;min-height:48px;border:1px solid var(--line);border-radius:12px;padding:10px}.calculator button,.calc-add{background:var(--green);color:white;border:0;font-weight:900}.result{font-size:1.35rem;font-weight:900;color:var(--green);margin-top:14px}.table-wrap{overflow:auto}table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:13px 10px;border-bottom:1px solid var(--line)}th{color:var(--muted);font-size:.8rem}.calc-add{float:right;padding:7px 10px;border-radius:9px}.note{line-height:1.55}.sources a{color:var(--green);font-weight:800}footer{color:var(--muted)}@media(max-width:650px){.calculator-grid{grid-template-columns:1fr}.calc-add{display:none}th,td{padding:12px 7px}.price-group{padding:14px}}</style></head><body><header><a href="/">🔨 MURDILIMAX</a><a class="lang" href="${alternate}">${lv ? "RU" : "LV"}</a></header><main><section class="hero"><span class="badge">${lv ? "Pārbaudīts" : "Проверено"}: ${REVIEWED}</span><h1>${title}</h1><p>${description} ${lv ? "Norādīta tikai meistara darba cena. Materiāli tiek rēķināti atsevišķi." : "Указана только стоимость работы мастера. Материалы считаются отдельно."}</p></section><section class="calculator"><h2>${lv ? "Ātrs izmaksu aprēķins" : "Быстрый расчёт стоимости"}</h2><div class="calculator-grid"><select id="work">${options}</select><input id="amount" type="number" min="0" step="0.1" value="10"><button id="calculate">${lv ? "Aprēķināt" : "Рассчитать"}</button></div><div class="result" id="result"></div></section>${sections}<section class="note"><h2>${lv ? "Kā izmantot cenas" : "Как пользоваться расценками"}</h2><p>${lv ? "Šie ir tirgus orientieri privātu meistaru darbam Latvijā. Galīgā cena ir atkarīga no apjoma, virsmu stāvokļa, sarežģītības un pilsētas." : "Это рыночные ориентиры для работы частных мастеров в Латвии. Итоговая цена зависит от объёма, состояния поверхности, сложности и города."}</p><p class="sources"><b>${lv ? "Datu salīdzināšanai izmantoti" : "Для сверки использованы"}:</b> ${sourceLinks}</p></section></main><footer>© 2026 MURDILIMAX · ${lv ? "Cenas pārskatām reizi ceturksnī" : "Расценки проверяются раз в квартал"}</footer><script>const data=${calculatorData},work=document.getElementById("work"),amount=document.getElementById("amount"),result=document.getElementById("result");function calc(){const parts=work.value.split(":"),x=data[Number(parts[0])][Number(parts[1])],n=Math.max(0,Number(amount.value)||0);result.textContent=n?"${resultPrefix}: €"+(x.min*n).toFixed(0)+"–"+(x.max*n).toFixed(0)+" ("+n+" "+x.unit+")":""}document.getElementById("calculate").onclick=calc;document.querySelectorAll(".calc-add").forEach(button=>button.onclick=()=>{work.value=button.dataset.key;document.querySelector(".calculator").scrollIntoView({behavior:"smooth"});calc()});calc();</script></body></html>`;
}

for (const [path, lang] of [["stroitelnye-rascenki", "ru"], ["lv/buvdarbu-cenas", "lv"]]) {
  const directory = join("public", path);
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "index.html"), render(lang), "utf8");
}
const sitemapPath = "public/sitemap.xml";
let sitemap = await readFile(sitemapPath, "utf8");
const additions = [`${BASE}/stroitelnye-rascenki/`, `${BASE}/lv/buvdarbu-cenas/`]
  .filter(url => !sitemap.includes(`<loc>${url}</loc>`))
  .map(url => `  <url><loc>${url}</loc><lastmod>2026-09-26</lastmod><changefreq>monthly</changefreq></url>`)
  .join("\n");
if (additions) sitemap = sitemap.replace("</urlset>", `${additions}\n</urlset>`);
await writeFile(sitemapPath, sitemap, "utf8");
console.log("Generated RU/LV construction price pages");
