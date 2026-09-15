import asyncio
import base64
import hashlib
import html
import io
import json
import os
import re
import urllib.request
import qrcode
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any

from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from pywebpush import WebPushException, webpush
from redis.asyncio import Redis
from telethon import TelegramClient, functions
from telethon.errors import SessionPasswordNeededError
from telethon.sessions import StringSession

CHANNELS = ['Crypto_pravda1', 'signalyp', 'binancekillers']
API_ID = int(os.environ['TG_API_ID'])
API_HASH = os.environ['TG_API_HASH']
REDIS_URL = os.environ.get('REDIS_URL', 'redis://red-daj76lmk1f9s73chi24g:6379')
redis = Redis.from_url(REDIS_URL, decode_responses=True)
fernet = Fernet(base64.urlsafe_b64encode(hashlib.sha256(f'signallab:{API_HASH}'.encode()).digest()))
qr_client: TelegramClient | None = None
qr_task: asyncio.Task | None = None

class PhoneInput(BaseModel):
    phone: str

class CodeInput(BaseModel):
    code: str
    password: str = ''

class PasswordInput(BaseModel):
    password: str

class PushInput(BaseModel):
    subscription: dict[str, Any]

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

def parse_signal(channel: str, message_id: int, text: str, published: datetime) -> dict[str, Any] | None:
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
    leverage_after = re.search(r'[XХ]\s*(\d{1,3})', upper) if not leverage else None
    entry: list[float] = []
    targets: list[float] = []
    stop = None
    in_targets = False
    for line in [line.strip() for line in upper.splitlines() if line.strip()]:
        if re.search(r'ТЕЙК|TARGET|ЦЕЛ', line):
            in_targets = True
        if re.search(r'[СC]ТОП|STOP|\bSL\b', line):
            line_nums = nums(line)
            stop = line_nums[0] if line_nums else None
            in_targets = False
            continue
        if re.search(r'^(?:[^A-ZА-Я0-9]*)(?:ДИАПАЗОН\s+ВХОДА|ВХОД|ENTRY)\s*:', line):
            entry = [] if re.search(r'РЫН|MARKET', line) else nums(line)[:2]
            in_targets = False
            continue
        if in_targets:
            targets.extend(nums(line))
    if channel.lower() == 'binancekillers' and (not targets or stop is None):
        return None
    return {
        'id': str(message_id),
        'symbol': symbol,
        'side': side,
        'leverageMin': int(leverage.group(1)) if leverage else (int(leverage_after.group(1)) if leverage_after else None),
        'leverageMax': int(leverage.group(2) or leverage.group(1)) if leverage else (int(leverage_after.group(1)) if leverage_after else None),
        'entry': entry,
        'targets': targets[:8],
        'stop': stop,
        'publishedAt': int(published.timestamp() * 1000),
        'url': f'https://t.me/{channel}/{message_id}',
        'source': f'@{channel}',
        'raw': text[:4000],
    }

async def sync_signals(session_text: str) -> int:
    client = TelegramClient(StringSession(session_text), API_ID, API_HASH, connection_retries=2, timeout=12)
    await client.connect()
    try:
        if not await client.is_user_authorized():
            raise RuntimeError('Telegram session expired')
        existing_raw = await redis.get('telegram:signals')
        existing = json.loads(existing_raw) if existing_raw else []
        existing = [item for item in existing if item.get('source') != '@binancekillers' or (item.get('targets') and item.get('stop') is not None)]
        by_id = {f"{item.get('source')}:{item['id']}": item for item in existing}
        added = 0
        for channel in CHANNELS:
            messages = await client.get_messages(channel, limit=120)
            for message in messages:
                if not message.message:
                    continue
                parsed = parse_signal(channel, message.id, message.message, message.date or datetime.now(timezone.utc))
                key = f"{parsed['source']}:{parsed['id']}" if parsed else ''
                if parsed:
                    if key not in by_id:
                        added += 1
                    by_id[key] = parsed
        ordered = sorted(by_id.values(), key=lambda item: item['publishedAt'], reverse=True)[:300]
        await redis.set('telegram:signals', json.dumps(ordered, ensure_ascii=False))
        return added
    finally:
        await client.disconnect()

