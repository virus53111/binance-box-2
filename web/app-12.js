// NEXUS ALPHA — premium dense crypto bubble map. No MEXC/RAVE/PUMP-radar UI.
(function(){
  if(window.__nexusMarketMapLoaded)return;window.__nexusMarketMapLoaded=true;
  const MM={kind:'market',start:0,period:'24h',items:[],nodes:[],loading:false,updatedAt:0,total:0,refreshTimer:null};
  state.marketMap=MM;
  const ru=()=>state.lang==='ru';
  const tx=(a,b)=>ru()?a:b;
  const money=v=>{v=Number(v)||0;if(v>=1e12)return'$'+(v/1e12).toFixed(2)+'T';if(v>=1e9)return'$'+(v/1e9).toFixed(2)+'B';if(v>=1e6)return'$'+(v/1e6).toFixed(2)+'M';if(v>=1e3)return'$'+(v/1e3).toFixed(1)+'K';return'$'+v.toLocaleString(undefined,{maximumFractionDigits:2})};
  const price=v=>{v=Number(v)||0;if(!v)return'—';if(v>=1000)return'$'+v.toLocaleString(undefined,{maximumFractionDigits:2});if(v>=1)return'$'+v.toLocaleString(undefined,{maximumFractionDigits:4});if(v>=.01)return'$'+v.toFixed(5);return'$'+v.toPrecision(4)};
  const htmlEsc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  document.body.classList.add('nexus-map-only');

  // Remove legacy visual modules from this session as well as from future loads.
  document.getElementById('radarModeSwitch')?.remove();
  document.getElementById('extremeWorkspace')?.remove();
  document.querySelectorAll('.mexc-panel,.extreme-panel,.radar-mode-switch').forEach(x=>x.remove());

  const shell=document.querySelector('main.shell');
  if(!shell)return;
  const map=document.createElement('section');
  map.id='nexusMarketMap';map.className='nexus-market-map';
  map.innerHTML=`
    <div class="nm-top">
      <div class="nm-kinds" id="nmKinds">
        <button class="active" data-kind="market">${tx('РЫНОК','MARKET')}</button>
        <button data-kind="pump">PUMP.FUN</button>
        <button data-kind="dex">DEX VETTED</button>
        <button data-kind="precex">PRE-CEX</button>
      </div>
      <div class="nm-status"><i></i><span id="nmStatus">LIVE</span></div>
    </div>
    <div class="nm-ranks" id="nmRanks"></div>
    <div class="nm-heading">
      <div><small id="nmEyebrow">NEXUS MARKET MAP</small><h1 id="nmTitle">TOP #1–100</h1></div>
      <div class="nm-meta" id="nmMeta">—</div>
    </div>
    <div class="nm-stage" id="nmStage">
      <div class="nm-grid"></div>
      <div class="nm-bubbles" id="nmBubbles"></div>
      <div class="nm-loading" id="nmLoading"><span></span>${tx('ЗАГРУЖАЕМ РЫНОК','LOADING MARKET')}</div>
      <div class="nm-empty" id="nmEmpty"></div>
    </div>
    <div class="nm-bottom">
      <div class="nm-periods" id="nmPeriods">
        <button data-period="1h">1H</button><button class="active" data-period="24h">24H</button><button data-period="7d">7D</button>
      </div>
      <div class="nm-legend"><span class="up"></span>UP <span class="flat"></span>FLAT <span class="down"></span>DOWN</div>
    </div>
    <div class="nm-sheet" id="nmSheet"><button class="nm-sheet-close" id="nmSheetClose">×</button><div id="nmSheetBody"></div></div>`;
  shell.prepend(map);

  function buildRanks(){
    const box=document.getElementById('nmRanks');if(!box)return;
    box.innerHTML=Array.from({length:10},(_,i)=>`<button data-start="${i*100}" class="${i===0?'active':''}">${i*100+1}–${i*100+100}</button>`).join('');
    box.querySelectorAll('button').forEach(b=>b.onclick=()=>{MM.start=Number(b.dataset.start)||0;box.querySelectorAll('button').forEach(x=>x.classList.toggle('active',x===b));loadMap()});
  }
  buildRanks();

  document.querySelectorAll('#nmKinds button').forEach(b=>b.onclick=()=>{
    MM.kind=b.dataset.kind;document.querySelectorAll('#nmKinds button').forEach(x=>x.classList.toggle('active',x===b));
    document.getElementById('nmRanks').classList.toggle('hidden',MM.kind!=='market');loadMap();
  });
  document.querySelectorAll('#nmPeriods button').forEach(b=>b.onclick=()=>{MM.period=b.dataset.period;document.querySelectorAll('#nmPeriods button').forEach(x=>x.classList.toggle('active',x===b));render()});
  document.getElementById('nmSheetClose').onclick=()=>document.getElementById('nmSheet').classList.remove('show');

  function coinLogo(c){
    if(c.image)return c.image;
    if(c.logo)return c.logo;
    if(c.nameid)return`https://c2.coinlore.com/img/25x25/${encodeURIComponent(c.nameid)}.png`;
    return'';
  }
  function tokenToItem(tk,kind){
    const d=tk.dex||{},cap=Number(d.marketCap||d.fdv||tk.pump?.marketCapUsd||0)||0,liq=Number(d.liquidityUsd||0)||0;
    return{id:tk.mint,symbol:String(tk.symbol||'?').toUpperCase(),name:tk.name||tk.symbol||'Token',price:Number(d.priceUsd||0)||0,marketCap:cap||liq*2.5,volume24:Number(d.volumeH24||d.volumeH6||d.volumeH1||0)||0,change1h:Number(d.changeH1||d.changeM5||0)||0,change24h:Number(d.changeH24||d.change24h||d.changeH1||0)||0,change7d:Number(d.changeH24||d.change24h||0)||0,image:tk.image||tk.logo||'',liquidity:liq,raw:tk,kind};
  }
  function change(c){return Number(MM.period==='1h'?c.change1h:MM.period==='7d'?c.change7d:c.change24h)||0}
  function showLoad(v){document.getElementById('nmLoading')?.classList.toggle('show',v)}
  async function loadMap(){
    if(MM.loading)return;MM.loading=true;showLoad(true);document.getElementById('nmEmpty').textContent='';
    try{
      if(MM.kind==='market'){
        const r=await fetch(`${API_BASE}/api/market-map?start=${MM.start}&limit=100`,{cache:'no-store'});if(!r.ok)throw new Error(`HTTP ${r.status}`);const d=await r.json();MM.items=d.coins||[];MM.total=d.total||0;MM.updatedAt=d.generatedAt||Date.now();
      }else if(MM.kind==='pump'){
        const r=await fetch(`${API_BASE}/api/radar-v3?limit=600&maxAgeHours=24`,{cache:'no-store'});if(!r.ok)throw new Error(`HTTP ${r.status}`);const d=await r.json();MM.items=(d.tokens||[]).filter(t=>t.pump||String(t.source||'').toLowerCase().includes('pump')).map(t=>tokenToItem(t,'pump')).sort((a,b)=>b.marketCap-a.marketCap).slice(0,160);MM.updatedAt=d.generatedAt||Date.now();
      }else{
        const r=await fetch(`${API_BASE}/api/vetted?limit=400`,{cache:'no-store'});if(!r.ok)throw new Error(`HTTP ${r.status}`);const d=await r.json();let rows=d.tokens||[];if(MM.kind==='precex')rows=rows.filter(t=>t.vetted?.cex?.preCexCandidate||t.vetted?.cex?.projectClaimDetected);MM.items=rows.map(t=>tokenToItem(t,MM.kind)).sort((a,b)=>b.marketCap-a.marketCap).slice(0,160);MM.updatedAt=d.generatedAt||Date.now();
      }
      updateHead();render();
    }catch(e){MM.items=[];render();document.getElementById('nmEmpty').textContent=tx('Источник временно недоступен','Source temporarily unavailable')+' · '+e.message;}
    finally{MM.loading=false;showLoad(false)}
  }
  function updateHead(){
    const title=document.getElementById('nmTitle'),meta=document.getElementById('nmMeta'),eye=document.getElementById('nmEyebrow');
    if(MM.kind==='market'){title.textContent=`TOP #${MM.start+1}–${MM.start+100}`;eye.textContent='NEXUS MARKET MAP'}
    else if(MM.kind==='pump'){title.textContent='PUMP.FUN · LIVE';eye.textContent=tx('НОВЫЕ ТОКЕНЫ','NEW TOKENS')}
    else if(MM.kind==='dex'){title.textContent='DEX VETTED';eye.textContent=tx('ПРОВЕРЕННЫЕ DEX-АКТИВЫ','VETTED DEX ASSETS')}
    else {title.textContent='PRE-CEX';eye.textContent=tx('ЕЩЁ НЕ НА КРУПНЫХ CEX','NOT ON MAJOR CEX')}
    meta.textContent=`${MM.items.length} ${tx('активов','assets')} · ${new Date(MM.updatedAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}`;
  }

  function radiusSet(items,w,h){
    const vals=items.map(x=>Math.log10(Math.max(1,x.marketCap||x.liquidity||x.volume24||1))),lo=Math.min(...vals),hi=Math.max(...vals),count=Math.max(1,items.length);
    const unit=Math.sqrt((w*h)/count),mobile=w<620,minR=Math.max(mobile?8:10,unit*.27),maxR=Math.min(mobile?46:72,unit*(mobile?1.18:1.42));
    return items.map((x,i)=>{const v=vals[i],n=hi>lo?(v-lo)/(hi-lo):.5;return minR+(maxR-minR)*Math.pow(Math.max(0,Math.min(1,n)),.56)});
  }
  function hash(s){let h=2166136261;for(const c of String(s)){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return(h>>>0)/4294967295}
  function layout(items,w,h){
    if(!items.length)return[];const rs=radiusSet(items,w,h),cx=w/2,cy=h/2,golden=2.399963229728653;
    const nodes=items.map((item,i)=>{const a=i*golden+hash(item.id||item.symbol)*2.2,spread=Math.sqrt(i+1)*Math.min(w,h)*.027;return{item,r:rs[i],x:cx+Math.cos(a)*spread,y:cy+Math.sin(a)*spread,vx:0,vy:0}});
    nodes.sort((a,b)=>b.r-a.r);
    for(let k=0;k<230;k++){
      for(let i=0;i<nodes.length;i++){
        const a=nodes[i];a.vx+=(cx-a.x)*.0016;a.vy+=(cy-a.y)*.0012;
        for(let j=i+1;j<nodes.length;j++){
          const b=nodes[j],dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy)||.001,min=a.r+b.r+1.4;
          if(d<min){const force=(min-d)/d*.49,px=dx*force,py=dy*force;a.vx-=px;b.vx+=px;a.vy-=py;b.vy+=py}
        }
      }
      for(const n of nodes){n.vx*=.62;n.vy*=.62;n.x+=n.vx;n.y+=n.vy;n.x=Math.max(n.r+2,Math.min(w-n.r-2,n.x));n.y=Math.max(n.r+2,Math.min(h-n.r-2,n.y))}
    }
    return nodes;
  }
  function palette(ch){
    const a=Math.min(1,Math.abs(ch)/18);
    if(ch>.08)return{edge:`rgba(65,255,144,${.52+a*.4})`,fill:`rgba(${18+Math.round(a*16)},${72+Math.round(a*65)},${48+Math.round(a*34)},.88)`,glow:`rgba(45,255,130,${.13+a*.32})`,pct:'#91ffc5'};
    if(ch<-.08)return{edge:`rgba(255,82,104,${.5+a*.42})`,fill:`rgba(${83+Math.round(a*52)},${24+Math.round(a*15)},${35+Math.round(a*22)},.9)`,glow:`rgba(255,55,82,${.12+a*.3})`,pct:'#ff9aa9'};
    return{edge:'rgba(148,164,183,.32)',fill:'rgba(24,29,36,.94)',glow:'rgba(115,145,175,.09)',pct:'#aeb9c5'};
  }
  function render(){
    const stage=document.getElementById('nmStage'),box=document.getElementById('nmBubbles');if(!stage||!box)return;
    const w=Math.max(300,stage.clientWidth),h=Math.max(540,stage.clientHeight);MM.nodes=layout(MM.items,w,h);box.replaceChildren();
    if(!MM.items.length){document.getElementById('nmEmpty').textContent=tx('Сейчас здесь нет данных','No data here right now');return}else document.getElementById('nmEmpty').textContent='';
    const frag=document.createDocumentFragment();
    for(const n of MM.nodes){
      const c=n.item,ch=change(c),p=palette(ch),d=n.r*2,b=document.createElement('button');b.className='nm-bubble';b.type='button';
      b.style.cssText=`width:${d}px;height:${d}px;left:${n.x-n.r}px;top:${n.y-n.r}px;--edge:${p.edge};--fill:${p.fill};--glow:${p.glow};--pct:${p.pct};`;
      const logo=coinLogo(c),r=n.r;let inner='';
      if(logo&&r>=10)inner+=`<img src="${htmlEsc(logo)}" alt="" loading="lazy" onerror="this.style.display='none'">`;
      if(r>=19)inner+=`<strong>${htmlEsc(c.symbol.slice(0,r<27?5:8))}</strong>`;
      if(r>=27)inner+=`<span>${ch>=0?'+':''}${ch.toFixed(Math.abs(ch)>=100?0:1)}%</span>`;
      b.innerHTML=inner||`<strong>${htmlEsc(c.symbol.slice(0,4))}</strong>`;
      b.setAttribute('aria-label',`${c.name} ${ch>=0?'+':''}${ch.toFixed(2)}%`);b.onclick=()=>openItem(c);frag.appendChild(b);
    }
    box.appendChild(frag);
  }
  function openItem(c){
    if(c.raw&&typeof renderDetail==='function'){renderDetail(c.raw);return}
    const sheet=document.getElementById('nmSheet'),body=document.getElementById('nmSheetBody'),ch=change(c),logo=coinLogo(c);if(!sheet||!body)return;
    body.innerHTML=`<div class="nm-coin-head">${logo?`<img src="${htmlEsc(logo)}" alt="" onerror="this.style.display='none'">`:''}<div><small>#${c.rank||'—'}</small><h2>${htmlEsc(c.name)}</h2><b>${htmlEsc(c.symbol)}</b></div><strong class="${ch>=0?'pos':'neg'}">${ch>=0?'+':''}${ch.toFixed(2)}%</strong></div><div class="nm-info"><div><span>${tx('Цена','Price')}</span><b>${price(c.price)}</b></div><div><span>${tx('Капитализация','Market cap')}</span><b>${money(c.marketCap)}</b></div><div><span>${tx('Объём 24ч','24h volume')}</span><b>${money(c.volume24)}</b></div><div><span>1H</span><b>${Number(c.change1h)>=0?'+':''}${Number(c.change1h||0).toFixed(2)}%</b></div><div><span>24H</span><b>${Number(c.change24h)>=0?'+':''}${Number(c.change24h||0).toFixed(2)}%</b></div><div><span>7D</span><b>${Number(c.change7d)>=0?'+':''}${Number(c.change7d||0).toFixed(2)}%</b></div></div>`;
    sheet.classList.add('show');
  }

  const style=document.createElement('style');style.id='nexusMapPremiumStyle';style.textContent=`
    body.nexus-map-only{background:#030507!important;overflow-x:hidden}.nexus-map-only .noise,.nexus-map-only .aurora{display:none!important}
    .nexus-map-only .hero-strip,.nexus-map-only #marketRegimeBar,.nexus-map-only #statGrid,.nexus-map-only .control-deck,.nexus-map-only .workspace,.nexus-map-only .seo-about,.nexus-map-only .truth-bar,.nexus-map-only #extremeWorkspace,.nexus-map-only .radar-mode-switch{display:none!important}
    .nexus-map-only .shell{width:100%;max-width:none;padding:0!important;margin:0!important}.nexus-map-only .topbar{background:rgba(3,5,7,.94)!important;border-bottom:1px solid rgba(255,255,255,.07)!important;backdrop-filter:blur(18px);position:sticky;top:0;z-index:50}.nexus-map-only #methodBtn{display:none!important}
    .nexus-market-map{width:100%;min-height:calc(100dvh - 72px);background:radial-gradient(circle at 50% 20%,rgba(19,35,43,.28),transparent 36%),#030507;color:#f6f8fb;padding:9px 10px 12px;box-sizing:border-box}
    .nm-top{display:flex;align-items:center;justify-content:space-between;gap:8px;max-width:1500px;margin:0 auto 7px}.nm-kinds{display:flex;gap:6px;overflow:auto;scrollbar-width:none}.nm-kinds::-webkit-scrollbar,.nm-ranks::-webkit-scrollbar{display:none}.nm-kinds button,.nm-ranks button,.nm-periods button{border:1px solid rgba(255,255,255,.09);background:#090d12;color:#8693a2;border-radius:999px;padding:8px 12px;font-size:10px;font-weight:800;letter-spacing:.04em;white-space:nowrap}.nm-kinds button.active{color:#fff;border-color:rgba(80,240,184,.42);background:linear-gradient(180deg,rgba(37,105,82,.3),rgba(12,29,24,.45));box-shadow:0 0 18px rgba(64,255,178,.08)}.nm-status{display:flex;align-items:center;gap:6px;font-size:9px;font-weight:900;color:#64efb3;letter-spacing:.1em}.nm-status i{width:6px;height:6px;border-radius:50%;background:#55f0ad;box-shadow:0 0 10px #55f0ad}
    .nm-ranks{max-width:1500px;margin:0 auto 5px;display:flex;gap:5px;overflow:auto;padding-bottom:2px}.nm-ranks.hidden{display:none}.nm-ranks button{padding:6px 10px;font-size:9px}.nm-ranks button.active{color:#dffef3;border-color:rgba(94,226,255,.34);background:rgba(66,184,220,.1)}
    .nm-heading{max-width:1500px;margin:0 auto 4px;display:flex;align-items:end;justify-content:space-between;padding:0 4px}.nm-heading small{font-size:8px;letter-spacing:.22em;color:#5ee7ff;font-weight:900}.nm-heading h1{font-size:17px;line-height:1;margin:4px 0 0;letter-spacing:.02em}.nm-meta{font-size:8px;color:#6f7c89;white-space:nowrap}
    .nm-stage{position:relative;max-width:1500px;margin:0 auto;height:calc(100dvh - 235px);min-height:570px;max-height:980px;overflow:hidden;border-radius:14px;background:radial-gradient(circle at 50% 45%,rgba(20,31,38,.45),rgba(3,5,7,.92) 57%,#020304 100%);border:1px solid rgba(255,255,255,.055);box-shadow:inset 0 0 90px rgba(0,0,0,.72),0 12px 40px rgba(0,0,0,.25)}.nm-grid{position:absolute;inset:0;opacity:.16;background-image:linear-gradient(rgba(255,255,255,.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.025) 1px,transparent 1px);background-size:42px 42px;mask-image:radial-gradient(circle,#000 20%,transparent 86%)}.nm-bubbles{position:absolute;inset:0}
    .nm-bubble{position:absolute;border:0;border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;overflow:hidden;cursor:pointer;color:#fff;background:radial-gradient(circle at 36% 28%,rgba(255,255,255,.075),transparent 27%),var(--fill);box-shadow:inset 0 0 0 1.3px var(--edge),inset 0 0 18px rgba(255,255,255,.025),0 0 15px var(--glow);transition:transform .12s ease,filter .12s ease;will-change:transform}.nm-bubble:active{transform:scale(.92)}.nm-bubble:hover{filter:brightness(1.18);z-index:5}.nm-bubble img{width:30%;height:30%;max-width:27px;max-height:27px;min-width:10px;min-height:10px;border-radius:50%;object-fit:cover;margin-bottom:1px;filter:drop-shadow(0 1px 2px rgba(0,0,0,.55))}.nm-bubble strong{font-size:clamp(7px,1.5vw,15px);line-height:1;font-weight:900;text-shadow:0 1px 3px #000;max-width:88%;overflow:hidden;text-overflow:ellipsis}.nm-bubble span{font-size:clamp(6px,1.25vw,12px);line-height:1;color:var(--pct);font-weight:850;text-shadow:0 1px 2px #000}
    .nm-loading{position:absolute;inset:0;display:none;align-items:center;justify-content:center;gap:9px;background:rgba(3,5,7,.68);z-index:8;font-size:10px;letter-spacing:.12em;color:#93a5b5;backdrop-filter:blur(2px)}.nm-loading.show{display:flex}.nm-loading span{width:13px;height:13px;border:2px solid rgba(93,228,255,.18);border-top-color:#5de4ff;border-radius:50%;animation:nmspin .7s linear infinite}@keyframes nmspin{to{transform:rotate(360deg)}}.nm-empty{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);font-size:10px;color:#6f7d89;text-align:center;pointer-events:none}
    .nm-bottom{max-width:1500px;margin:7px auto 0;display:flex;align-items:center;justify-content:space-between;gap:10px}.nm-periods{display:flex;gap:6px}.nm-periods button{min-width:58px;border-radius:9px;font-size:11px}.nm-periods button.active{color:#fff;background:#e85058;border-color:#e85058;box-shadow:0 0 18px rgba(232,80,88,.18)}.nm-legend{font-size:8px;color:#687481;display:flex;align-items:center;gap:5px}.nm-legend span{width:7px;height:7px;border-radius:50%}.nm-legend .up{background:#52efad;box-shadow:0 0 7px #52efad}.nm-legend .flat{background:#788593}.nm-legend .down{background:#f65a72;box-shadow:0 0 7px #f65a72}
    .nm-sheet{position:fixed;z-index:90;left:50%;bottom:14px;width:min(560px,calc(100% - 20px));transform:translate(-50%,125%);opacity:0;border:1px solid rgba(255,255,255,.1);border-radius:18px;background:rgba(8,12,17,.97);box-shadow:0 18px 70px rgba(0,0,0,.65);padding:18px;box-sizing:border-box;transition:.22s ease;backdrop-filter:blur(24px)}.nm-sheet.show{transform:translate(-50%,0);opacity:1}.nm-sheet-close{position:absolute;right:10px;top:8px;background:none;border:0;color:#8996a3;font-size:25px}.nm-coin-head{display:grid;grid-template-columns:auto 1fr auto;gap:10px;align-items:center;padding-right:24px}.nm-coin-head img{width:42px;height:42px;border-radius:50%}.nm-coin-head small,.nm-coin-head b{display:block;color:#768493;font-size:9px}.nm-coin-head h2{margin:2px 0;font-size:19px}.nm-coin-head>strong{font-size:18px}.nm-coin-head .pos{color:#62efb4}.nm-coin-head .neg{color:#ff7185}.nm-info{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-top:15px}.nm-info>div{border:1px solid rgba(255,255,255,.07);background:rgba(255,255,255,.018);padding:9px;border-radius:10px}.nm-info span{display:block;font-size:7px;color:#6e7a87;text-transform:uppercase}.nm-info b{display:block;margin-top:4px;font-size:11px}
    @media(max-width:760px){.nexus-map-only .topbar{padding:10px 12px}.nexus-map-only .brand-copy small{display:none}.nexus-map-only .latency-chip{display:none}.nexus-market-map{padding:7px 6px 10px}.nm-top{margin-bottom:5px}.nm-kinds button{padding:7px 10px;font-size:9px}.nm-ranks{margin-bottom:3px}.nm-ranks button{padding:5px 9px}.nm-heading{padding:0 2px}.nm-heading h1{font-size:15px}.nm-heading small{font-size:7px}.nm-stage{height:calc(100dvh - 220px);min-height:520px;border-radius:10px}.nm-bubble strong{font-size:9px}.nm-bubble span{font-size:7px}.nm-bottom{margin-top:5px}.nm-periods button{min-width:49px;padding:7px 10px}.nm-legend{display:none}.nm-info{grid-template-columns:repeat(2,1fr)}}
  `;document.head.appendChild(style);

  let resizeTimer;window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(render,140)});
  document.getElementById('langBtn')?.addEventListener('click',()=>setTimeout(()=>{document.querySelector('#nmKinds [data-kind="market"]').textContent=tx('РЫНОК','MARKET');updateHead()},80));
  document.title='NEXUS ALPHA — Live Crypto Market Map';
  const md=document.querySelector('meta[name="description"]');if(md)md.content='NEXUS ALPHA — interactive live crypto market map with top 1–1000, Pump.fun, vetted DEX and PRE-CEX views.';
  loadMap();MM.refreshTimer=setInterval(loadMap,60_000);
})();
