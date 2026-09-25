import {readFile,writeFile} from "node:fs/promises";

const base="https://www.ss.com";
const professions={
 courier:"Доставка",driver:"Перевозка",loader:"Переезд и погрузка",cleaner:"Уборка",handyman:"Помощь по дому",worker:"Разная помощь",assistants:"Помощник",housemaid:"Помощь по дому","yard-keeper":"Дом и территория",gardener:"Сад и территория","social-worker":"Помощь людям",nurse2:"Помощь пожилым","computer-technician":"Компьютеры и техника",furniturer:"Мебель",assembler:"Сборка",student:"Подработка",attendant:"Сопровождение","sanitary-technician":"Сантехника",electrician:"Электрика",builder:"Ремонт",other:"Другое"
};
const sections=[{path:"are-required",type:"task"},{path:"i-search-for-work",type:"helper"}];
const clean=s=>s.replace(/<script[\s\S]*?<\/script>/gi,"").replace(/<style[\s\S]*?<\/style>/gi,"").replace(/<[^>]+>/g," ").replace(/&nbsp;|&#160;/g," ").replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/\s+/g," ").trim();
const redactContacts=s=>s.replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g,"[контакт на источнике]").replace(/\+371[\s-]?(?:\d[\s-]?){8}\b/g,"[телефон на источнике]");
const cityFrom=text=>{
 const cities=["Рига","Даугавпилс","Лиепая","Елгава","Юрмала","Вентспилс","Резекне","Валмиера","Екабпилс","Огре","Тукумс","Цесис","Саласпилс","Latvija"];
 return cities.find(city=>text.toLowerCase().includes(city.toLowerCase()))||"Латвия";
};
const now=new Date(),nowIso=now.toISOString();
const state=JSON.parse(await readFile(".monitor/external-state.json","utf8"));
const current=JSON.parse(await readFile("public/external-leads.json","utf8"));
if(state.lastScan&&now-new Date(state.lastScan)<45*60*1000){console.log("Public opportunity scan skipped: refreshed less than 45 minutes ago");process.exit(0)}

const sources=sections.flatMap(section=>Object.keys(professions).map(slug=>({...section,slug,url:`${base}/ru/work/${section.path}/${slug}/`})));
const found=[];
async function scan(source){
 try{
  const response=await fetch(source.url,{signal:AbortSignal.timeout(15000),headers:{"user-agent":"MURDILIMAX public opportunity index/1.0 (+https://murdilimax.com)","accept-language":"ru,lv;q=0.9"}});
  if(!response.ok)throw new Error(`HTTP ${response.status}`);
  const html=await response.text();
  for(const match of html.matchAll(/<tr[^>]*\bid=["']tr_[^"']+["'][^>]*>([\s\S]*?)<\/tr>/gi)){
   const row=match[1],link=row.match(/href=["'](\/msg\/[^"']+\.html)["']/i);if(!link)continue;
   const url=new URL(link[1],base).href,title=redactContacts(clean(row));if(title.length<12)continue;
   found.push({id:Buffer.from(url).toString("base64url").slice(-32),type:source.type,category:professions[source.slug],profession:source.slug,title:title.slice(0,300),city:cityFrom(title),url,source:"SS.com",foundAt:nowIso});
  }
 }catch(error){console.error(`Public source ${source.path}/${source.slug}:`,error.message)}
}
for(let index=0;index<sources.length;index+=6)await Promise.all(sources.slice(index,index+6).map(scan));
const existingByUrl=new Map((current.leads||[]).map(item=>[item.url,item]));
const fresh=[...new Map(found.map(item=>[item.url,{...item,foundAt:existingByUrl.get(item.url)?.foundAt||item.foundAt}])).values()];
const combined=[...fresh,...(current.leads||[]).filter(item=>!fresh.some(next=>next.url===item.url))];
const merged=[...combined.filter(item=>item.type==="task").slice(0,300),...combined.filter(item=>item.type==="helper").slice(0,300)];
const seen=[...new Set([...fresh.map(item=>item.url),...(state.seen||[])])].slice(0,5000);
await writeFile("public/external-leads.json",JSON.stringify({generatedAt:nowIso,leads:merged},null,2)+"\n");
await writeFile(".monitor/external-state.json",JSON.stringify({lastScan:nowIso,seen},null,2)+"\n");
console.log(`Public opportunities checked ${sources.length} categories; active ${fresh.length}; stored ${merged.length}`);