async def sync_public_signals() -> int:
    existing_raw = await redis.get('telegram:signals')
    existing = json.loads(existing_raw) if existing_raw else []
    by_id = {f"{item.get('source')}:{item['id']}": item for item in existing}
    added = 0
    for channel in CHANNELS:
        def fetch_page() -> str:
            request = urllib.request.Request(
                f'https://t.me/s/{channel}',
                headers={'User-Agent': 'Mozilla/5.0 SignalLab/1.0'},
            )
            with urllib.request.urlopen(request, timeout=20) as response:
                return response.read().decode('utf-8', errors='replace')
        try:
            page = await asyncio.to_thread(fetch_page)
        except Exception:
            continue
        blocks = list(re.finditer(
            rf"data-post=['\\\"]{re.escape(channel)}/(\\d+)['\\\"]",
            page,
            re.IGNORECASE,
        ))
        for index, found in enumerate(blocks):
            chunk = page[found.end():blocks[index + 1].start() if index + 1 < len(blocks) else len(page)]
            body = re.search(
                r'tgme_widget_message_text[^>]*>([\\s\\S]*?)(?:</div>|<div class="tgme_widget_message_footer)',
                chunk,
                re.IGNORECASE,
            )
            if not body:
                continue
            text = re.sub(r'<br\\s*/?>', '\\n', body.group(1), flags=re.IGNORECASE)
            text = html.unescape(re.sub(r'<[^>]+>', '', text)).strip()
            time_found = re.search(r'<time[^>]+datetime=["\\\']([^"\\\']+)', chunk, re.IGNORECASE)
            try:
                published = datetime.fromisoformat(time_found.group(1).replace('Z', '+00:00')) if time_found else datetime.now(timezone.utc)
            except ValueError:
                published = datetime.now(timezone.utc)
            parsed = parse_signal(channel, int(found.group(1)), text, published)
            key = f"{parsed['source']}:{parsed['id']}" if parsed else ''
            if parsed and key not in by_id:
                by_id[key] = parsed
                added += 1
    ordered = sorted(by_id.values(), key=lambda item: item['publishedAt'], reverse=True)[:300]
    await redis.set('telegram:signals', json.dumps(ordered, ensure_ascii=False))
    await redis.set('telegram:public_sync', str(int(datetime.now(timezone.utc).timestamp() * 1000)))
    return added

async def get_vapid_keys() -> tuple[str, str]:
    private_pem = await redis.get('push:vapid_private')
    if private_pem:
        key = serialization.load_pem_private_key(private_pem.encode(), password=None)
    else:
        key = ec.generate_private_key(ec.SECP256R1())
        private_pem = key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()).decode()
        await redis.set('push:vapid_private', private_pem)
    public_numbers = key.public_key().public_numbers()
    raw_public = b'\x04' + public_numbers.x.to_bytes(32, 'big') + public_numbers.y.to_bytes(32, 'big')
    public_key = base64.urlsafe_b64encode(raw_public).decode().rstrip('=')
    return private_pem, public_key

async def send_push_events(events: list[dict[str, Any]]) -> None:
    if not events:
        return
    raw = await redis.get('push:subscriptions')
    subscriptions = json.loads(raw) if raw else []
    if not subscriptions:
        return
    private_pem, _ = await get_vapid_keys()
    alive = []
    for subscription in subscriptions:
        valid = True
        for event in events:
            try:
                await asyncio.to_thread(webpush, subscription_info=subscription, data=json.dumps(event, ensure_ascii=False), vapid_private_key=private_pem, vapid_claims={'sub': 'mailto:notifications@murdilimax.app'})
            except WebPushException as exc:
                status = getattr(getattr(exc, 'response', None), 'status_code', None)
                if status in {404, 410}:
                    valid = False
                break
            except Exception:
                break
        if valid:
            alive.append(subscription)
    await redis.set('push:subscriptions', json.dumps(alive))

