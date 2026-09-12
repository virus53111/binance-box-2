import json,pathlib,datetime as dt
root=pathlib.Path(__file__).parent
manual=json.loads((root/'offers.json').read_text())
auto=json.loads((root/'auto-offers.json').read_text()) if (root/'auto-offers.json').exists() else []
status=json.loads((root/'source-status.json').read_text()) if (root/'source-status.json').exists() else {'sources':{},'last_attempt':None}
managed={x['store'] for x in auto if x['kind'] in ('free','gift')}
D=auto+[x for x in manual if not(x['store'] in managed and x['kind'] in ('free','gift'))]
# A catalog URL can appear in the seed and a discovered source. Keep one of each kind.
D=list({(x['url'],x['title'],x['kind']):x for x in D}.values())
for row in D:
 state=status['sources'].get(row.get('source'),{})
 row['sourceState']=state.get('state','manual')
 row['checked']=row.get('last_success') or row.get('checked')
 row['badge']='Источник недоступен' if state.get('state')=='error' else row.get('badge','')
template=(root/'template.html').read_text()
(root/'dist').mkdir(exist_ok=True)
encode=lambda o:json.dumps(o,ensure_ascii=False).replace('</','<\\/')
(root/'dist'/'index.html').write_text(template.replace('__DATA__',encode(D)).replace('__STATUS__',encode(status)))
(root/'dist'/'source-status.json').write_text(json.dumps(status,ensure_ascii=False,indent=2))
print('Built',len(D),'entries')
