import {readFile,writeFile} from "node:fs/promises";

const categories=["builder","plater","house-painter","electrician","plumber","roofer","handyman","plasterer","bricklayer","carpenter"];
const base="https://www.ss.com";
const clean=s=>s.replace(/<script[\s\S]*?<\/script>/gi,"").replace(/<style[\s\S]*?<\/style>/gi,"").replace(/<[^>]+>/g," ").replace(/&nbsp;|&#160;/g," ").replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/\s+/g," ").trim();
const now=new Date().toISOString();
const state=JSON.parse(await readFile(".monitor/ss-state.json","utf8"));
const current=JSON.parse(await readFile("public/ss-leads.json","utf8"));
const found=[];

for(const category of categories){
  const source=`${base}/ru/work/i-search-for-work/${category}/`;
  try{
    const response=await fetch(source,{headers:{"user-agent":"MURDILIMAX listing monitor/1.0 (+https://murdilimax.com)","accept-language":"ru,lv;q=0.9"}});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    const html=await response.text();
    for(const match of html.matchAll(/<tr[^>]*\bid=["']tr_[^"']+["'][^>]*>([\s\S]*?)<\/tr>/gi)){
      const row=match[1],link=row.match(/href=["'](\/msg\/[^"']+\.html)["']/i);
      if(!link)continue;
      const url=new URL(link[1],base).href;
      const text=clean(row);
      if(text.length<12)continue;
      found.push({id:Buffer.from(url).toString("base64url").slice(-32),category,title:text.slice(0,280),url,foundAt:now});
    }
  }catch(error){console.error(`SS category ${category}:`,error.message)}
}

const unique=[...new Map(found.map(item=>[item.url,item])).values()];
const previous=new Set(state.seen||[]);
const additions=state.initialized?unique.filter(item=>!previous.has(item.url)):[];
const leads=[...additions,...(current.leads||[])].slice(0,250);
const seen=[...new Set([...unique.map(item=>item.url),...(state.seen||[])])].slice(0,3000);
await writeFile("public/ss-leads.json",JSON.stringify({generatedAt:now,leads},null,2)+"\n");
await writeFile(".monitor/ss-state.json",JSON.stringify({initialized:true,seen},null,2)+"\n");
console.log(`Checked ${unique.length}; new ${additions.length}; stored ${leads.length}`);
