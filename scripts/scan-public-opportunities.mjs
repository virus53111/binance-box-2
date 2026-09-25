import {readFile,writeFile} from "node:fs/promises";

const base="https://www.ss.com";
const nvaApi="https://data.gov.lv/dati/api/3/action/datastore_search?resource_id=7f68f6fc-a0f9-4c31-b43c-770e97a06fda&limit=2000";
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
if(state.version===2&&state.lastScan&&now-new Date(state.lastScan)<45*60*1000){console.log("Public opportunity scan skipped: refreshed less than 45 minutes ago");process.exit(0)}

const sources=sections.flatMap(section=>Object.keys(professions).map(slug=>({...section,slug,url:`${base}/ru/work/${section.path}/${slug}/`})));
const found=[];
const categoryFrom=text=>{
 const value=String(text||"").toLowerCase();
 const rules=[["electrician",/elektr/],["sanitary-technician",/santeh|cauruļ/],["builder",/būv|celtn|remont|krāsot|apmet/],["driver",/vadītāj|šofer/],["courier",/kurjer|piegād/],["loader",/krāv|noliktav/],["cleaner",/tīrīt|uzkop|apkop/],["gardener",/dārz|ainav/],["computer-technician",/dator|it\b|programm/],["nurse2",/aprūp|medic|mās/],["social-worker",/sociāl/],["furniturer",/mēbeļ|galdnie/],["assembler",/montēt|montāž/],["attendant",/pavad/]];
 const key=rules.find(([,pattern])=>pattern.test(value))?.[0]||"other";
 return {profession:key,category:professions[key]};
};
const nvaCityFrom=place=>{
 const cities=[["Рига",/rīg/i],["Даугавпилс",/daugavpil/i],["Лиепая",/liepāj/i],["Елгава",/jelgav/i],["Юрмала",/jūrmal/i],["Вентспилс",/ventspil/i],["Резекне",/rēzekn/i],["Валмиера",/valmier/i],["Екабпилс",/jēkabpil/i],["Огре",/ogre|ogres/i],["Тукумс",/tukum/i],["Цесис",/cēs/i],["Саласпилс",/salaspil/i]];
 return cities.find(([,pattern])=>pattern.test(place||""))?.[0]||String(place||"Латвия").slice(0,80);
};
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
try{
 const response=await fetch(nvaApi,{signal:AbortSignal.timeout(25000),headers:{"user-agent":"MURDILIMAX opportunity index/2.0 (+https://murdilimax.com)"}});
 if(!response.ok)throw new Error(`HTTP ${response.status}`);
 const payload=await response.json();
 for(const record of payload.result?.records||[]){
  const title=String(record.Vakances_nosaukums||"").trim(),url=String(record.Vakances_paplasinats_apraksts||"").trim();
  if(!title||!url.startsWith("https://cvvp.nva.gov.lv/"))continue;
  const {profession,category}=categoryFrom(`${title} ${record.Vakances_kategorija||""}`);
  const salary=record.Alga_no?` · €${record.Alga_no}${record.Alga_lidz&&record.Alga_lidz!==record.Alga_no?`–${record.Alga_lidz}`:""}`:"";
  found.push({id:`nva-${record.Vakances_Nr||record._id}`,type:"task",category,profession,title:`${title}${salary}`.slice(0,300),city:nvaCityFrom(record.Vieta),url,source:"NVA · CVVP",foundAt:record.Aktualizacijas_datums||nowIso,deadline:record.Pieteiksanas_termins||null,license:"CC0 1.0"});
 }
}catch(error){console.error("NVA open data:",error.message)}
const existingByUrl=new Map((current.leads||[]).map(item=>[item.url,item]));
const fresh=[...new Map(found.map(item=>[item.url,{...item,foundAt:existingByUrl.get(item.url)?.foundAt||item.foundAt}])).values()];
const combined=[...fresh,...(current.leads||[]).filter(item=>!fresh.some(next=>next.url===item.url))];
const live=combined.filter(item=>!item.deadline||new Date(item.deadline)>=new Date(now.toISOString().slice(0,10)));
const ssTasks=live.filter(item=>item.type==="task"&&item.source==="SS.com").slice(0,250);
const nvaTasks=live.filter(item=>item.type==="task"&&item.source.startsWith("NVA")).sort((a,b)=>new Date(b.foundAt)-new Date(a.foundAt)).slice(0,350);
const otherTasks=live.filter(item=>item.type==="task"&&item.source!=="SS.com"&&!item.source.startsWith("NVA")).slice(0,50);
const merged=[...ssTasks,...nvaTasks,...otherTasks,...live.filter(item=>item.type==="helper").slice(0,300)];
const seen=[...new Set([...fresh.map(item=>item.url),...(state.seen||[])])].slice(0,5000);
await writeFile("public/external-leads.json",JSON.stringify({generatedAt:nowIso,leads:merged},null,2)+"\n");
await writeFile(".monitor/external-state.json",JSON.stringify({version:2,lastScan:nowIso,seen},null,2)+"\n");
console.log(`Public opportunities: SS categories ${sources.length}; NVA ${nvaTasks.length}; stored ${merged.length}`);
