import asyncio
import base64
import hashlib
import json
import os
import re
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any

from cryptography.fernet import Fernet
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from redis.asyncio import Redis
from telethon import TelegramClient
from telethon.errors import SessionPasswordNeededError
from telethon.sessions import StringSession

CHANNEL = 'Crypto_pravda1'
API_ID = int(os.environ['TG_API_ID'])
API_HASH = os.environ['TG_API_HASH']
REDIS_URL = os.environ.get('REDIS_URL', 'redis://red-daj76lmk1f9s73chi24g:6379')
redis = Redis.from_url(REDIS_URL, decode_responses=True)
fernet = Fernet(base64.urlsafe_b64encode(hashlib.sha256(f'signallab:{API_HASH}'.encode()).digest()))

class PhoneInput(BaseModel):
    phone: str

class CodeInput(BaseModel):
    code: str
    password: str = ''

def encrypted(value: str) -> str:
    return fernet.encrypt(value.encode()).decode()

def decrypted(value: str) -> str:
    return fernet.decrypt(value.encode()).decode()

async def state() -> dict[str, Any]:
    raw = await redis.get('telegram:state')
    return json.loads(raw) if raw else {'status': 'disconnected'}

async def save_state(value: dict[str, Any]) -> None:
    await redis.set('telegram:state', json.dumps(value, ensure_ascii=False))

def nums(text: str) -> list[float]:
    return [float(x.replace(',', '.')) for x in re.findall(r'\d+(?:[.,]\d+)?', text)]

def parse_signal(message_id: int, text: str, published: datetime) -> dict[str, Any] | None:
    upper = text.upper().replace('\r', '')
    found = re.search(r'(?:#|\$)?([A-Z0-9]{2,15})(?:\s*/\s*USDT|USDT)?\s+(LONG|SHORT)\b', upper)
    reverse = False
    if not found:
        found = re.search(r'\b(LONG|SHORT)\s+(?:#|\$)?([A-Z0-9]{2,15})\b', upper)
        reverse = True
    if not found:
        return None
    asset = found.group(2 if reverse else 1)
    side = found.group(1 if reverse else 2)
    symbol = asset if asset.endswith('USDT') else f'{asset}USDT'
    leverage = re.search(r'(\d{1,3})(?:\s*[-–—]\s*(\d{1,3}))?\s*[XХ]', upper)
    entry: list[float] = []
    targets: list[float] = []
    stop = None
    in_targets = False
    for line in [line.strip() for line in upper.splitlines() if line.strip()]:
        if re.search(r'ТЕЙК|TARGET|ЦЕЛ', line):
            in_targets = True
        if re.search(r'СТОП|STOP|\bSL\b', line):
            line_nums = nums(line)
            stop = line_nums[0] if line_nums else None
            in_targets = False
            continue
        if re.search(r'ВХОД|ENTRY', line):
            entry = nums(line)[:2]
            in_targets = False
            continue
        if in_targets:
            targets.extend(nums(line))
    return {
        'id': str(message_id),
        'symbol': symbol,
        'side': side,
        'leverageMin': int(leverage.group(1)) if leverage else None,
        'leverageMax': int(leverage.group(2) or leverage.group(1)) if leverage else None,
        'entry': entry,
        'targets': targets[:8],
        'stop': stop,
        'publishedAt': int(published.timestamp() * 1000),
        'url': f'https://t.me/{CHANNEL}/{message_id}',
        'source': f'@{CHANNEL}',
        'raw': text[:4000],
    }

async def sync_signals(session_text: str) -> int:
    client = TelegramClient(StringSession(session_text), API_ID, API_HASH, connection_retries=2, timeout=12)
    await client.connect()
    try:
        if not await client.is_user_authorized():
            raise RuntimeError('Telegram session expired')
        messages = await client.get_messages(CHANNEL, limit=120)
        existing_raw = await redis.get('telegram:signals')
        existing = json.loads(existing_raw) if existing_raw else []
        by_id = {str(item['id']): item for item in existing}
        added = 0
        for message in messages:
            if not message.message:
                continue
            parsed = parse_signal(message.id, message.message, message.date or datetime.now(timezone.utc))
            if parsed and parsed['id'] not in by_id:
                by_id[parsed['id']] = parsed
                added += 1
        ordered = sorted(by_id.values(), key=lambda item: int(item['id']), reverse=True)[:200]
        await redis.set('telegram:signals', json.dumps(ordered, ensure_ascii=False))
        return added
    finally:
        await client.disconnect()