async def fetch_minute_extremes(symbol: str, since_ms: int, now_ms: int) -> dict[str, float] | None:
    """Return high/low from one-minute futures candles since the last paper check."""
    since_ms = max(0, int(since_ms))
    start_s = max(0, since_ms // 1000 - 60)
    end_s = now_ms // 1000
    mexc_symbol = symbol[:-4] + '_USDT' if symbol.endswith('USDT') else symbol
    try:
        data = await fetch_mexc(
            f'/api/v1/contract/kline/{mexc_symbol}',
            {'interval': 'Min1', 'start': start_s, 'end': end_s},
        )
        times = data.get('time', []) if isinstance(data, dict) else []
        rows = [
            (int(times[i]) * 1000, float(data['high'][i]), float(data['low'][i]), float(data['close'][i]))
            for i in range(len(times))
            if int(times[i]) * 1000 + 60000 >= since_ms
        ]
        if rows:
            return {'high': max(row[1] for row in rows), 'low': min(row[2] for row in rows), 'last': rows[-1][3]}
    except Exception:
        pass
    try:
        minutes = max(2, min(1000, (now_ms - since_ms) // 60000 + 3))
        result = await fetch_bybit(
            '/v5/market/kline',
            {'category': 'linear', 'symbol': symbol, 'interval': '1', 'limit': int(minutes)},
        )
        rows = [
            (int(row[0]), float(row[2]), float(row[3]), float(row[4]))
            for row in reversed(result.get('list', []))
            if int(row[0]) + 60000 >= since_ms
        ]
        if rows:
            return {'high': max(row[1] for row in rows), 'low': min(row[2] for row in rows), 'last': rows[-1][3]}
    except Exception:
        pass
    return None

async def update_paper_positions() -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    now = int(datetime.now(timezone.utc).timestamp() * 1000)
    version = await redis.get('paper:version')
    if version != '3':
        await redis.delete('paper:positions')
        await redis.set('paper:started_at', str(now))
        await redis.set('paper:version', '3')
    started_at = int(await redis.get('paper:started_at') or now)
    signals_raw = await redis.get('telegram:signals')
    positions_raw = await redis.get('paper:positions')
    signals = json.loads(signals_raw) if signals_raw else []
    positions = json.loads(positions_raw) if positions_raw else []
    by_id = {item['id']: item for item in positions}
    prices: dict[str, float] = {}
    try:
        mexc_rows = await fetch_mexc('/api/v1/contract/ticker')
        prices.update({row['symbol'].replace('_', ''): float(row['lastPrice']) for row in (mexc_rows or []) if row.get('symbol') and row.get('lastPrice')})
    except Exception:
        pass
    try:
        ticker_result = await fetch_bybit('/v5/market/tickers', {'category': 'linear'})
        for row in ticker_result.get('list', []):
            if row.get('symbol') and row.get('lastPrice') and row['symbol'] not in prices:
                prices[row['symbol']] = float(row['lastPrice'])
    except Exception:
        pass
    if prices:
        await redis.set('health:market_at', str(now))
    initial_balance = float(await redis.get('paper:initial_balance') or 1000)
    await redis.setnx('paper:initial_balance', '1000')
    closed_pnl = sum(float(p.get('pnlUsd') or 0) for p in positions if p.get('status') != 'OPEN')
    balance_for_risk = max(0.0, initial_balance + closed_pnl)
    for signal in signals:
        position_id = f"{signal.get('source')}:{signal.get('id')}"
        if position_id in by_id or not signal.get('targets') or signal.get('stop') is None:
            continue
        if int(signal.get('publishedAt') or 0) < started_at:
            continue
        price = prices.get(signal.get('symbol'))
        if not price:
            continue
        entries = signal.get('entry') or []
        entry = float(entries[0]) if entries else price
        first_target = float(signal['targets'][0])
        stop = float(signal['stop'])
        is_long = signal['side'] == 'LONG'
        if (is_long and not (stop < entry < first_target)) or ((not is_long) and not (first_target < entry < stop)):
            continue
        stop_distance = abs(entry - stop) / entry
        if stop_distance <= 0:
            continue
        risk_usd = balance_for_risk * 0.01
        notional = risk_usd / stop_distance
        leverage = int(signal.get('leverageMin') or 1)
        by_id[position_id] = {
            'id': position_id, 'symbol': signal['symbol'], 'side': signal['side'],
            'source': signal.get('source'), 'signalUrl': signal.get('url'),
            'entry': entry, 'targets': signal['targets'], 'stop': float(signal['stop']),
            'openedAt': now, 'lastCheckedAt': now, 'status': 'OPEN', 'exit': None, 'closedAt': None,
            'pnlPercent': 0.0, 'pnlUsd': 0.0, 'currentPrice': price,
            'riskPercent': 1.0, 'riskUsd': round(risk_usd, 2), 'notional': round(notional, 2),
            'leverage': leverage, 'marginUsed': round(notional / max(leverage, 1), 2),
        }
        events.append({'title': 'MURDILIMAX · Новый сигнал', 'body': f"{signal['symbol']} {signal['side']} · Entry {entry} · TP1 {first_target} · SL {stop}", 'tag': position_id, 'url': './'})
    for position in by_id.values():
        if position.get('status') != 'OPEN':
            continue
        price = prices.get(position['symbol'])
        if not price:
            continue
        position['currentPrice'] = price
        is_long = position['side'] == 'LONG'
        target = float(position['targets'][0])
        checked_from = int(position.get('lastCheckedAt') or position.get('openedAt') or now)
        candle_range = await fetch_minute_extremes(position['symbol'], checked_from, now)
        range_high = candle_range['high'] if candle_range else price
        range_low = candle_range['low'] if candle_range else price
        stop_hit = range_low <= float(position['stop']) if is_long else range_high >= float(position['stop'])
        target_hit = range_high >= target if is_long else range_low <= target
        position['lastCheckedAt'] = now
        position['checkedHigh'] = range_high
        position['checkedLow'] = range_low
        entry = float(position['entry'])
        position['pnlPercent'] = round(((price - entry) / entry) * (1 if is_long else -1) * 100, 4)
        if not position.get('notional'):
            distance = abs(entry - float(position['stop'])) / entry
            position['notional'] = round((initial_balance * 0.01) / distance, 2) if distance else 0
            position['riskPercent'] = 1.0
        position['pnlUsd'] = round(float(position.get('notional') or 0) * position['pnlPercent'] / 100, 2)
        if stop_hit or target_hit:
            exit_price = float(position['stop']) if stop_hit else target
            position['exit'] = exit_price
            position['closedAt'] = now
            position['status'] = 'STOPPED' if stop_hit else 'TP1'
            position['pnlPercent'] = round(((exit_price - entry) / entry) * (1 if is_long else -1) * 100, 4)
            position['pnlUsd'] = round(float(position.get('notional') or 0) * position['pnlPercent'] / 100, 2)
            position['hitSource'] = '1m-candle' if candle_range else 'last-price'
            position['bothLevelsTouched'] = bool(stop_hit and target_hit)
            event_name = 'Stop Loss' if position['status'] == 'STOPPED' else 'TP1 сработал'
            events.append({'title': f'MURDILIMAX · {event_name}', 'body': f"{position['symbol']} {position['side']} · {position['pnlPercent']:+.2f}%", 'tag': position['id'] + ':' + position['status'], 'url': './'})
    ordered = sorted(by_id.values(), key=lambda item: item.get('openedAt', 0), reverse=True)[:500]
    await redis.set('paper:positions', json.dumps(ordered, ensure_ascii=False))
    return events

async def background_sync() -> None:
    while True:
        try:
            current = await state()
            if current.get('status') == 'connected' and current.get('session'):
                await sync_signals(decrypted(current['session']))
            else:
                await sync_public_signals()
            events = await update_paper_positions()
            await send_push_events(events)
            current['lastSync'] = int(datetime.now(timezone.utc).timestamp() * 1000)
            current['lastError'] = None
            await save_state(current)
        except Exception as exc:
            current = await state()
            current['lastError'] = f'{type(exc).__name__}: {exc}'[:300]
            await save_state(current)
        await asyncio.sleep(60)

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

async def fetch_binance(path: str, params: dict[str, Any] | None = None) -> Any:
    from urllib.parse import urlencode
    hosts = [
        'https://fapi.binance.com',
        'https://fapi1.binance.com',
        'https://fapi2.binance.com',
        'https://fapi3.binance.com',
        'https://fapi4.binance.com',
    ]
    query = ('?' + urlencode(params)) if params else ''
    def request_json() -> Any:
        last_error: Exception | None = None
        for host in hosts:
            try:
                request = urllib.request.Request(host + path + query, headers={
                    'User-Agent': 'Mozilla/5.0 SignalLab/1.0',
                    'Accept': 'application/json',
                })
                with urllib.request.urlopen(request, timeout=10) as response:
                    return json.loads(response.read().decode('utf-8'))
            except Exception as exc:
                last_error = exc
        raise last_error or RuntimeError('No Binance endpoint available')
    try:
        return await asyncio.to_thread(request_json)
    except Exception as exc:
        raise HTTPException(502, f'Binance unavailable: {type(exc).__name__}: {exc}'[:240]) from exc

async def fetch_bybit(endpoint: str, params: dict[str, Any]) -> Any:
    from urllib.parse import urlencode
    url = 'https://api.bybit.com' + endpoint + '?' + urlencode(params)
    def request_json() -> Any:
        request = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 SignalLab/1.0', 'Accept': 'application/json'})
        with urllib.request.urlopen(request, timeout=12) as response:
            payload = json.loads(response.read().decode('utf-8'))
            if payload.get('retCode') != 0:
                raise RuntimeError(payload.get('retMsg', 'Bybit error'))
            return payload['result']
    return await asyncio.to_thread(request_json)

async def fetch_mexc(endpoint: str, params: dict[str, Any] | None = None) -> Any:
    from urllib.parse import urlencode
    url = 'https://contract.mexc.com' + endpoint + (('?' + urlencode(params)) if params else '')
    def request_json() -> Any:
        request = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 SignalLab/1.0', 'Accept': 'application/json'})
        with urllib.request.urlopen(request, timeout=12) as response:
            payload = json.loads(response.read().decode('utf-8'))
            if payload.get('success') is False:
                raise RuntimeError(payload.get('message', 'MEXC error'))
            return payload.get('data')
    return await asyncio.to_thread(request_json)

@app.get('/api/binance/fapi/v1/exchangeInfo')
async def binance_exchange_info():
    try:
        result = await fetch_mexc('/api/v1/contract/detail')
        symbols = []
        for item in result or []:
            raw = item.get('symbol', '')
            if raw.endswith('_USDT'):
                base = raw[:-5]
                tick = str(item.get('priceUnit') or '0.0001')
                symbols.append({'symbol': base + 'USDT', 'baseAsset': base, 'quoteAsset': 'USDT', 'contractType': 'PERPETUAL', 'status': 'TRADING', 'exchange': 'MEXC', 'filters': [{'filterType': 'PRICE_FILTER', 'tickSize': tick}]})
        return {'symbols': symbols, 'source': 'MEXC'}
    except Exception:
        result = await fetch_bybit('/v5/market/instruments-info', {'category': 'linear', 'limit': 1000})
        symbols = []
        for item in result.get('list', []):
            if item.get('quoteCoin') == 'USDT' and item.get('contractType') == 'LinearPerpetual' and item.get('status') == 'Trading':
                symbols.append({'symbol': item['symbol'], 'baseAsset': item['baseCoin'], 'quoteAsset': 'USDT', 'contractType': 'PERPETUAL', 'status': 'TRADING', 'exchange': 'BYBIT', 'filters': [{'filterType': 'PRICE_FILTER', 'tickSize': item.get('priceFilter', {}).get('tickSize', '0.01')}]})
        return {'symbols': symbols, 'source': 'BYBIT'}

@app.get('/api/binance/fapi/v1/ticker/24hr')
async def binance_ticker():
    try:
        result = await fetch_mexc('/api/v1/contract/ticker')
        return [{'symbol': x.get('symbol', '').replace('_', ''), 'lastPrice': x.get('lastPrice', '0'), 'priceChangePercent': str(float(x.get('riseFallRate') or 0) * 100), 'quoteVolume': x.get('amount24', '0')} for x in (result or []) if x.get('symbol', '').endswith('_USDT')]
    except Exception:
        result = await fetch_bybit('/v5/market/tickers', {'category': 'linear'})
        return [{'symbol': x['symbol'], 'lastPrice': x.get('lastPrice', '0'), 'priceChangePercent': str(float(x.get('price24hPcnt', 0)) * 100), 'quoteVolume': x.get('turnover24h', '0')} for x in result.get('list', [])]

@app.get('/api/binance/fapi/v1/klines')
async def binance_klines(symbol: str, interval: str, limit: int = Query(240, ge=2, le=500)):
    symbol = symbol.upper()
    if not re.fullmatch(r'[A-Z0-9_]{3,24}', symbol):
        raise HTTPException(400, 'Invalid symbol')
    if interval not in {'1m', '5m', '15m', '1h', '4h', '1d'}:
        raise HTTPException(400, 'Invalid interval')
    mexc_symbol = symbol[:-4] + '_USDT' if symbol.endswith('USDT') else symbol
    mexc_interval = {'1m': 'Min1', '5m': 'Min5', '15m': 'Min15', '1h': 'Min60', '4h': 'Hour4', '1d': 'Day1'}[interval]
    seconds = {'1m': 60, '5m': 300, '15m': 900, '1h': 3600, '4h': 14400, '1d': 86400}[interval]
    now_s = int(datetime.now(timezone.utc).timestamp())
    try:
        data = await fetch_mexc(f'/api/v1/contract/kline/{mexc_symbol}', {'interval': mexc_interval, 'start': now_s - seconds * limit, 'end': now_s})
        times = data.get('time', [])
        return [[int(times[i]) * 1000, data['open'][i], data['high'][i], data['low'][i], data['close'][i], data['vol'][i], int(times[i]) * 1000, '0'] for i in range(len(times))]
    except Exception:
        bybit_interval = {'1m': '1', '5m': '5', '15m': '15', '1h': '60', '4h': '240', '1d': 'D'}[interval]
        result = await fetch_bybit('/v5/market/kline', {'category': 'linear', 'symbol': symbol, 'interval': bybit_interval, 'limit': limit})
        return [[int(x[0]), x[1], x[2], x[3], x[4], x[5], int(x[0]), x[6] if len(x) > 6 else '0'] for x in reversed(result.get('list', []))]

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
        'channels': [f'@{channel}' for channel in CHANNELS],
        'lastSync': current.get('lastSync'),
        'lastError': current.get('lastError'),
        'publicMode': current.get('status') != 'connected',
        'needsPassword': current.get('status') == 'qr_password',
    }

@app.get('/api/signals')
async def signals():
    raw = await redis.get('telegram:signals')
    return {'sources': [f'@{channel}' for channel in CHANNELS], 'signals': json.loads(raw) if raw else []}

@app.get('/api/push/key')
async def push_public_key():
    _, public_key = await get_vapid_keys()
    return {'publicKey': public_key}

@app.post('/api/push/subscribe')
async def push_subscribe(payload: PushInput):
    subscription = payload.subscription
    if not subscription.get('endpoint') or not subscription.get('keys', {}).get('p256dh') or not subscription.get('keys', {}).get('auth'):
        raise HTTPException(400, 'Invalid push subscription')
    raw = await redis.get('push:subscriptions')
    subscriptions = json.loads(raw) if raw else []
    by_endpoint = {item.get('endpoint'): item for item in subscriptions}
    by_endpoint[subscription['endpoint']] = subscription
    await redis.set('push:subscriptions', json.dumps(list(by_endpoint.values())[-100:]))
    return {'ok': True}

@app.get('/api/system-health')
async def system_health():
    current = await state()
    now = int(datetime.now(timezone.utc).timestamp() * 1000)
    last_sync = int(current.get('lastSync') or 0)
    market_at = int(await redis.get('health:market_at') or 0)
    raw_subscriptions = await redis.get('push:subscriptions')
    subscriptions = json.loads(raw_subscriptions) if raw_subscriptions else []
    return {
        'server': {'ok': True, 'updatedAt': now},
        'telegram': {'ok': current.get('status') == 'connected' and now - last_sync < 180000, 'updatedAt': last_sync},
        'market': {'ok': market_at > 0 and now - market_at < 180000, 'updatedAt': market_at},
        'notifications': {'ok': len(subscriptions) > 0, 'subscriptions': len(subscriptions)},
    }

@app.get('/api/portfolio')
async def portfolio():
    initial = float(await redis.get('paper:initial_balance') or 1000)
    raw = await redis.get('paper:positions')
    positions = json.loads(raw) if raw else []
    closed = sorted([p for p in positions if p.get('status') != 'OPEN'], key=lambda p: p.get('closedAt') or 0)
    balance = initial
    points = [{'time': int(await redis.get('paper:started_at') or 0), 'balance': round(balance, 2)}]
    for position in closed:
        balance += float(position.get('pnlUsd') or 0)
        points.append({'time': position.get('closedAt'), 'balance': round(balance, 2)})
    unrealized = sum(float(p.get('pnlUsd') or 0) for p in positions if p.get('status') == 'OPEN')
    return {
        'initialBalance': initial, 'closedBalance': round(balance, 2),
        'unrealizedPnl': round(unrealized, 2), 'currentBalance': round(balance + unrealized, 2),
        'riskPercent': 1.0, 'points': points,
    }

@app.get('/api/paper')
async def paper_positions():
    raw = await redis.get('paper:positions')
    positions = json.loads(raw) if raw else []
    return {'positions': positions, 'open': sum(1 for p in positions if p.get('status') == 'OPEN')}

@app.post('/api/telegram/reset')
async def reset():
    current = await state()
    if current.get('status') == 'connected':
        raise HTTPException(409, 'Telegram уже подключён')
    if current.get('status') == 'code_sent' and current.get('partialSession'):
        client = TelegramClient(
            StringSession(decrypted(current['partialSession'])),
            API_ID,
            API_HASH,
            connection_retries=2,
            timeout=12,
        )
        try:
            await client.connect()
            await client(functions.auth.CancelCodeRequest(
                phone_number=current['phone'],
                phone_code_hash=current['phoneCodeHash'],
            ))
        except Exception:
            pass
        finally:
            await client.disconnect()
    await save_state({'status': 'disconnected'})
    return {'ok': True}

async def finish_qr_login(client: TelegramClient, qr) -> None:
    global qr_client, qr_task
    keep_client = False
    try:
        await qr.wait(timeout=120)
        saved = client.session.save()
        added = await sync_signals(saved)
        await save_state({'status': 'connected', 'session': encrypted(saved), 'lastSync': int(datetime.now(timezone.utc).timestamp() * 1000), 'lastError': None, 'added': added})
    except SessionPasswordNeededError:
        keep_client = True
        await save_state({'status': 'qr_password', 'lastError': None})
    except asyncio.TimeoutError:
        current = await state()
        current['lastError'] = 'QR истёк. Создайте новый QR.'
        await save_state(current)
    except Exception as exc:
        current = await state()
        current['lastError'] = f'{type(exc).__name__}: {exc}'[:300]
        await save_state(current)
    finally:
        if not keep_client:
            await client.disconnect()
            qr_client = None
        qr_task = None

@app.post('/api/telegram/qr')
async def qr_login():
    global qr_client, qr_task
    current = await state()
    if current.get('status') == 'connected':
        return {'ok': True, 'connected': True}
    if qr_task and not qr_task.done():
        qr_task.cancel()
        if qr_client:
            await qr_client.disconnect()
    qr_client = TelegramClient(StringSession(), API_ID, API_HASH, connection_retries=2, timeout=12)
    await qr_client.connect()
    qr = await qr_client.qr_login()
    qr_task = asyncio.create_task(finish_qr_login(qr_client, qr))
    image = qrcode.make(qr.url)
    buffer = io.BytesIO()
    image.save(buffer, format='PNG')
    qr_image = 'data:image/png;base64,' + base64.b64encode(buffer.getvalue()).decode()
    return {'ok': True, 'url': qr.url, 'qrImage': qr_image, 'expires': qr.expires.isoformat()}

@app.post('/api/telegram/qr-password')
async def qr_password(payload: PasswordInput):
    global qr_client
    current = await state()
    if current.get('status') != 'qr_password' or qr_client is None:
        raise HTTPException(409, 'Создайте и отсканируйте новый QR')
    if not payload.password:
        raise HTTPException(400, 'Введите пароль двухэтапной защиты')
    try:
        await qr_client.sign_in(password=payload.password)
        saved = qr_client.session.save()
        added = await sync_signals(saved)
        await save_state({'status': 'connected', 'session': encrypted(saved), 'lastSync': int(datetime.now(timezone.utc).timestamp() * 1000), 'lastError': None})
        await qr_client.disconnect()
        qr_client = None
        return {'ok': True, 'connected': True, 'added': added}
    except Exception as exc:
        raise HTTPException(400, f'{type(exc).__name__}: {exc}'[:300]) from exc

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
            'codeViaApp': type(sent.type).__name__ == 'SentCodeTypeApp',
            'deliveryType': type(sent.type).__name__,
            'nextType': type(sent.next_type).__name__ if sent.next_type else None,
            'timeout': sent.timeout,
            'updatedAt': int(datetime.now(timezone.utc).timestamp() * 1000),
        })
        return {'ok': True, 'codeViaApp': type(sent.type).__name__ == 'SentCodeTypeApp'}
    except Exception as exc:
        message = f'{type(exc).__name__}: {exc}'
        await save_state({'status': 'disconnected', 'lastError': message[:300]})
        raise HTTPException(400, message[:300]) from exc
    finally:
        await client.disconnect()

