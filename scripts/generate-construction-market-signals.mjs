import { readFile, writeFile } from "node:fs/promises";

const input = JSON.parse(await readFile("public/ss-leads.json","utf8"));
const leads = Array.isArray(input.leads) ? input.leads : [];
const now = Date.now();

const map = {
  builder: "builder",
  plater: "tiler",
  "house-painter": "painter",
  electrician: "electrician",
  plumber: "plumber",
  roofer: "roofer",
  handyman: "builder",
  plasterer: "painter",
  bricklayer: "builder",
  carpenter: "carpenter",
};

const names = {
  builder: { ru:"ремонт и строительство", lv:"remonts un būvniecība" },
  tiler: { ru:"плиточные работы", lv:"flīzēšana" },
  painter: { ru:"малярные и отделочные работы", lv:"krāsošana un apdare" },
  electrician: { ru:"электрика", lv:"elektrodarbi" },
  plumber: { ru:"сантехника", lv:"santehnika" },
  roofer: { ru:"кровельные работы", lv:"jumta darbi" },
  carpenter: { ru:"плотницкие работы", lv:"galdniecība" },
};

const buckets = new Map();
for (const lead of leads) {
  const cluster = map[String(lead.category||"")];
  if (!cluster) continue;
  const found = Date.parse(lead.foundAt || "");
  if (!Number.isFinite(found)) continue;
  const age = now - found;
  const row = buckets.get(cluster) || {
    cluster,
    labelRu:names[cluster]?.ru || cluster,
    labelLv:names[cluster]?.lv || cluster,
    last24h:0,
    last7d:0,
    riga7d:0,
    total:0,
    latestAt:null
  };
  row.total += 1;
  if (age >= 0 && age <= 24*60*60*1000) row.last24h += 1;
  if (age >= 0 && age <= 7*24*60*60*1000) {
    row.last7d += 1;
    if (/\b(рига|riga|rīga)\b/i.test(String(lead.title||""))) row.riga7d += 1;
  }
  if (!row.latestAt || found > Date.parse(row.latestAt)) row.latestAt = new Date(found).toISOString();
  buckets.set(cluster,row);
}

const signals = [...buckets.values()].sort((a,b)=>b.last7d-a.last7d || b.last24h-a.last24h);
const output = {
  generatedAt:new Date().toISOString(),
  window:"rolling",
  source:"Murdilimax public construction listing monitor",
  sourceType:"aggregated public listing activity",
  signals
};

await writeFile("public/construction-market-signals.json",JSON.stringify(output,null,2)+"\n","utf8");
console.log("Construction market signals:",JSON.stringify(signals));
