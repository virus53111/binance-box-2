import{readFile}from"node:fs/promises";
const host="murdilimax.com",key="1436babd5412e15d775d48423d7d04ca",keyLocation=`https://${host}/${key}.txt`;
try{
 const sitemap=await readFile("public/sitemap.xml","utf8");
 const urlList=[...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match=>match[1]).filter(url=>url.startsWith(`https://${host}/`)).slice(0,10000);
 if(!urlList.length)throw new Error("Sitemap contains no MURDILIMAX URLs");
 const response=await fetch("https://api.indexnow.org/indexnow",{method:"POST",headers:{"content-type":"application/json; charset=utf-8"},body:JSON.stringify({host,key,keyLocation,urlList}),signal:AbortSignal.timeout(30000)});
 if(!response.ok&&!([200,202].includes(response.status)))throw new Error(`HTTP ${response.status}`);
 console.log(`IndexNow accepted ${urlList.length} URLs (HTTP ${response.status})`);
}catch(error){
 console.warn("IndexNow submission skipped:",error.message);
}
