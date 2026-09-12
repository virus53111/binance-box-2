import unittest,sys,pathlib,json,tempfile
from unittest.mock import patch
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]))
import refresh as r
class Collectors(unittest.TestCase):
 def test_gift_requires_purchase_and_date(self):
  p=r.Page('<p>Iegādājoties SUN MATTERS produktus 50 EUR vērtībā</p><p>DĀVANĀ saņem krēmu 10 ml.</p><p>*Akcija spēkā līdz 30 .09.2026.</p><p>Vairāk</p>')
  x=r.parse_douglas(p);self.assertEqual(len(x),1);self.assertEqual(x[0]['kind'],'gift');self.assertEqual(x[0]['end'],'2026-09-30');self.assertIn('50 EUR',x[0]['description'])
  self.assertEqual(r.parse_douglas(r.Page('<p>Iegādājoties krēmu DĀVANĀ saņem somu</p>')),[])
 def test_free_excludes_symbolic_payments_and_reservations(self):
  html=''.join(f'<div><b>{status}</b><a href="/sludinajumi/mebeles/{i}/item">{name}</a><p>Rīga</p><p>{body}</p></div>' for i,status,name,body in [(1,'Atdod','Chair','Pašizvešana.'),(2,'Atdod','Cabinet','Pret šokolādi.'),(3,'Pārdod','Table','5 EUR'),(4,'Atdod','Desk','Par simbolisko maksu.'),(5,'Rezervēts','Lamp','Atdod')])
  rows=r.parse_atdot(r.Page(html));self.assertEqual([x['title'] for x in rows],['Chair']);self.assertEqual(rows[0]['price'],0)
 def test_catalog_rejects_external_links(self):
  p=r.Page('<a href="https://evil.example/">Rimi akcijas</a><a href="/akcijas-un-bukleti">Rimi akcijas</a>')
  x=r.parse_catalog(p,'rimi');self.assertEqual(len(x),1);self.assertEqual(x[0]['kind'],'catalog')
 def test_failure_preserves_success_timestamp_and_cache(self):
  with tempfile.TemporaryDirectory() as td:
   root=pathlib.Path(td);row=dict(id='old',source='douglas',checked='2026-09-10T00:00:00+00:00')
   (root/'auto-offers.json').write_text(json.dumps([row]));(root/'source-status.json').write_text(json.dumps({'sources':{'douglas':{'last_success':row['checked']}}}))
   with patch.object(r,'ROOT',root),patch.object(r,'SOURCES',{'douglas':r.SOURCES['douglas']}),patch.object(r,'fetch',side_effect=ValueError('HTTP 403')):r.refresh()
   result=json.loads((root/'source-status.json').read_text());self.assertEqual(result['sources']['douglas']['last_success'],row['checked']);self.assertEqual(json.loads((root/'auto-offers.json').read_text()),[row])
 def test_empty_parse_is_failure(self):
  with patch.object(r,'fetch',return_value=r.Page('<p>maintenance</p>')):
   key,rows,st=r.collect_one('douglas',r.SOURCES['douglas'],'2026-09-12T00:00:00+00:00');self.assertIsNone(rows);self.assertEqual(st['state'],'error')
if __name__=='__main__':unittest.main()
