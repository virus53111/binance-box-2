"""Public source collectors. No credentials, browser bypasses or invented prices."""
import concurrent.futures,datetime as dt,hashlib,json,pathlib,re,urllib.request,urllib.parse
from html.parser import HTMLParser
ROOT=pathlib.Path(__file__).parent
UTC=dt.timezone.utc
class Page(HTMLParser):
 def __init__(self,html):
  super().__init__();self.lines=[];self.links=[];self.skip=0;self.anchor=None;self.feed(html)
 def handle_starttag(self,t,a):
  a=dict(a)
  if t in ('script','style'):self.skip+=1
  if t=='a' and not self.skip:self.anchor=[a.get('href',''),'']
 def handle_endtag(self,t):
  if t in ('script','style'):self.skip=max(0,self.skip-1)
  if t=='a' and self.anchor:self.links.append(tuple(self.anchor));self.anchor=None
 def handle_data(self,s):
  if self.skip:return
  s=re.sub(r'\s+',' ',s).strip()
  if s:self.lines.append(s)
  if self.anchor:self.anchor[1]+=s+' '
 @property
 def text(self):return '\n'.join(self.lines)
def fetch(url):
 req=urllib.request.Request(url,headers={'User-Agent':'HalyavaLV/1.0 (+public-offer-index; refresh every 3 hours)'})
 with urllib.request.urlopen(req,timeout=18) as r:
  if urllib.parse.urlparse(r.url).hostname!=urllib.parse.urlparse(url).hostname:raise ValueError('Unexpected redirect host')
  b=r.read(4_000_001)
  if len(b)>4_000_000:raise ValueError('Page too large')
  html=b.decode('utf-8','replace')
  if re.search(r'<title>\s*(Just a moment|Access Denied)',html,re.I):raise ValueError('Source access restriction')
  return Page(html)
def record(source,key,title,category,kind,description,url,end=None,place='Латвия',price=None):
 return dict(id='auto-'+source+'-'+hashlib.sha256(key.encode()).hexdigest()[:16],source=source,title=title,store=SOURCES[source]['store'],category=category,kind=kind,description=description,url=url,end=end,place=place,price=price,old=None,badge={'free':'Уточнить наличие','gift':'За покупку','catalog':'Каталог источника'}[kind],image=None)
def parse_douglas(p):
 result=[]
 for part in p.text.split('Vairāk'):
  if 'Iegādājoties' not in part:continue
  body=part[part.index('Iegādājoties'):]
  date=re.search(r'Akcija spēkā līdz\s*(\d{1,2})\s*\.\s*(\d{1,2})\s*\.\s*(\d{4})',body)
  gift=re.search(r'DĀVANĀ\s+saņem\s+(.+?)(?:Dāvanas vērtība|\*)',body,re.S)
  if not date or not gift:continue
  end=dt.date(int(date[3]),int(date[2]),int(date[1])).isoformat()
  title=re.sub(r'\s+',' ',gift[1]).strip(' .')[:110]
  condition=re.sub(r'\s+',' ',body[:gift.start()]).strip()[:230]
  # Preserve the original purchase conditions; never translate them into a free offer.
  desc='Подарок за покупку. Условие магазина (LV): '+condition+'. Пока есть подарки.'
  if 'TIKAI E-VEIKALĀ' in part:desc+=' Только онлайн.'
  result.append(record('douglas',title+condition,title,'Красота','gift',desc,SOURCES['douglas']['url'],end))
 return result[:40]
def parse_atdot(p):
 result=[];links={re.sub(r'\s+',' ',label).strip():urllib.parse.urljoin(SOURCES['atdot']['url'],url) for url,label in p.links if re.search(r'/sludinajumi/[^/]+/\d+/',url)}
 lines=p.lines
 for i,line in enumerate(lines):
  if line!='Atdod' or i+2>=len(lines):continue
  if any('rezerv' in x.lower() for x in lines[max(0,i-2):i]):continue
  title=lines[i+1];url=links.get(title)
  if not url or urllib.parse.urlparse(url).hostname!='www.atdot.lv':continue
  stop=next((j for j in range(i+2,len(lines)) if lines[j] in ('Atdod','Pārdod','Pērk','Rezervēts')),min(i+8,len(lines)))
  body=' '.join(lines[i+2:stop])
  # Reject symbolic payments, swaps, fees and reservations. Unknowns are omitted.
  if re.search(r'€|\beur\b|maks[au]|simbol|pret\b|šokol|kolu|rezerv|прод|оплат|обмен|шокол|символ|за\s*\d',body,re.I):continue
  result.append(record('atdot',url,title[:110],'Вещи','free','Автор отметил «отдам». Перед поездкой уточните наличие и условия самовывоза; доставка не включена.',url,place=lines[i+2][:100],price=0))
 return result[:20]
