import os
import tempfile
import threading
import unittest
from worker import open_db, ingest, claim, dispatch, make_message, unsubscribe_token

class WorkerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path = os.path.join(self.temp.name,'queue.sqlite3')
        self.db = open_db(self.path)
        self.row = dict(email='Test@example.com', country='LV', role='helper',profession='plumber',private_person=True,small_job=True,lang='ru',source_url='https://example.com/1',permission=dict(channel='email',purpose='murdilimax-invitation',verified=True,reference='consent-1'))
    def tearDown(self):
        self.db.close()
        self.temp.cleanup()
    def test_same_email_across_sources_roles_and_restarts(self):
        self.assertEqual(ingest(self.db,[self.row]),1)
        other = dict(self.row,email=' test@EXAMPLE.COM ',role='task',source_url='https://example.org/2')
        self.assertEqual(ingest(self.db,[other]),0)
        claim(self.db,20)
        other_db = open_db(self.path)
        self.assertIsNone(claim(other_db,20))
        other_db.close()
    def test_no_permission_no_queue(self):
        self.assertEqual(ingest(self.db,[dict(self.row,permission={}),dict(self.row,country='EE'),dict(self.row,private_person=False),dict(self.row,small_job=False),dict(self.row,email='bad\r\nBcc:x@y.com')]),0)
    def test_concurrent_workers(self):
        ingest(self.db,[self.row])
        barrier=threading.Barrier(2); results=[]
        def run():
            db=open_db(self.path); barrier.wait(); results.append(claim(db,20)); db.close()
        threads=[threading.Thread(target=run) for _ in range(2)]
        for t in threads: t.start()
        for t in threads: t.join()
        self.assertEqual(sum(r is not None for r in results),1)
    def test_uncertain_delivery_not_retried(self):
        ingest(self.db,[self.row]); calls=[]
        def lost_response(message):
            calls.append(message)
            raise TimeoutError('possibly accepted')
        dispatch(self.db,lost_response,'sender@example.com','https://example.com','x'*32)
        dispatch(self.db,lost_response,'sender@example.com','https://example.com','x'*32)
        self.assertEqual(len(calls),1)
        self.assertEqual(self.db.execute('SELECT state FROM contacts').fetchone()[0],'delivery_unknown')
    def test_suppression_and_limit(self):
        ingest(self.db,[self.row,dict(self.row,email='two@example.com'),dict(self.row,email='three@example.com')])
        self.db.execute('UPDATE contacts SET suppressed=1 WHERE email=?',('test@example.com',))
        calls=[]
        self.assertEqual(dispatch(self.db,calls.append,'sender@example.com','https://example.com','x'*32,1),1)
        self.assertEqual(dispatch(self.db,calls.append,'sender@example.com','https://example.com','x'*32,1),0)
        self.assertEqual(calls[0]['To'],'two@example.com')
    def test_templates_and_tokens(self):
        for lang in ('ru','lv'):
            for role in ('task','helper'):
                msg=make_message(dict(self.row,lang=lang,role=role),'sender@example.com','https://example.com','x'*32)
                self.assertIn('https://murdilimax.com',msg.get_body(preferencelist=('plain',)).get_content())
                self.assertIn('/unsubscribe?',msg['List-Unsubscribe'])
                self.assertTrue(msg.get_body(preferencelist=('html',)))
        self.assertNotEqual(unsubscribe_token('a@example.com','x'*32),unsubscribe_token('b@example.com','x'*32))
if __name__=='__main__': unittest.main()
