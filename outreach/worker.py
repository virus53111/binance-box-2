"""Private, at-most-once invitation worker. Python standard library only."""
import hashlib
import hmac
import html
import json
import os
import re
import smtplib
import sqlite3
import ssl
import threading
import time
import urllib.parse
import urllib.request
from email.message import EmailMessage
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

CATEGORIES = {'builder','plater','house-painter','electrician','plumber','sanitary-technician','roofer','handyman','plasterer','bricklayer','carpenter'}

def normalize_email(value):
    value = str(value).strip().casefold()
    if len(value) > 254 or not re.fullmatch(r'[a-z0-9.!#$%&\'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}', value):
        raise ValueError('Invalid email')
    return value

def open_db(path):
    db = sqlite3.connect(path, timeout=30, isolation_level=None)
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA journal_mode=WAL')
    db.execute('''CREATE TABLE IF NOT EXISTS contacts (
        email TEXT PRIMARY KEY, role TEXT NOT NULL, lang TEXT NOT NULL,
        source_url TEXT NOT NULL, permission_ref TEXT NOT NULL,
        state TEXT NOT NULL DEFAULT 'queued', attempted_at REAL,
        suppressed INTEGER NOT NULL DEFAULT 0)''')
    return db

def ingest(db, records):
    added = 0
    for r in records:
        # Only trusted, permitted feeds may assert permission; public email != permission.
        if not isinstance(r, dict):
            continue
        permission = r.get('permission') or {}
        if not isinstance(permission, dict) or permission.get('channel') != 'email' or permission.get('purpose') != 'murdilimax-invitation' or permission.get('verified') is not True or not permission.get('reference'):
            continue
        if r.get('country') != 'LV' or r.get('role') not in ('task', 'helper') or r.get('profession') not in CATEGORIES or r.get('private_person') is not True or r.get('small_job') is not True:
            continue
        try:
            email = normalize_email(r.get('email', ''))
        except ValueError:
            continue
        url = str(r.get('source_url', ''))
        if urllib.parse.urlsplit(url).scheme != 'https':
            continue
        cur = db.execute('INSERT OR IGNORE INTO contacts(email,role,lang,source_url,permission_ref) VALUES(?,?,?,?,?)', (email, r['role'], 'lv' if r.get('lang') == 'lv' else 'ru', url[:2000], str(permission['reference'])[:2000]))
        added += cur.rowcount
    return added

def claim(db, limit):
    # Commit BEFORE network I/O. A crash or uncertain SMTP result must not resend.
    db.execute('BEGIN IMMEDIATE')
    try:
        count = db.execute('SELECT count(*) FROM contacts WHERE attempted_at>=?', (time.time()-86400,)).fetchone()[0]
        row = db.execute("SELECT * FROM contacts WHERE state='queued' AND suppressed=0 ORDER BY rowid LIMIT 1").fetchone() if count < limit else None
        if row:
            db.execute("UPDATE contacts SET state='attempted',attempted_at=? WHERE email=?", (time.time(), row['email']))
        db.execute('COMMIT')
        return row
    except Exception:
        db.execute('ROLLBACK')
        raise

def unsubscribe_token(email, key):
    return hmac.new(key.encode(), email.encode(), hashlib.sha256).hexdigest()

