#!/usr/bin/env python3
import html, json, re, urllib.request
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path

CHANNEL = "Crypto_pravda1"
URL = f"https://t.me/s/{CHANNEL}"
OUT = Path(__file__).parent / "signals.json"

class TelegramHTML(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.posts, self.post, self.depth, self.text_depth = [], None, 0, 0
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if self.post is None and a.get("data-post", "").lower().startswith(CHANNEL.lower()+"/"):
            self.post={"id":a["data-post"].split("/")[-1],"text":[],"time":None}; self.depth=1; return
        if self.post is None: return
        self.depth += 1
        classes=a.get("class","").split()
        if "tgme_widget_message_text" in classes: self.text_depth=self.depth
        if tag=="br" and self.text_depth: self.post["text"].append("\n")
        if tag=="time" and a.get("datetime"): self.post["time"]=a["datetime"]
    def handle_endtag(self, tag):
        if self.post is None: return
        if self.text_depth==self.depth: self.text_depth=0
        self.depth -= 1
        if self.depth==0:
            self.post["text"]="".join(self.post["text"]).strip()
            if self.post["text"]: self.posts.append(self.post)
            self.post=None
    def handle_data(self, data):
        if self.post is not None and self.text_depth: self.post["text"].append(data)

def number(value):
    try: return float(value.replace(" ","").replace(",","."))
    except: return None

def parse(post):
    text=html.unescape(post["text"])
    head=re.search(r"(?:^|\n)[^A-Z0-9]{0,8}\$?#?([A-Z0-9]{2,16})(?:\s*/?USDT)?\s+(LONG|SHORT)\b",text,re.I)
    if not head: return None
    asset,side=head.group(1).upper(),head.group(2).upper()
    if asset.endswith("USDT"): asset=asset[:-4]
    leverage=re.search(r"(\d{1,3})(?:\s*[-–]\s*(\d{1,3}))?\s*[xXхХ]\b",text)
    entry_line=re.search(r"(?:Вход|Entry)\s*:?\s*([^\n]+)",text,re.I)
    entry=None
    if entry_line and not re.search(r"рын|market",entry_line.group(1),re.I):
        nums=re.findall(r"\d+(?:[.,]\d+)?",entry_line.group(1)); entry=number(nums[0]) if nums else None
    stop_m=re.search(r"(?:Стоп|Stop(?:\s*loss)?|SL)\s*:?\s*(\d+(?:[.,]\d+)?)",text,re.I)
    targets=[]
    take_block=re.search(r"(?:Тейки|Цели|Targets?|TP)\s*:?\s*([\s\S]*?)(?=\n[^\n]{0,12}(?:Стоп|Stop|SL)\b|$)",text,re.I)
    if take_block:
        targets=[number(x) for x in re.findall(r"\d+(?:[.,]\d+)?",take_block.group(1))][:8]
        targets=[x for x in targets if x is not None]
    lev=None
    if leverage: lev=leverage.group(1)+(f"–{leverage.group(2)}" if leverage.group(2) else "")
    return {"id":post["id"],"symbol":asset+"USDT","side":side,"leverage":lev,"entry":entry,"targets":targets,"stop":number(stop_m.group(1)) if stop_m else None,"time":post["time"] or datetime.now(timezone.utc).isoformat(),"url":f"https://t.me/{CHANNEL}/{post['id']}","parsed":bool(targets and stop_m),"raw":text[:1800]}

def main():
    old={"signals":[]}
    if OUT.exists():
        try: old=json.loads(OUT.read_text())
        except: pass
    result={"source":URL,"updated_at":datetime.now(timezone.utc).isoformat(),"status":"error","error":None,"signals":old.get("signals",[])}
    try:
        req=urllib.request.Request(URL,headers={"User-Agent":"Mozilla/5.0 SignalLab/1.0","Accept-Language":"ru,en;q=0.8"})
        with urllib.request.urlopen(req,timeout=30) as r: page=r.read().decode("utf-8","replace")
        parser=TelegramHTML(); parser.feed(page)
        parsed=[x for p in parser.posts if (x:=parse(p))]
        by_id={str(x["id"]):x for x in old.get("signals",[])}
        for x in parsed: by_id[str(x["id"])]=x
        result["signals"]=sorted(by_id.values(),key=lambda x:int(x["id"]),reverse=True)[:100]
        result["status"]="ok"; result["error"]=None
    except Exception as exc: result["error"]=f"{type(exc).__name__}: {exc}"[:240]
    OUT.write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n")

if __name__=="__main__": main()
