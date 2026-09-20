function renderStats(){const s=state.data?.stats||{};$('statRate').textContent=s.perMinute??'—';$('statNew5').textContent=s.new5m!=null?`${s.new5m} / 5m`:'—';$('statTracked').textContent=s.tracked!=null?numFmt(s.tracked):'—';$('statCandidates').textContent=s.candidates??'—';$('statPrime').textContent=s.prime??'—';$('statRisk').textContent=s.criticalRisk??'—';$('statAlerts').textContent=s.alerts24h??'—'}

function filteredTokens(){
  let list=[...(state.data?.tokens||[])];const q=state.search.trim().toLowerCase();
  if(q)list=list.filter(x=>[x.name,x.symbol,x.mint].some(v=>String(v||'').toLowerCase().includes(q)));
  if(state.tier==='prime')list=list.filter(x=>x.tier==='prime');
  if(state.tier==='candidate')list=list.filter(x=>['prime','candidate'].includes(x.tier));
  if(state.tier==='new')list=list.filter(x=>x.ageMs<15*60000);
  if(state.tier==='watchlist')list=list.filter(x=>state.watchlist.has(x.mint));
  if(state.risk!=='all')list=list.filter(x=>x.riskLevel===state.risk);
  if(state.sort==='new')list.sort((a,b)=>(b.createdAt||b.discoveredAt)-(a.createdAt||a.discoveredAt));
  else if(state.sort==='liq')list.sort((a,b)=>(b.dex?.liquidityUsd||0)-(a.dex?.liquidityUsd||0));
  else if(state.sort==='vol')list.sort((a,b)=>(b.dex?.volumeH1||0)-(a.dex?.volumeH1||0));
  else list.sort((a,b)=>(b.score||0)-(a.score||0));
  return list;
}

function logoHtml(token){return token.image?`<img class="token-logo" src="${esc(token.image)}" alt="" loading="lazy" onerror="this.outerHTML='<span class=&quot;token-logo fallback&quot;>${esc((token.symbol||'?').slice(0,3))}</span>'">`:`<span class="token-logo fallback">${esc((token.symbol||'?').slice(0,3))}</span>`}
function socialDots(tk){return `<span class="social-dot ${tk.links?.website?'on':''}" title="web"></span><span class="social-dot ${tk.links?.twitter?'on':''}" title="x"></span><span class="social-dot ${tk.links?.telegram?'on':''}" title="tg"></span>`}
function riskClass(r){return ['low','medium','high','critical'].includes(r)?`risk-${r}`:''}
function holderDisplay(tk){if(tk.holders?.stage==='bonding-curve')return `<span class="num-main">CURVE</span><span class="num-sub">${pct(tk.holders.top10Pct)}</span>`;if(tk.holders?.top10Pct!=null)return `<span class="num-main">${pct(tk.holders.top10Pct)}</span><span class="num-sub">TOP 10</span>`;if(tk.security?.holderCount)return `<span class="num-main">${numFmt(tk.security.holderCount)}</span><span class="num-sub">holders</span>`;return '<span class="num-main">—</span>'}