def make_message(row, sender, public_url, key):
    email = row['email']
    query = urllib.parse.urlencode({'email':email,'token':unsubscribe_token(email,key)})
    unsubscribe = public_url.rstrip('/')+'/unsubscribe?'+query
    lv, helper = row['lang']=='lv', row['role']=='helper'
    if lv:
        subject = 'MURDILIMAX — vieta jūsu nelielajiem remonta darbiem'
        heading = 'Piedāvājiet savus meistara pakalpojumus' if helper else 'Pastāstiet, kāds meistars jums vajadzīgs'
        body = 'MURDILIMAX apvieno cilvēkus Latvijā, kuri meklē palīdzību, un darbu izpildītājus. Aicinām izveidot profilu un norādīt savus pakalpojumus.' if helper else 'MURDILIMAX varat publicēt savu remonta uzdevumu, norādīt pilsētu un aprakstīt vajadzīgo darbu, lai meistari varētu atsaukties.'
        cta, footer = 'Atvērt MURDILIMAX', 'Vienreizējs uzaicinājums. Atteikties no saziņas'
    else:
        subject = 'MURDILIMAX — приглашение для мастеров' if helper else 'MURDILIMAX — разместите свой заказ на ремонт'
        heading = 'Покажите, какую работу вы выполняете' if helper else 'Расскажите, какой мастер вам нужен'
        body = 'Приглашаем вас на MURDILIMAX — площадку заказчиков и исполнителей в Латвии. Создайте профиль и укажите свои услуги, чтобы люди могли найти вас.' if helper else 'На Murdilimax можно разместить задачу по ремонту: указать город и описать работу, чтобы мастера могли откликнуться.'
        cta, footer = 'Открыть MURDILIMAX', 'Однократное приглашение. Отказаться от контактов'
    link = 'https://murdilimax.com/?utm_source=invitation&utm_medium=email&utm_campaign='+('helper' if helper else 'customer')
    msg = EmailMessage()
    msg['From'], msg['To'], msg['Subject'] = sender, email, subject
    msg['Message-ID'] = '<'+hashlib.sha256(email.encode()).hexdigest()+'@murdilimax.com>'
    msg['List-Unsubscribe'] = '<'+unsubscribe+'>'
    msg['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click'
    msg.set_content(f'{heading}\n\n{body}\n\n{cta}: {link}\n\n{footer}: {unsubscribe}')
    msg.add_alternative(f'''<!doctype html><html><body style="margin:0;background:#f2f5f3;font-family:Arial,sans-serif;color:#18352a"><table role="presentation" width="100%"><tr><td align="center" style="padding:32px 12px"><table role="presentation" width="100%" style="max-width:560px;background:#fff;border-radius:20px"><tr><td style="padding:36px"><p style="font-weight:900;letter-spacing:2px;color:#176b45">MURDILIMAX</p><h1 style="font-size:28px;line-height:1.2">{html.escape(heading)}</h1><p style="font-size:17px;line-height:1.7">{html.escape(body)}</p><p style="padding:18px 0"><a href="{html.escape(link,quote=True)}" style="background:#176b45;color:white;text-decoration:none;padding:16px 22px;border-radius:12px;display:inline-block">{cta}</a></p><p style="font-size:12px;color:#6a746e"><a href="{html.escape(unsubscribe,quote=True)}">{footer}</a></p></td></tr></table></td></tr></table></body></html>''', subtype='html')
    return msg

def smtp_send(message):
    # Implicit TLS only. Credentials come from the server environment, never source code.
    with smtplib.SMTP_SSL(os.environ['SMTP_HOST'], int(os.environ.get('SMTP_PORT','465')), timeout=20, context=ssl.create_default_context()) as client:
        client.login(os.environ['SMTP_USER'], os.environ['SMTP_PASSWORD'])
        refused = client.send_message(message)
        if refused:
            raise RuntimeError('Recipient refused')

def dispatch(db, send, sender, public_url, key, limit=20):
    sent = 0
    while (row := claim(db, limit)) is not None:
        if db.execute('SELECT suppressed FROM contacts WHERE email=?',(row['email'],)).fetchone()[0]:
            continue
        try:
            send(make_message(row, sender, public_url, key))
        except Exception:
            # Deliberately no automatic retry: SMTP may have accepted the email.
            db.execute("UPDATE contacts SET state='delivery_unknown' WHERE email=?", (row['email'],))
            continue
        db.execute("UPDATE contacts SET state='accepted' WHERE email=?", (row['email'],))
        sent += 1
    return sent

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        raise ValueError('Feed redirect requires an explicitly configured URL')

def collect(db, feeds):
    opener = urllib.request.build_opener(NoRedirect)
    for url in feeds:
        if urllib.parse.urlsplit(url).scheme != 'https':
            raise ValueError('Feeds must use HTTPS')
        try:
            req = urllib.request.Request(url, headers={'User-Agent':'Murdilimax invitation worker/1.0','Accept':'application/json'})
            with opener.open(req, timeout=20) as response:
                raw = response.read(2_000_001)
            if len(raw)>2_000_000:
                raise ValueError('Oversized feed')
            records = json.loads(raw)
            if not isinstance(records, list):
                raise ValueError('Expected an array')
            ingest(db, records[:5000])
        except Exception:
            print('One configured feed failed; no contact data logged.', flush=True)

def run():
    path = os.environ.get('OUTREACH_DB', '')
    key = os.environ.get('OUTREACH_SIGNING_KEY','')
    public_url = os.environ.get('OUTREACH_PUBLIC_URL','')
    if not os.path.isabs(path) or len(key)<32 or urllib.parse.urlsplit(public_url).scheme!='https':
        raise SystemExit('Configure an absolute persistent OUTREACH_DB path, 32+ character OUTREACH_SIGNING_KEY and HTTPS OUTREACH_PUBLIC_URL.')
    os.umask(0o077)
    if not os.path.isfile(path):
        raise SystemExit('Persistent ledger missing. Initialize it explicitly before first deployment; never recreate a lost ledger automatically.')
    db = open_db(path)
    db.close()
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass  # Do not log unsubscribe URLs containing recipient addresses.
        def handle_request(self, confirm):
            parsed = urllib.parse.urlsplit(self.path)
            if parsed.path=='/health':
                self.send_response(200); self.end_headers(); self.wfile.write(b'ok'); return
            args = urllib.parse.parse_qs(parsed.query)
            email, token = args.get('email',[''])[0], args.get('token',[''])[0]
            if parsed.path!='/unsubscribe' or not email or not hmac.compare_digest(token,unsubscribe_token(email,key)):
                self.send_error(404); return
            if confirm:
                connection = open_db(path)
                try:
                    connection.execute('UPDATE contacts SET suppressed=1 WHERE email=?',(email,))
                finally:
                    connection.close()
                body = 'Отписка сохранена. / Atteikšanās saglabāta.'
            else:
                body = '<form method="post"><button>Отписаться / Atteikties</button></form>'
            self.send_response(200)
            self.send_header('Content-Type','text/html; charset=utf-8')
            self.send_header('Cache-Control','no-store')
            self.send_header('Referrer-Policy','no-referrer')
            self.end_headers(); self.wfile.write(body.encode())
        def do_GET(self): self.handle_request(False)
        def do_POST(self): self.handle_request(True)
    enabled = os.environ.get('OUTREACH_ENABLED')=='true'
    feeds = json.loads(os.environ.get('OUTREACH_FEEDS_JSON','[]'))
    if not isinstance(feeds,list) or any(not isinstance(url,str) for url in feeds):
        raise SystemExit('OUTREACH_FEEDS_JSON must be a URL array')
    if enabled and (not feeds or any(not os.environ.get(k) for k in ('SMTP_HOST','SMTP_USER','SMTP_PASSWORD','SMTP_FROM'))):
        raise SystemExit('Sending requires configured approved feeds and SMTP credentials.')
    def loop():
        connection = open_db(path)
        while True:
            try:
                collect(connection,feeds)
                if enabled:
                    dispatch(connection,smtp_send,os.environ['SMTP_FROM'],public_url,key,max(1,min(100,int(os.environ.get('OUTREACH_DAILY_LIMIT','20')))))
            except Exception:
                print('Worker cycle failed; previously attempted recipients remain blocked.', flush=True)
            time.sleep(900)
    threading.Thread(target=loop,daemon=True).start()
    ThreadingHTTPServer(('0.0.0.0',int(os.environ.get('PORT','8080'))),Handler).serve_forever()

if __name__=='__main__':
    run()