async def background_sync() -> None:
    while True:
        try:
            current = await state()
            if current.get('status') == 'connected' and current.get('session'):
                await sync_signals(decrypted(current['session']))
                current['lastSync'] = int(datetime.now(timezone.utc).timestamp() * 1000)
                current['lastError'] = None
                await save_state(current)
        except Exception as exc:
            current = await state()
            current['lastError'] = f'{type(exc).__name__}: {exc}'[:300]
            await save_state(current)
        await asyncio.sleep(300)

@asynccontextmanager
async def lifespan(_: FastAPI):
    task = asyncio.create_task(background_sync())
    yield
    task.cancel()
    await redis.aclose()

app = FastAPI(title='SignalLab Telegram', lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=['https://virus53111.github.io'],
    allow_methods=['GET', 'POST', 'OPTIONS'],
    allow_headers=['Content-Type'],
)

@app.get('/health')
async def health():
    await redis.ping()
    return {'ok': True}

@app.get('/api/status')
async def status():
    current = await state()
    return {
        'connected': current.get('status') == 'connected',
        'awaitingCode': current.get('status') == 'code_sent',
        'codeViaApp': current.get('codeViaApp', True),
        'channel': f'@{CHANNEL}',
        'lastSync': current.get('lastSync'),
        'lastError': current.get('lastError'),
    }

@app.get('/api/signals')
async def signals():
    raw = await redis.get('telegram:signals')
    return {'source': f'@{CHANNEL}', 'signals': json.loads(raw) if raw else []}

@app.post('/api/telegram/reset')
async def reset():
    current = await state()
    if current.get('status') == 'connected':
        raise HTTPException(409, 'Telegram уже подключён')
    await save_state({'status': 'disconnected'})
    return {'ok': True}

@app.post('/api/telegram/start')
async def start_login(payload: PhoneInput):
    current = await state()
    if current.get('status') == 'connected':
        return {'ok': True, 'connected': True}
    phone = re.sub(r'[\s()\-]', '', payload.phone)
    if not re.fullmatch(r'\+\d{8,15}', phone):
        raise HTTPException(400, 'Введите номер с кодом страны, например +371...')
    client = TelegramClient(StringSession(), API_ID, API_HASH, connection_retries=2, timeout=12)
    try:
        await client.connect()
        sent = await client.send_code_request(phone)
        await save_state({
            'status': 'code_sent',
            'phone': phone,
            'phoneCodeHash': sent.phone_code_hash,
            'partialSession': encrypted(client.session.save()),
            'codeViaApp': sent.is_app_hash,
            'updatedAt': int(datetime.now(timezone.utc).timestamp() * 1000),
        })
        return {'ok': True, 'codeViaApp': sent.is_app_hash}
    except Exception as exc:
        message = f'{type(exc).__name__}: {exc}'
        await save_state({'status': 'disconnected', 'lastError': message[:300]})
        raise HTTPException(400, message[:300]) from exc
    finally:
        await client.disconnect()

@app.post('/api/telegram/verify')
async def verify(payload: CodeInput):
    current = await state()
    if current.get('status') != 'code_sent':
        raise HTTPException(409, 'Сначала запросите код')
    code = re.sub(r'\D', '', payload.code)
    if not re.fullmatch(r'\d{5,6}', code):
        raise HTTPException(400, 'Введите код из Telegram')
    client = TelegramClient(
        StringSession(decrypted(current['partialSession'])),
        API_ID,
        API_HASH,
        connection_retries=2,
        timeout=12,
    )
    try:
        await client.connect()
        try:
            await client.sign_in(
                phone=current['phone'],
                code=code,
                phone_code_hash=current['phoneCodeHash'],
            )
        except SessionPasswordNeededError:
            if not payload.password:
                return {'ok': False, 'needsPassword': True}
            await client.sign_in(password=payload.password)
        saved = client.session.save()
        added = await sync_signals(saved)
        await save_state({
            'status': 'connected',
            'session': encrypted(saved),
            'lastSync': int(datetime.now(timezone.utc).timestamp() * 1000),
            'lastError': None,
        })
        return {'ok': True, 'connected': True, 'added': added}
    except Exception as exc:
        raise HTTPException(400, f'{type(exc).__name__}: {exc}'[:300]) from exc
    finally:
        await client.disconnect()

@app.post('/api/sync')
async def manual_sync():
    current = await state()
    if current.get('status') != 'connected':
        raise HTTPException(409, 'Telegram не подключён')
    added = await sync_signals(decrypted(current['session']))
    current['lastSync'] = int(datetime.now(timezone.utc).timestamp() * 1000)
    current['lastError'] = None
    await save_state(current)
    return {'ok': True, 'added': added}

