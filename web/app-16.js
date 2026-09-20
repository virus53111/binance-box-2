// NEXUS ALPHA — unified calm physics + premium Retina bubbles + zoom/pan.
(()=>{
  const API=window.NEXUS_API||'https://murdilimax-live-earth-api.onrender.com';
  let lang=window.NEXUS_LANG||localStorage.getItem('nexus-lang')||'ru';
  const T=(r,e)=>lang==='ru'?r:e, $=id=>document.getElementById(id);
  const app=$('app'); if(!app) return;

  const S={
    kind:'market',start:0,period:'1h',items:[],nodes:[],loading:false,updated:0,dpr:1,
    zoom:1,panX:0,panY:0,raf:0,last:0,pointers:new Map(),gesture:null,drag:null,panDrag:null
  };

  app.innerHTML=`<section class="nx">
    <div class="toolbar">
      <div class="tabs" id="tabs">
        <button class="on" data-kind="market">${T('РЫНОК','MARKET')}</button>
        <button data-kind="pump">PUMP.FUN</button>
        <button data-kind="dex">DEX VETTED</button>
        <button data-kind="precex">PRE-CEX</button>
      </div>
      <div class="feed"><i></i>LIVE DATA</div>
    </div>
    <div class="ranks" id="ranks"></div>
    <div class="head"><div><small>NEXUS VISUAL INTELLIGENCE</small><h1 id="title">TOP #1–100</h1></div><span id="meta">—</span></div>
    <div class="stage" id="stage">
      <canvas id="canvas"></canvas>
      <div class="loader" id="loader"><b></b>${T('ЗАГРУЖАЕМ РЫНОК','LOADING MARKET')}</div>
      <div class="empty" id="empty"></div>
      <div class="zoom"><button id="minus">−</button><button id="reset">100%</button><button id="plus">+</button></div>
    </div>
    <div class="foot">
      <div>
        <div class="periods" id="periods">
          <button data-p="5m">5M</button><button data-p="15m">15M</button>
          <button class="on" data-p="1h">1H</button><button data-p="24h">1D</button><button data-p="30d">1M</button>
        </div>
        <div class="note" id="note"></div>
      </div>
      <div class="hint">${T('Pinch/± — масштаб · тяни фон — двигай карту','Pinch/± to zoom · drag background to pan')}</div>
    </div>
    <div class="sheet" id="sheet"><button id="close">×</button><div id="sheetBody"></div></div>
  </section>`;

  const style=document.createElement('style');
  style.textContent=`
    .nx{padding:7px 7px 12px;min-height:calc(100dvh - 70px);background:#020304;color:#f7f9fb}
    .toolbar,.ranks,.head,.stage,.foot{max-width:1500px;margin-left:auto;margin-right:auto}
    .toolbar{display:flex;align-items:center;justify-content:space-between;gap:8px}
    .tabs,.ranks,.periods{display:flex;gap:5px;overflow:auto;scrollbar-width:none}
    .tabs::-webkit-scrollbar,.ranks::-webkit-scrollbar,.periods::-webkit-scrollbar{display:none}
    .tabs button,.ranks button,.periods button{border:1px solid rgba(255,255,255,.09);background:#080b0f;color:#77838f;border-radius:999px;padding:8px 12px;font:800 9px/1 system-ui;white-space:nowrap}
    .tabs button.on{color:#eafff5;border-color:rgba(88,239,179,.34);background:rgba(42,108,80,.2)}
    .feed{font:900 8px/1 system-ui;color:#67efb7;letter-spacing:.14em;white-space:nowrap}.feed i{display:inline-block;width:6px;height:6px;border-radius:50%;background:#67efb7;box-shadow:0 0 12px #67efb7;margin-right:5px}
    .ranks{padding:6px 0 4px}.ranks button{padding:6px 10px;font-size:8px}.ranks button.on{color:#ddf9ff;border-color:rgba(84,218,255,.32);background:rgba(65,184,222,.07)}.ranks.hidden{display:none}
    .head{display:flex;align-items:end;justify-content:space-between;padding:2px 3px 7px}.head small{font:900 7px/1 system-ui;color:#61dcf6;letter-spacing:.22em}.head h1{margin:5px 0 0;font:900 20px/1 system-ui}.head span{font:700 8px/1 system-ui;color:#66727d}
    .stage{position:relative;height:calc(100dvh - 225px);min-height:540px;max-height:1080px;overflow:hidden;border-radius:8px;background:#010203;box-shadow:inset 0 0 100px rgba(0,0,0,.9),0 0 0 1px rgba(255,255,255,.04);touch-action:none;user-select:none}
    #canvas{position:absolute;inset:0;width:100%;height:100%;display:block}
    .loader{display:none;position:absolute;z-index:8;inset:0;align-items:center;justify-content:center;gap:8px;background:rgba(1,2,3,.7);backdrop-filter:blur(2px);font:800 9px/1 system-ui;color:#74818d;letter-spacing:.12em}.loader.on{display:flex}.loader b{width:15px;height:15px;border:2px solid #18242c;border-top-color:#63e5ff;border-radius:50%;animation:spin .65s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
    .empty{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);color:#687581;font:700 10px/1.4 system-ui;text-align:center;pointer-events:none}
    .zoom{position:absolute;right:9px;bottom:9px;z-index:7;display:flex;gap:4px;padding:4px;border:1px solid rgba(255,255,255,.08);border-radius:13px;background:rgba(3,6,8,.82);backdrop-filter:blur(12px)}
    .zoom button{height:35px;min-width:36px;border:0;border-radius:9px;background:#0c1116;color:#d7dfe6;font:900 17px/1 system-ui}.zoom #reset{min-width:56px;font-size:9px;color:#8b98a4}
    .foot{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;padding-top:7px}.periods button{border-radius:10px;min-width:49px;font-size:10px}.periods button.on{color:#fff;background:#e65058;border-color:#e65058;box-shadow:0 0 22px rgba(230,80,88,.16)}
    .note{height:15px;padding:4px 2px 0;color:#596672;font:700 7px/1 system-ui}.hint{padding-top:8px;color:#56636e;font:700 8px/1.35 system-ui;text-align:right}
    .sheet{position:fixed;z-index:100;left:50%;bottom:12px;width:min(570px,calc(100% - 18px));padding:17px;border:1px solid rgba(255,255,255,.1);border-radius:18px;background:rgba(5,8,11,.98);box-shadow:0 25px 90px rgba(0,0,0,.75);transform:translate(-50%,130%);opacity:0;transition:.2s ease}.sheet.on{transform:translate(-50%,0);opacity:1}.sheet>button{position:absolute;right:8px;top:4px;border:0;background:none;color:#84919e;font-size:28px}
    .coin{display:grid;grid-template-columns:auto 1fr auto;gap:11px;align-items:center;padding-right:25px}.coin img{width:44px;height:44px;border-radius:50%;object-fit:cover;background:#111}.coin small,.coin b{display:block;color:#75818e;font-size:9px}.coin h2{margin:2px 0;font-size:19px}.coin>strong{font-size:18px}.pos{color:#67efb7}.neg{color:#ff6a7f}.muted{color:#7d8995!important}
    .stats{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-top:14px}.stats div{border:1px solid rgba(255,255,255,.07);background:rgba(255,255,255,.018);padding:9px;border-radius:10px}.stats span{display:block;color:#687581;text-transform:uppercase;font-size:7px}.stats b{display:block;margin-top:4px;font-size:11px}
    @media(max-width:620px){.nx{padding:5px 3px 8px;min-height:calc(100dvh - 65px)}.tabs button{padding:7px 9px}.stage{height:calc(100dvh - 215px);min-height:525px;border-radius:4px}.head h1{font-size:18px}.hint{display:none}.stats{grid-template-columns:repeat(2,1fr)}.zoom{right:7px;bottom:7px}.periods button{min-width:47px;padding:8px 9px}}
  `;
  document.head.appendChild(style);

  const stage=$('stage'),canvas=$('canvas'),ctx=canvas.getContext('2d',{alpha:false,desynchronized:true});
  ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';

  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const num=v=>Number(v)||0, finite=v=>Number.isFinite(Number(v));
  const hash=s=>{let h=2166136261;for(const ch of String(s||'')){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)}return(h>>>0)/4294967295};
  const money=v=>{v=num(v);if(v>=1e12)return'$'+(v/1e12).toFixed(2)+'T';if(v>=1e9)return'$'+(v/1e9).toFixed(2)+'B';if(v>=1e6)return'$'+(v/1e6).toFixed(2)+'M';if(v>=1e3)return'$'+(v/1e3).toFixed(1)+'K';return v?'$'+v.toFixed(2):'—'};
  const price=v=>{v=num(v);if(!v)return'—';if(v>=1000)return'$'+v.toLocaleString(undefined,{maximumFractionDigits:2});if(v>=1)return'$'+v.toFixed(3);if(v>=.01)return'$'+v.toFixed(5);return'$'+v.toPrecision(4)};
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function change(c){
    const key=S.period==='5m'?'change5m':S.period==='15m'?'change15m':S.period==='1h'?'change1h':S.period==='24h'?'change24h':'change30d';
    return finite(c[key])?Number(c[key]):null;
  }
  function logos(c){
    const s=String(c.symbol||'').toLowerCase();
    return [c.image,c.logo,s?`https://assets.coincap.io/assets/icons/${encodeURIComponent(s)}@2x.png`:'',c.nameid?`https://c2.coinlore.com/img/25x25/${encodeURIComponent(c.nameid)}.png`:''].filter(Boolean);
  }
  function normalMarket(x){return{
    id:x.id||x.symbol,rank:num(x.rank),symbol:String(x.symbol||'?').toUpperCase(),name:x.name||x.symbol||'Coin',nameid:x.nameid||'',logo:x.logo||'',
    price:num(x.price||x.price_usd),marketCap:num(x.marketCap||x.market_cap_usd),volume24:num(x.volume24),
    change5m:finite(x.change5m)?Number(x.change5m):null,change15m:finite(x.change15m)?Number(x.change15m):null,
    change1h:finite(x.change1h??x.percent_change_1h)?Number(x.change1h??x.percent_change_1h):null,
    change24h:finite(x.change24h??x.percent_change_24h)?Number(x.change24h??x.percent_change_24h):null,
    change30d:finite(x.change30d)?Number(x.change30d):null,kind:'market'
  }}
  function normalToken(t,kind){
    const d=t.dex||{},liq=num(d.liquidityUsd),cap=num(d.marketCap||d.fdv||t.pump?.marketCapUsd)||liq*2.5;
    return{id:t.mint||t.symbol,symbol:String(t.symbol||'?').toUpperCase(),name:t.name||t.symbol||'Token',image:t.image||t.logo||'',
      price:num(d.priceUsd),marketCap:cap||1,volume24:num(d.volumeH24||d.volumeH6||d.volumeH1),
      change5m:finite(d.changeM5)?Number(d.changeM5):null,change15m:finite(d.changeM15)?Number(d.changeM15):null,
      change1h:finite(d.changeH1)?Number(d.changeH1):null,change24h:finite(d.changeH24??d.change24h)?Number(d.changeH24??d.change24h):null,
      change30d:null,kind,raw:t};
  }
  async function fallback(){
    const r=await fetch(`https://api.coinlore.net/api/tickers/?start=${S.start}&limit=100`,{cache:'no-store'});
    if(!r.ok)throw Error('MARKET '+r.status);const d=await r.json();return{coins:(d.data||[]).map(normalMarket),generatedAt:Date.now()};
  }
  async function load(){
    if(S.loading)return;S.loading=true;$('loader').classList.add('on');$('empty').textContent='';
    try{
      let items=[],updated=Date.now();
      if(S.kind==='market'){
        let d;try{const r=await fetch(`${API}/api/market-map?start=${S.start}&limit=100`,{cache:'no-store'});if(!r.ok)throw Error(String(r.status));d=await r.json()}catch{d=await fallback()}
        items=(d.coins||[]).map(normalMarket);updated=d.generatedAt||Date.now();
      }else if(S.kind==='pump'){
        const r=await fetch(`${API}/api/radar-v3?limit=500&maxAgeHours=24`,{cache:'no-store'});if(!r.ok)throw Error('API '+r.status);const d=await r.json();
        items=(d.tokens||[]).filter(t=>t.pump||String(t.source||'').toLowerCase().includes('pump')).map(t=>normalToken(t,'pump')).sort((a,b)=>b.marketCap-a.marketCap).slice(0,180);updated=d.generatedAt||Date.now();
      }else{
        const r=await fetch(`${API}/api/vetted?limit=500`,{cache:'no-store'});if(!r.ok)throw Error('API '+r.status);const d=await r.json();let rows=d.tokens||[];
        if(S.kind==='precex')rows=rows.filter(t=>t.vetted?.cex?.preCexCandidate||t.vetted?.cex?.projectClaimDetected);
        items=rows.map(t=>normalToken(t,S.kind)).sort((a,b)=>b.marketCap-a.marketCap).slice(0,180);updated=d.generatedAt||Date.now();
      }
      S.items=items;S.updated=updated;updateHead();seed();updateNote();
    }catch(e){S.items=[];S.nodes=[];$('empty').textContent=T('Источник сейчас недоступен','Source unavailable')+' · '+e.message}
    finally{S.loading=false;$('loader').classList.remove('on')}
  }
  function updateHead(){
    $('title').textContent=S.kind==='market'?`TOP #${S.start+1}–${S.start+100}`:S.kind==='pump'?'PUMP.FUN · LIVE':S.kind==='dex'?'DEX VETTED':'PRE-CEX';
    $('meta').textContent=`${S.items.length} ${T('активов','assets')} · ${new Date(S.updated).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}`;
  }
  function updateNote(){
    const have=S.items.filter(x=>change(x)!==null).length;
    if(S.period==='5m'&&have<S.items.length*.5)$('note').textContent=T('5M накапливается из live-снимков','5M warms up from live snapshots');
    else if(S.period==='30d'&&have<S.items.length*.5)$('note').textContent=T('1M только там, где есть 30-дневная история','1M only where 30-day history is available');
    else $('note').textContent=have?`${have}/${S.items.length} ${T('с данными','with data')}`:'';
  }

  const ranks=$('ranks');
  ranks.innerHTML=Array.from({length:10},(_,i)=>`<button data-s="${i*100}" class="${i===0?'on':''}">${i*100+1}–${i*100+100}</button>`).join('');
  ranks.querySelectorAll('button').forEach(b=>b.onclick=()=>{S.start=+b.dataset.s;ranks.querySelectorAll('button').forEach(x=>x.classList.toggle('on',x===b));load()});
  $('tabs').querySelectorAll('button').forEach(b=>b.onclick=()=>{S.kind=b.dataset.kind;$('tabs').querySelectorAll('button').forEach(x=>x.classList.toggle('on',x===b));ranks.classList.toggle('hidden',S.kind!=='market');load()});
  $('periods').querySelectorAll('button').forEach(b=>b.onclick=()=>{S.period=b.dataset.p;$('periods').querySelectorAll('button').forEach(x=>x.classList.toggle('on',x===b));S.nodes.forEach(n=>n.dirty=true);updateNote()});
  $('close').onclick=()=>$('sheet').classList.remove('on');
  $('langBtn').onclick=()=>{lang=lang==='ru'?'en':'ru';localStorage.setItem('nexus-lang',lang);location.reload()};

  function resize(){
    const r=stage.getBoundingClientRect();S.dpr=Math.min(3,Math.max(1,window.devicePixelRatio||1));
    canvas.width=Math.max(1,Math.round(r.width*S.dpr));canvas.height=Math.max(1,Math.round(r.height*S.dpr));
    canvas.style.width=r.width+'px';canvas.style.height=r.height+'px';
    ctx.setTransform(S.dpr,0,0,S.dpr,0,0);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
  }

  function radii(){
    const w=stage.clientWidth,h=stage.clientHeight,n=Math.max(1,S.items.length);
    const vals=S.items.map(x=>Math.log10(Math.max(1,x.marketCap||x.volume24||1))),lo=Math.min(...vals),hi=Math.max(...vals),mobile=w<650;
    const area=Math.sqrt(w*h/n);
    return vals.map(v=>{
      const q=hi>lo?(v-lo)/(hi-lo):.5;
      let r=(mobile?6.2:8)+Math.pow(q,2.0)*(mobile?58:84);
      r*=clamp(area/(mobile?22:27),.67,1.08);
      return r;
    });
  }

  function seed(){
    resize();S.zoom=1;S.panX=0;S.panY=0;updateZoom();
    const w=stage.clientWidth,h=stage.clientHeight,rs=radii(),cx=w/2,cy=h/2;
    S.nodes=S.items.map((item,i)=>{
      const h1=hash(item.id||item.symbol),h2=hash((item.id||item.symbol)+'b'),a=i*2.399963+h1*6.28,sp=Math.sqrt(i+1)*Math.min(w,h)*.025,r=rs[i];
      const dir=h2*Math.PI*2;
      return{item,r,x:clamp(cx+Math.cos(a)*sp,r,w-r),y:clamp(cy+Math.sin(a)*sp,r,h-r),
        vx:Math.cos(dir)*.045,vy:Math.sin(dir)*.045,phase:h1*6.28,turn:(h2-.5)*.0007,sprite:null,img:null,imgTry:0,dirty:true};
    });
    preload();
    for(let i=0;i<160;i++)resolveCollisions(true);
    S.nodes.forEach(n=>{n.vx=Math.cos(n.phase)*.045;n.vy=Math.sin(n.phase)*.045});
  }

  function preload(){
    for(const n of S.nodes){
      const list=logos(n.item);if(!list.length)continue;
      const img=new Image();img.crossOrigin='anonymous';n.img=img;
      const next=()=>{const u=list[n.imgTry++];if(!u)return;img.onload=()=>{n.dirty=true};img.onerror=next;img.src=u};next();
    }
  }

  function palette(ch){
    if(ch==null)return{inner:'#15191e',outer:'#05070a',edge:'rgba(136,149,160,.42)',glow:'rgba(0,0,0,0)',text:'#d6dde3'};
    const a=Math.abs(ch);if(a<.35)return{inner:'#171b20',outer:'#06080b',edge:'rgba(136,149,160,.45)',glow:'rgba(0,0,0,0)',text:'#d8dfe5'};
    if(ch>0){const k=clamp((a-.35)/15,0,1);return{inner:`rgb(${13+10*k},${50+75*k},${34+36*k})`,outer:`rgb(4,${19+28*k},${13+14*k})`,edge:`rgba(57,255,144,${.42+.5*k})`,glow:`rgba(43,255,135,${.06+.26*k})`,text:'#c9ffda'}}
    const k=clamp((a-.35)/15,0,1);return{inner:`rgb(${61+65*k},${18+8*k},${27+12*k})`,outer:`rgb(${24+27*k},6,10)`,edge:`rgba(255,74,99,${.42+.5*k})`,glow:`rgba(255,42,76,${.06+.24*k})`,text:'#ffd0d7'};
  }

  function sprite(n){
    const r=n.r,pad=Math.max(4,Math.min(15,r*.18)),size=Math.ceil((r+pad)*2),d=Math.min(3,S.dpr);
    const c=document.createElement('canvas');c.width=Math.ceil(size*d);c.height=Math.ceil(size*d);
    const g=c.getContext('2d');g.scale(d,d);g.imageSmoothingEnabled=true;g.imageSmoothingQuality='high';
    const x=size/2,y=size/2,ch=change(n.item),p=palette(ch);
    g.clearRect(0,0,size,size);
    g.shadowColor=p.glow;g.shadowBlur=pad*1.6;
    g.beginPath();g.arc(x,y,r,0,Math.PI*2);
    const grad=g.createRadialGradient(x-r*.28,y-r*.35,r*.05,x,y,r);
    grad.addColorStop(0,p.inner);grad.addColorStop(.68,p.outer);grad.addColorStop(1,'#020304');
    g.fillStyle=grad;g.fill();g.shadowBlur=0;

    g.lineWidth=Math.max(1,r*.03);g.strokeStyle='rgba(255,255,255,.08)';g.stroke();
    g.beginPath();g.arc(x,y,r-Math.max(1,r*.045),0,Math.PI*2);g.lineWidth=Math.max(.75,r*.018);g.strokeStyle=p.edge;g.stroke();
    g.beginPath();g.arc(x-r*.14,y-r*.20,r*.72,3.65,5.22);g.lineWidth=Math.max(.5,r*.013);g.strokeStyle='rgba(255,255,255,.12)';g.stroke();

    const big=r>30,mid=r>18;
    if(n.img&&n.img.complete&&n.img.naturalWidth){
      const sourceSmall=n.img.naturalWidth<40;
      const ir=big?Math.min(r*.25,sourceSmall?15:21):Math.min(r*.30,sourceSmall?10:14);
      const iy=y-(big?r*.28:0);
      g.save();g.beginPath();g.arc(x,iy,ir,0,Math.PI*2);g.clip();g.drawImage(n.img,Math.round(x-ir),Math.round(iy-ir),Math.round(ir*2),Math.round(ir*2));g.restore();
    }
    if(mid){
      g.textAlign='center';g.textBaseline='middle';g.shadowColor='rgba(0,0,0,.9)';g.shadowBlur=3;g.fillStyle='#f3f6f8';
      g.font=`900 ${clamp(r*.27,9,18)}px system-ui`;g.fillText(String(n.item.symbol||'').slice(0,7),x,y+(big?r*.08:0));
      if(big){
        g.fillStyle=p.text;g.font=`800 ${clamp(r*.18,8,12)}px system-ui`;
        g.fillText(ch==null?'—':`${ch>=0?'+':''}${ch.toFixed(Math.abs(ch)>=10?1:2)}%`,x,y+r*.37);
      }
    }
    g.shadowBlur=0;n.sprite={c,w:size,h:size};n.dirty=false;
  }

  function capSpeed(n){
    const max=.072,min=.026,s=Math.hypot(n.vx,n.vy)||0;
    if(s>max){n.vx=n.vx/s*max;n.vy=n.vy/s*max}
    else if(s<min){const a=Math.atan2(n.vy,n.vx)||n.phase;n.vx=Math.cos(a)*min;n.vy=Math.sin(a)*min}
  }

  function resolveCollisions(settle=false){
    const ns=S.nodes,w=stage.clientWidth,h=stage.clientHeight;
    for(let i=0;i<ns.length;i++){
      const a=ns[i];
      for(let j=i+1;j<ns.length;j++){
        const b=ns[j],dx=b.x-a.x,dy=b.y-a.y,min=a.r+b.r+.7,d2=dx*dx+dy*dy;
        if(d2>=min*min)continue;
        const d=Math.sqrt(d2)||.001,nx=dx/d,ny=dy/d,over=min-d;
        const wa=a===S.drag?0:1/Math.max(10,a.r),wb=b===S.drag?0:1/Math.max(10,b.r),sum=wa+wb||1;
        if(a!==S.drag){a.x-=nx*over*(wa/sum);a.y-=ny*over*(wa/sum)}
        if(b!==S.drag){b.x+=nx*over*(wb/sum);b.y+=ny*over*(wb/sum)}
        if(!settle){a.phase-=.006;b.phase+=.006}
      }
    }
    for(const n of ns){
      if(n.x<n.r){n.x=n.r;n.phase=Math.PI-n.phase}
      if(n.x>w-n.r){n.x=w-n.r;n.phase=Math.PI-n.phase}
      if(n.y<n.r){n.y=n.r;n.phase=-n.phase}
      if(n.y>h-n.r){n.y=h-n.r;n.phase=-n.phase}
    }
  }

  function physics(dt){
    const w=stage.clientWidth,h=stage.clientHeight,cx=w/2,cy=h/2;
    for(const n of S.nodes){
      if(n===S.drag)continue;
      n.phase+=n.turn*dt;
      const desired=.042;
      const tx=Math.cos(n.phase)*desired,ty=Math.sin(n.phase)*desired;
      n.vx+=(tx-n.vx)*.018*dt;n.vy+=(ty-n.vy)*.018*dt;
      n.vx+=(cx-n.x)*.0000008*dt;n.vy+=(cy-n.y)*.0000008*dt;
      capSpeed(n);
      n.x+=n.vx*dt;n.y+=n.vy*dt;
    }
    resolveCollisions(false);
  }

  function draw(){
    const w=stage.clientWidth,h=stage.clientHeight;
    ctx.setTransform(S.dpr,0,0,S.dpr,0,0);ctx.fillStyle='#010203';ctx.fillRect(0,0,w,h);
    const bg=ctx.createRadialGradient(w*.5,h*.42,20,w*.5,h*.42,Math.max(w,h)*.72);
    bg.addColorStop(0,'#0b0f13');bg.addColorStop(.54,'#040608');bg.addColorStop(1,'#010102');ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);

    ctx.save();
    ctx.translate(w/2+S.panX,h/2+S.panY);ctx.scale(S.zoom,S.zoom);ctx.translate(-w/2,-h/2);
    const sorted=[...S.nodes].sort((a,b)=>a.r-b.r);
    for(const n of sorted){if(n.dirty||!n.sprite)sprite(n);const s=n.sprite;ctx.drawImage(s.c,n.x-s.w/2,n.y-s.h/2,s.w,s.h)}
    ctx.restore();
  }

  function loop(ts){
    const dt=Math.min(1.35,(ts-S.last)/16.67||1);S.last=ts;physics(dt);draw();S.raf=requestAnimationFrame(loop);
  }

  function screenToWorld(px,py){
    const w=stage.clientWidth,h=stage.clientHeight;
    return{x:(px-w/2-S.panX)/S.zoom+w/2,y:(py-h/2-S.panY)/S.zoom+h/2};
  }
  function point(e){const r=canvas.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top}}
  function hit(x,y){for(let i=S.nodes.length-1;i>=0;i--){const n=S.nodes[i];if((x-n.x)**2+(y-n.y)**2<=n.r*n.r)return n}return null}

  function setZoom(z,screenX=stage.clientWidth/2,screenY=stage.clientHeight/2){
    const before=screenToWorld(screenX,screenY);S.zoom=clamp(z,.45,2.8);
    const after=screenToWorld(screenX,screenY);
    S.panX+=(after.x-before.x)*S.zoom;S.panY+=(after.y-before.y)*S.zoom;updateZoom();
  }
  function updateZoom(){$('reset').textContent=Math.round(S.zoom*100)+'%'}
  $('plus').onclick=()=>setZoom(S.zoom*1.18);
  $('minus').onclick=()=>setZoom(S.zoom/1.18);
  $('reset').onclick=()=>{S.zoom=1;S.panX=0;S.panY=0;updateZoom()};
  canvas.addEventListener('wheel',e=>{e.preventDefault();const p=point(e);setZoom(S.zoom*(e.deltaY<0?1.1:.91),p.x,p.y)},{passive:false});

  canvas.addEventListener('pointerdown',e=>{
    canvas.setPointerCapture?.(e.pointerId);const p=point(e);S.pointers.set(e.pointerId,p);
    if(S.pointers.size===2){
      const a=[...S.pointers.values()],dx=a[1].x-a[0].x,dy=a[1].y-a[0].y;
      S.gesture={dist:Math.hypot(dx,dy),zoom:S.zoom,cx:(a[0].x+a[1].x)/2,cy:(a[0].y+a[1].y)/2,panX:S.panX,panY:S.panY};S.drag=null;S.panDrag=null;return;
    }
    const w=screenToWorld(p.x,p.y),n=hit(w.x,w.y);
    if(n){S.drag=n;S.drag.down={x:w.x,y:w.y,sx:w.x,sy:w.y};n.vx=n.vy=0}
    else S.panDrag={sx:p.x,sy:p.y,px:S.panX,py:S.panY};
  });
  canvas.addEventListener('pointermove',e=>{
    if(!S.pointers.has(e.pointerId))return;const p=point(e);S.pointers.set(e.pointerId,p);
    if(S.pointers.size===2&&S.gesture){
      const a=[...S.pointers.values()],dx=a[1].x-a[0].x,dy=a[1].y-a[0].y,d=Math.hypot(dx,dy),cx=(a[0].x+a[1].x)/2,cy=(a[0].y+a[1].y)/2;
      S.zoom=clamp(S.gesture.zoom*(d/S.gesture.dist),.45,2.8);S.panX=S.gesture.panX+(cx-S.gesture.cx);S.panY=S.gesture.panY+(cy-S.gesture.cy);updateZoom();return;
    }
    if(S.drag){
      const w=screenToWorld(p.x,p.y);S.drag.x=clamp(w.x,S.drag.r,stage.clientWidth-S.drag.r);S.drag.y=clamp(w.y,S.drag.r,stage.clientHeight-S.drag.r);
    }else if(S.panDrag){S.panX=S.panDrag.px+(p.x-S.panDrag.sx);S.panY=S.panDrag.py+(p.y-S.panDrag.sy)}
  });
  function pointerEnd(e){
    const p=point(e),world=screenToWorld(p.x,p.y),n=S.drag,down=n?.down;
    S.pointers.delete(e.pointerId);
    if(S.pointers.size<2)S.gesture=null;
    if(n&&down&&Math.hypot(world.x-down.sx,world.y-down.sy)<8){show(n.item)}
    if(n){n.phase=hash((n.item.id||n.item.symbol)+Date.now())*Math.PI*2;n.vx=Math.cos(n.phase)*.04;n.vy=Math.sin(n.phase)*.04}
    S.drag=null;S.panDrag=null;
  }
  canvas.addEventListener('pointerup',pointerEnd);canvas.addEventListener('pointercancel',pointerEnd);

  function show(c){
    const ch=change(c),logo=logos(c)[0]||'',sheet=$('sheet');
    const f=v=>v==null?'—':`${v>=0?'+':''}${Number(v).toFixed(2)}%`;
    $('sheetBody').innerHTML=`<div class="coin">${logo?`<img src="${esc(logo)}" alt="">`:''}<div><small>${c.rank?'#'+c.rank:(c.kind||'').toUpperCase()}</small><h2>${esc(c.name)}</h2><b>${esc(c.symbol)}</b></div><strong class="${ch==null?'muted':ch>=0?'pos':'neg'}">${f(ch)}</strong></div><div class="stats"><div><span>${T('Цена','Price')}</span><b>${price(c.price)}</b></div><div><span>${T('Капитализация','Market cap')}</span><b>${money(c.marketCap)}</b></div><div><span>${T('Объём 24ч','24h volume')}</span><b>${money(c.volume24)}</b></div><div><span>5M</span><b>${f(c.change5m)}</b></div><div><span>15M</span><b>${f(c.change15m)}</b></div><div><span>1H</span><b>${f(c.change1h)}</b></div><div><span>1D</span><b>${f(c.change24h)}</b></div><div><span>1M</span><b>${f(c.change30d)}</b></div></div>`;
    sheet.classList.add('on');
  }

  new ResizeObserver(()=>resize()).observe(stage);
  resize();load();cancelAnimationFrame(S.raf);S.raf=requestAnimationFrame(loop);setInterval(load,60000);
})();