function renderTokens(){
  const list=filteredTokens();$('visibleCount').textContent=list.length;const body=$('tokenBody');
  $('emptyState').classList.toggle('show',list.length===0);body.innerHTML='';
  if(!list.length)return;
  const frag=document.createDocumentFragment();
  list.forEach(tk=>{
    const tr=document.createElement('tr');tr.className=`token-row ${tk.tier||''}`;tr.dataset.mint=tk.mint;
    const buys=tk.dex?.buysM5||0,sells=tk.dex?.sellsM5||0;
    tr.innerHTML=`
      <td><button class="star-btn ${state.watchlist.has(tk.mint)?'on':''}" title="Watchlist">★</button></td>
      <td><div class="token-id">${logoHtml(tk)}<div class="token-name"><strong>${esc(tk.name||tk.symbol||short(tk.mint))}</strong><span>$${esc(tk.symbol||'—')} · ${socialDots(tk)}</span></div></div></td>
      <td><div class="score-cell"><span class="mini-score" style="--p:${tk.score||0}"><b>${tk.score??'—'}</b></span><span class="tier-label ${tk.tier||''}">${String(tk.tier||'raw').toUpperCase()}</span></div></td>
      <td><span class="num-main">${formatAge(tk.ageMs)}</span><span class="num-sub">${tk.pump?.complete?'graduated':'pump/new'}</span></td>
      <td><span class="num-main">${formatMoney(tk.dex?.marketCap||tk.pump?.marketCapUsd)}</span><span class="num-sub">${tk.dex?.changeM5?`${tk.dex.changeM5>0?'+':''}${tk.dex.changeM5.toFixed(1)}% 5m`:'—'}</span></td>
      <td><span class="num-main">${formatMoney(tk.dex?.liquidityUsd)}</span><span class="num-sub">${tk.dex?.dexId||'—'}</span></td>
      <td><span class="num-main">${formatMoney(tk.dex?.volumeH1)}</span><span class="num-sub">${numFmt(tk.dex?.txH1||0)} tx</span></td>
      <td><div class="flow"><span class="buy">▲${buys}</span><span class="sell">▼${sells}</span></div><span class="num-sub">${tk.dex?.txM5||0} tx</span></td>
      <td>${holderDisplay(tk)}</td>
      <td><span class="risk-pill ${riskClass(tk.riskLevel)}">${esc(tk.riskLevel||'unknown')}</span><span class="num-sub">${tk.risk??'—'}/100</span></td>
      <td><span class="signal-pill signal-${tk.tier||'raw'}">${esc((tk.tier||'raw').toUpperCase())}</span><span class="num-sub">${tk.cex?.binanceMention?'BINANCE MATCH':tk.dex?.boosts?`${tk.dex.boosts} boosts`:'—'}</span></td>`;
    tr.onclick=e=>{if(e.target.closest('.star-btn'))return;openToken(tk.mint)};
    tr.querySelector('.star-btn').onclick=()=>toggleWatch(tk.mint);
    frag.appendChild(tr)
  });body.appendChild(frag)
}

function toggleWatch(mint){if(state.watchlist.has(mint))state.watchlist.delete(mint);else state.watchlist.add(mint);localStorage.setItem('radar-watchlist',JSON.stringify([...state.watchlist]));renderTokens()}

function renderAlerts(){
  const list=(state.data?.alerts||[]).slice(0,30);const el=$('alertList');
  if(!list.length){el.innerHTML=`<div class="no-events">${esc(t('noEvents'))}</div>`;return}
  el.innerHTML=list.map(a=>`<article class="alert-item ${esc(a.severity||'')}" data-mint="${esc(a.mint||'')}"><i class="alert-sev"></i><div><div class="alert-meta"><b>${esc(a.symbol||a.type||'RADAR')}</b><span>${timeAgo(a.at)}</span></div><strong>${esc(alertTitle(a))}</strong><p>${esc(a.message||'')}</p></div></article>`).join('');
  el.querySelectorAll('.alert-item').forEach(x=>x.onclick=()=>x.dataset.mint&&openToken(x.dataset.mint))
}

function renderSources(){
  const sources=state.data?.sources||{};const el=$('sourceList');
  el.innerHTML=Object.entries(sources).map(([key,s])=>`<div class="source-row"><span class="source-name"><i class="${s.ok?'ok':''}"></i>${esc(s.label||key)}</span><span class="source-lat">${s.ok?(s.latency!=null?`${s.latency}ms`:t('online')):(s.lastOk?`${t('degraded')} · ${timeAgo(s.lastOk)}`:t('offline'))}</span></div>`).join('')||`<div class="no-events">${esc(t('connecting'))}</div>`
}

function renderAll(){applyStaticText();renderStats();renderTokens();renderAlerts();renderSources();updateConnection()}
function applyStaticText(){document.querySelectorAll('[data-i18n]').forEach(el=>{const k=el.dataset.i18n;if(I18N[state.lang][k])el.textContent=I18N[state.lang][k]});document.querySelectorAll('[data-i18n-placeholder]').forEach(el=>el.placeholder=t(el.dataset.i18nPlaceholder))}