@app.get('/', response_class=HTMLResponse)
async def home():
    return '''<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SignalLab Telegram</title><style>
:root{font-family:system-ui;color:#eef2ff;background:#060912;color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 80% 0,#25184d,transparent 38%),#060912;min-height:100vh}.shell{max-width:680px;margin:auto;padding:24px 16px}.card{background:#101625;border:1px solid #29324a;border-radius:22px;padding:22px;margin:18px 0}h1{font-size:38px;margin:18px 0}.green{color:#75ead1}.badge{float:right;color:#9ca8bd}.online{color:#6be5b4}label{display:block;color:#aab4c8;margin:14px 0 7px}input,button{width:100%;height:54px;border-radius:14px;font-size:17px}input{background:#0a0f1d;color:#fff;border:1px solid #34405d;padding:0 15px}button{border:0;background:linear-gradient(120deg,#7869ff,#4bd8c8);font-weight:800;color:#07101d;margin-top:13px}.secondary{background:#222c44;color:#dfe6f5}.error{padding:13px;border-radius:12px;background:#3b1d2a;color:#ff9bb7}.muted{color:#8c97ab;line-height:1.55}.signal{border-top:1px solid #273149;padding:14px 0}.long{color:#63e8bd}.short{color:#ff86a2}</style></head><body><main class="shell"><span id="status" class="badge">Проверка…</span><p class="green">ИСТОЧНИК СИГНАЛОВ</p><h1>@Crypto_pravda1</h1><p class="muted">Подключение один раз. Затем сервер автоматически загружает сигналы каждые 5 минут.</p><section class="card" id="login"><h2>Подключить Telegram</h2><div id="phoneStep"><label>Номер Telegram</label><input id="phone" type="tel" placeholder="+371..."><button onclick="sendCode()">Получить код</button></div><div id="codeStep" hidden><label>Код из Telegram</label><input id="code" inputmode="numeric"><label id="passwordLabel" hidden>Пароль 2FA</label><input id="password" type="password" hidden><button onclick="verify()">Подключить</button><button class="secondary" onclick="resetLogin()">Ввести номер заново</button></div><p id="hint" class="muted"></p><p id="error" class="error" hidden></p></section><section class="card"><h2 id="count">Последние сигналы</h2><div id="signals"><p class="muted">Сигналов пока нет.</p></div></section><p class="muted">Не открывайте реальные сделки, пока каждый уровень не проверен вручную.</p></main><script>
const el=id=>document.getElementById(id);const fail=e=>{const d=e&&e.detail?e.detail:(e&&e.message?e.message:String(e));el('error').textContent=d;el('error').hidden=false};async function call(path,options){const r=await fetch(path,{headers:{'Content-Type':'application/json'},...options});const d=await r.json();if(!r.ok)throw d;return d}async function load(){try{const s=await call('/api/status');el('status').textContent=s.connected?'● Подключено':s.awaitingCode?'Ожидается код':'Не подключено';el('status').className=s.connected?'badge online':'badge';el('login').hidden=s.connected;el('phoneStep').hidden=s.awaitingCode;el('codeStep').hidden=!s.awaitingCode;if(s.lastError)fail(s.lastError);const d=await call('/api/signals');el('count').textContent=d.signals.length?'Последние сигналы: '+d.signals.length:'Сигналов пока нет';el('signals').innerHTML=d.signals.slice(0,30).map(x=>'<div class="signal"><b>'+x.symbol+'</b> <span class="'+x.side.toLowerCase()+'">'+x.side+'</span><div class="muted">Entry: '+(x.entry.length?x.entry.join(' – '):'Market')+' · TP: '+(x.targets.join(' · ')||'—')+' · SL: '+(x.stop||'—')+'</div></div>').join('')||'<p class="muted">После подключения здесь появятся реальные сигналы.</p>'}catch(e){fail(e)}}async function sendCode(){try{el('error').hidden=true;const d=await call('/api/telegram/start',{method:'POST',body:JSON.stringify({phone:el('phone').value})});el('hint').textContent=d.codeViaApp?'Код отправлен в официальный чат Telegram.':'Код отправлен по SMS.';await load()}catch(e){fail(e)}}async function verify(){try{el('error').hidden=true;const d=await call('/api/telegram/verify',{method:'POST',body:JSON.stringify({code:el('code').value,password:el('password').value})});if(d.needsPassword){el('passwordLabel').hidden=false;el('password').hidden=false;fail('Введите пароль двухэтапной защиты.')}else await load()}catch(e){fail(e)}}async function resetLogin(){await call('/api/telegram/reset',{method:'POST',body:'{}'});await load()}load();setInterval(load,30000);
</script></body></html>'''
