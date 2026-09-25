import {mkdir,readFile,rm,writeFile} from "node:fs/promises";
import {join} from "node:path";

const PROJECT="murdilimax";
const API_KEY="AIzaSyBWh4IBzJE5xtfSbJmSXRsS92gaTjcRpg8";
const BASE="https://murdilimax.com";
const endpoint=`https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/orders?pageSize=300&key=${API_KEY}`;
const escapeHtml=value=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[char]);
const field=(fields,key)=>{
 const value=fields?.[key]||{};
 return value.stringValue??value.integerValue??value.doubleValue??"";
};

const response=await fetch(endpoint,{headers:{Accept:"application/json"}});
if(!response.ok)throw new Error(`Firestore task export failed: ${response.status}`);
const payload=await response.json();
const root=join(process.cwd(),"public","task");
await rm(root,{recursive:true,force:true});
await mkdir(root,{recursive:true});

const taskUrls=[];
for(const document of payload.documents||[]){
 const id=document.name.split("/").pop(),fields=document.fields||{};
 const service=field(fields,"service")||"Задание рядом";
 const category=field(fields,"category")||"Помощь рядом";
 const details=field(fields,"description")||"Заказчик ищет исполнителя для выполнения этого задания.";
 const district=field(fields,"district"),city=field(fields,"city")||"Latvija";
 const date=field(fields,"date"),price=field(fields,"price")||"Цена договорная";
 const title=`${service} · MURDILIMAX`;
 const description=[details,category,[district,city].filter(Boolean).join(", "),date,`Бюджет: ${price}`].filter(Boolean).join(" · ").slice(0,300);
 const taskUrl=`${BASE}/task/${encodeURIComponent(id)}/`;
 taskUrls.push(taskUrl);
 const schema={"@context":"https://schema.org","@type":"WebPage",name:title,description,url:taskUrl,mainEntity:{"@type":"Service",name:service,description:details,areaServed:[district,city].filter(Boolean).join(", "),offers:{"@type":"Offer",price:String(price).replace(/[^0-9.,]/g,"")||undefined,priceCurrency:"EUR"}}};
 const html=`<!doctype html>
<html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title><meta name="description" content="${escapeHtml(description)}">
<meta name="robots" content="index,follow,max-image-preview:large">
<meta property="og:type" content="article"><meta property="og:site_name" content="MURDILIMAX">
<meta property="og:title" content="${escapeHtml(title)}"><meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${taskUrl}"><meta property="og:image" content="${BASE}/icon-512.png">
<meta property="og:image:width" content="512"><meta property="og:image:height" content="512">
<meta name="twitter:card" content="summary"><link rel="canonical" href="${taskUrl}">
<script type="application/ld+json">${JSON.stringify(schema).replace(/</g,"\\u003c")}</script>
<style>body{margin:0;background:#f3f6f3;color:#17231d;font:17px Arial,sans-serif}header,main,footer{max-width:820px;margin:auto;padding:24px}header a{color:#176b45;font-size:1.25rem;font-weight:900;text-decoration:none}.card{background:#fff;border:1px solid #dde5df;border-radius:22px;padding:clamp(20px,5vw,42px);box-shadow:0 12px 40px #153c2612}h1{font-size:clamp(2rem,7vw,4rem);line-height:1.05;margin:10px 0 22px}.meta{display:flex;flex-wrap:wrap;gap:9px}.meta span{background:#edf5f0;border-radius:999px;padding:9px 13px;font-weight:800}.description{font-size:1.15rem;line-height:1.65;white-space:pre-wrap}.cta{display:inline-block;background:#176b45;color:#fff;border-radius:14px;padding:15px 20px;font-weight:900;text-decoration:none;margin-top:20px}footer{color:#6d7771;font-size:.9rem}</style>
</head><body><header><a href="/">🔨 MURDILIMAX</a></header><main><article class="card"><div class="meta"><span>${escapeHtml(category)}</span><span>📍 ${escapeHtml([district,city].filter(Boolean).join(", "))}</span><span>💶 ${escapeHtml(price)}</span>${date?`<span>📅 ${escapeHtml(date)}</span>`:""}</div><h1>${escapeHtml(service)}</h1><p class="description">${escapeHtml(details)}</p><a class="cta" href="/?task=${encodeURIComponent(id)}">Откликнуться в MURDILIMAX</a></article></main><footer>Объявление опубликовано пользователем MURDILIMAX. Никому не переводите предоплату до проверки исполнителя.</footer></body></html>`;
 const directory=join(root,id);
 await mkdir(directory,{recursive:true});
 await writeFile(join(directory,"index.html"),html,"utf8");
}

try{
 const sitemapPath=join(process.cwd(),"public","sitemap.xml"),sitemap=await readFile(sitemapPath,"utf8");
 const today=new Date().toISOString().slice(0,10),entries=taskUrls.map(url=>`  <url><loc>${url}</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq></url>`).join("\n");
 await writeFile(sitemapPath,sitemap.replace("</urlset>",`${entries}\n</urlset>`),"utf8");
}catch(error){console.warn("Task URLs were not added to sitemap:",error.message)}

console.log(`Generated ${(payload.documents||[]).length} Facebook task pages`);
