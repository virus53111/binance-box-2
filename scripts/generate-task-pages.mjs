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
 const district=field(fields,"district"),city=field(fields,"city")||"Latvija";
 const date=field(fields,"date"),price=field(fields,"price")||"Цена договорная";
 const title=`${service} · MURDILIMAX`;
 const description=[category,[district,city].filter(Boolean).join(", "),date,`Бюджет: ${price}`].filter(Boolean).join(" · ");
 const taskUrl=`${BASE}/task/${encodeURIComponent(id)}/`;
 taskUrls.push(taskUrl);
 const html=`<!doctype html>
<html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title><meta name="description" content="${escapeHtml(description)}">
<meta property="og:type" content="article"><meta property="og:site_name" content="MURDILIMAX">
<meta property="og:title" content="${escapeHtml(title)}"><meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${taskUrl}"><meta property="og:image" content="${BASE}/icon-512.png">
<meta property="og:image:width" content="512"><meta property="og:image:height" content="512">
<meta name="twitter:card" content="summary"><link rel="canonical" href="${taskUrl}">
<meta http-equiv="refresh" content="0;url=/?task=${encodeURIComponent(id)}">
</head><body><p>Открываем задание в MURDILIMAX…</p><script>
const ref=new URLSearchParams(location.search).get("ref");
location.replace("/?task=${encodeURIComponent(id)}"+(ref?"&ref="+encodeURIComponent(ref):""));
</script></body></html>`;
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