@app.post('/api/telegram/resend')
async def resend_code():
    current = await state()
    if current.get('status') != 'code_sent':
        raise HTTPException(409, 'Сначала запросите код')
    client = TelegramClient(
        StringSession(decrypted(current['partialSession'])),
        API_ID,
        API_HASH,
        connection_retries=2,
        timeout=12,
    )
    try:
        await client.connect()
        sent = await client(functions.auth.ResendCodeRequest(
            phone_number=current['phone'],
            phone_code_hash=current['phoneCodeHash'],
        ))
        current['phoneCodeHash'] = sent.phone_code_hash
        current['partialSession'] = encrypted(client.session.save())
        current['codeViaApp'] = type(sent.type).__name__ == 'SentCodeTypeApp'
        current['deliveryType'] = type(sent.type).__name__
        current['nextType'] = type(sent.next_type).__name__ if sent.next_type else None
        current['timeout'] = sent.timeout
        await save_state(current)
        return {
            'ok': True,
            'codeViaApp': current['codeViaApp'],
            'deliveryType': current['deliveryType'],
            'nextType': current['nextType'],
        }
    except Exception as exc:
        raise HTTPException(400, f'{type(exc).__name__}: {exc}'[:300]) from exc
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
    if current.get('status') == 'connected' and current.get('session'):
        added = await sync_signals(decrypted(current['session']))
    else:
        added = await sync_public_signals()
    current['lastSync'] = int(datetime.now(timezone.utc).timestamp() * 1000)
    current['lastError'] = None
    await save_state(current)
    return {'ok': True, 'added': added}