def parse_catalog(p,source):
 cfg=SOURCES[source];links=[]
 for href,label in p.links:
  label=re.sub(r'\s+',' ',label).strip()
  if len(label)<8 or not re.search(cfg['match'],label,re.I):continue
  url=urllib.parse.urljoin(cfg['url'],href)
  if urllib.parse.urlparse(url).scheme!='https' or urllib.parse.urlparse(url).hostname not in cfg['hosts']:continue
  if label not in [r['title'] for r in links]:links.append(record(source,url,label[:110],cfg['category'],'catalog','Актуальный раздел магазина. Цены и условия — по ссылке; это не подтверждение отдельной скидки.',url))
 return links[:8]
SOURCES={
 'douglas':dict(store='Douglas',url='https://www.douglas.lv/lv/davana-par-pirkumu/',parser=parse_douglas),
 'atdot':dict(store='Atdot.lv',url='https://www.atdot.lv/sludinajumi/',parser=parse_atdot),
 'rimi':dict(store='Rimi',url='https://www.rimi.lv/akcijas-un-bukleti',category='Продукты',hosts=['www.rimi.lv','rimi.lv'],match=r'buklet|akcij'),
 'kursi':dict(store='Kurši',url='https://www.kursi.lv/lv/visas-kampanas/avize/',category='Стройка',hosts=['www.kursi.lv','kursi.lv'],match=r'avīz|buklet|akcij|kamp'),
 'rd':dict(store='RD Electronics',url='https://www.rdveikals.lv/site/catalog/lv/626/page/1/Akcijas.html',category='Техника',hosts=['www.rdveikals.lv'],match=r'akcij|outlet|izpārdo|piedāvāj')}
def atomic(path,value):
 tmp=path.with_suffix('.tmp');tmp.write_text(json.dumps(value,ensure_ascii=False,indent=2));tmp.replace(path)
def collect_one(key,cfg,now):
 try:
  p=fetch(cfg['url']);rows=cfg['parser'](p) if 'parser' in cfg else parse_catalog(p,key)
  if not rows:raise ValueError('No recognized offers; parser or source needs review')
  rows=[r for r in rows if not r['end'] or r['end']>=now[:10]]
  if not rows:raise ValueError('Only expired entries found')
  for r in rows:r.update(checked=now,last_success=now)
  return key,rows,dict(store=cfg['store'],state='ok',last_attempt=now,last_success=now,count=len(rows),url=cfg['url'],detail='Получены подарки' if key=='douglas' else 'Получены объявления' if key=='atdot' else 'Получены ссылки на каталоги')
 except Exception as e:return key,None,dict(store=cfg['store'],state='error',last_attempt=now,url=cfg['url'],error=str(e)[:160],detail='Не удалось обновить')
def refresh():
 now=dt.datetime.now(UTC).isoformat(timespec='seconds');prev=json.loads((ROOT/'auto-offers.json').read_text()) if (ROOT/'auto-offers.json').exists() else []
 oldstatus=json.loads((ROOT/'source-status.json').read_text()).get('sources',{}) if (ROOT/'source-status.json').exists() else {}
 rows=[];status={}
 with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
  for key,new,st in pool.map(lambda item:collect_one(*item,now),SOURCES.items()):
   if new is None:
    new=[x for x in prev if x.get('source')==key];st['last_success']=oldstatus.get(key,{}).get('last_success');st['count']=len(new)
   rows.extend(new);status[key]=st
 unique={r['id']:r for r in rows}
 atomic(ROOT/'auto-offers.json',list(unique.values()));atomic(ROOT/'source-status.json',dict(last_attempt=now,sources=status))
 for key,s in status.items():print(key,s['state'],s['count'],s.get('error',''))
if __name__=='__main__':refresh()