@app.get('/', response_class=HTMLResponse)
async def home():
    return '''<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SignalLab Telegram</title><style>
:root{font-family:system-ui;color:#eef2ff;background:#060912;color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 80% 0,#25184d,transparent 38%),#060912;min-height:100vh}.shell{max-width:680px;margin:auto;padding:24px 16px}.card{background:#101625;border:1px solid #29324a;border-radius:22px;padding:22px;margin:18px 0}h1{font-size:38px;margin:18px 0}.green{color:#75ead1}.badge{float:right;color:#9ca8bd}.online{color:#6be5b4}label{display:block;color:#aab4c8;margin:14px 0 7px}input,button{width:100%;height:54px;border-radius:14px;font-size:17px}input{background:#0a0f1d;color:#fff;border:1px solid #34405d;padding:0 15px}button{border:0;background:linear-gradient(120deg,#7869ff,#4bd8c8);font-weight:800;color:#07101d;margin-top:13px}.secondary{background:#222c44;color:#dfe6f5}.error{padding:13px;border-radius:12px;background:#3b1d2a;color:#ff9bb7}.muted{color:#8c97ab;line-height:1.55}.signal{border-top:1px solid #273149;padding:14px 0}.long{color:#63e8bd}.short{color:#ff86a2}</style></head><body><main class="shell"><span id="status" class="badge">Проверка…</span><p class="green">ИСТОЧНИК СИГНАЛОВ</p><h1>@Crypto_pravda1<br><span style="font-size:.72em">@signalyp</span></h1><p class="muted">Подключение один раз. Затем сервер автоматически загружает сигналы из обоих каналов каждые 5 минут.</p><section class="card" id="login"><h2>Подключить Telegram</h2><div id="phoneStep"><label>Номер Telegram</label><input id="phone" type="tel" placeholder="+371..."><button onclick="sendCode()">Получить код</button><button class="secondary" onclick="qrLogin()">Войти по QR без кода</button></div><div id="codeStep" hidden><label>Код из Telegram</label><input id="code" inputmode="numeric"><label id="passwordLabel" hidden>Пароль 2FA</label><input id="password" type="password" hidden><button onclick="verify()">Подключить</button><button class="secondary" onclick="qrLogin()">Войти без кода через Telegram</button><button class="secondary" onclick="resend()">Отправить код ещё раз / SMS</button><button class="secondary" onclick="resetLogin()">Ввести номер заново</button></div><p id="hint" class="muted"></p><p id="error" class="error" hidden></p></section><section class="card"><h2 id="count">Последние сигналы</h2><div id="signals"><p class="muted">Сигналов пока нет.</p></div></section><p class="muted">Не открывайте реальные сделки, пока каждый уровень не проверен вручную.</p></main><script>
const el=id=>document.getElementById(id);const fail=e=>{const d=e&&e.detail?e.detail:(e&&e.message?e.message:String(e));el('error').textContent=d;el('error').hidden=false};async function call(path,options){const r=await fetch(path,{headers:{'Content-Type':'application/json'},...options});const d=await r.json();if(!r.ok)throw d;return d}async function load(){try{const s=await call('/api/status');el('status').textContent=s.connected?'● Подключено':'● Публичный режим';el('status').className=s.connected?'badge online':'badge';el('login').hidden=s.connected;el('phoneStep').hidden=s.awaitingCode;el('codeStep').hidden=!s.awaitingCode;if(s.needsPassword){el('login').hidden=false;el('phoneStep').hidden=true;el('codeStep').hidden=true;el('hint').innerHTML='<label>Пароль двухэтапной защиты Telegram</label><input id="qrPassword" type="password" autocomplete="current-password"><button onclick="submitQrPassword()">Завершить подключение</button>'}if(s.lastError)fail(s.lastError);const d=await call('/api/signals');el('count').textContent=d.signals.length?'Последние сигналы: '+d.signals.length:'Сигналов пока нет';el('signals').innerHTML=d.signals.slice(0,30).map(x=>'<div class="signal"><b>'+x.symbol+'</b> <span class="'+x.side.toLowerCase()+'">'+x.side+'</span> <small>'+x.source+'</small><div class="muted">Entry: '+(x.entry.length?x.entry.join(' – '):'Market')+' · TP: '+(x.targets.join(' · ')||'—')+' · SL: '+(x.stop||'—')+'</div></div>').join('')||'<p class="muted">После подключения здесь появятся реальные сигналы.</p>'}catch(e){fail(e)}}async function submitQrPassword(){try{el('error').hidden=true;await call('/api/telegram/qr-password',{method:'POST',body:JSON.stringify({password:el('qrPassword').value})});el('hint').textContent='Telegram подключён. Загружаю сигналы…';await load()}catch(e){fail(e)}}async function sendCode(){try{el('error').hidden=true;const d=await call('/api/telegram/start',{method:'POST',body:JSON.stringify({phone:el('phone').value})});el('hint').textContent=d.codeViaApp?'Код отправлен в официальный чат Telegram.':'Код отправлен по SMS.';await load()}catch(e){fail(e)}}async function qrLogin(){try{el('error').hidden=true;el('hint').textContent='Создаю безопасную ссылку…';const d=await call('/api/telegram/qr',{method:'POST',body:'{}'});if(d.connected){await load();return}el('hint').innerHTML='<img src="'+d.qrImage+'" alt="Telegram QR" style="display:block;width:240px;max-width:100%;margin:16px auto;background:white;padding:10px;border-radius:16px"><b style="display:block;color:#75ead1;margin-bottom:8px">Откройте Telegram → Настройки → Устройства → Подключить устройство</b><span>Покажите этот QR на компьютере, планшете или телефоне знакомого и отсканируйте своим телефоном. Код не нужен.</span>'}catch(e){fail(e)}}async function resend(){try{el('error').hidden=true;const d=await call('/api/telegram/resend',{method:'POST',body:'{}'});el('hint').textContent=d.codeViaApp?'Код повторно отправлен в Telegram.':'Код отправлен другим способом.'}catch(e){fail(e)}}async function verify(){try{el('error').hidden=true;const d=await call('/api/telegram/verify',{method:'POST',body:JSON.stringify({code:el('code').value,password:el('password').value})});if(d.needsPassword){el('passwordLabel').hidden=false;el('password').hidden=false;fail('Введите пароль двухэтапной защиты.')}else await load()}catch(e){fail(e)}}async function resetLogin(){await call('/api/telegram/reset',{method:'POST',body:'{}'});await load()}load();setInterval(load,30000);
</script></body></html>'''
