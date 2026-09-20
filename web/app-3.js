function sparkline(points,key='mc'){
  const vals=(points||[]).map(p=>Number(p[key])||0).filter(v=>v>=0);if(vals.length<2)return `<div class="no-events">${esc(t('noTimeline'))}</div>`;
  const min=Math.min(...vals),max=Math.max(...vals),range=Math.max(max-min,1);const w=520,h=72;
  const coords=vals.map((v,i)=>`${(i/(vals.length-1))*w},${h-((v-min)/range)*(h-10)-5}`).join(' ');
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><defs><linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5de4ff" stop-opacity=".18"/><stop offset="1" stop-color="#5de4ff" stop-opacity="0"/></linearGradient></defs><polyline points="${coords}" fill="none" stroke="#5de4ff" stroke-width="1.7" vector-effect="non-scaling-stroke"/><polygon points="0,${h} ${coords} ${w},${h}" fill="url(#area)"/></svg>`
}

async function openToken(mint){
  state.selectedMint=mint;$('tokenDrawer').classList.add('open');$('drawerBackdrop').classList.add('open');$('tokenDrawer').setAttribute('aria-hidden','false');$('drawerContent').innerHTML=`<div class="loading-detail"><div><div class="spinner"></div><p>${esc(t('loading'))}</p></div></div>`;
  try{const res=await fetch(`${API_BASE}/api/token/${encodeURIComponent(mint)}`,{cache:'no-store'});if(!res.ok)throw new Error(`HTTP ${res.status}`);const data=await res.json();if(state.selectedMint===mint)renderDetail(data.token)}catch(e){if(state.selectedMint===mint)$('drawerContent').innerHTML=`<div class="loading-detail"><div><strong>${esc(t('unavailable'))}</strong><p>${esc(e.message)}</p></div></div>`}
}
function closeDrawer(){state.selectedMint=null;$('tokenDrawer').classList.remove('open');$('drawerBackdrop').classList.remove('open');$('tokenDrawer').setAttribute('aria-hidden','true')}

function renderDetail(tk){
  const parts=tk.scoreParts||{};const holderTop=tk.holders?.top||[];const links=[];
  if(tk.links?.website)links.push([t('website'),tk.links.website]);if(tk.links?.twitter)links.push([t('twitter'),tk.links.twitter]);if(tk.links?.telegram)links.push([t('telegram'),tk.links.telegram]);if(tk.dex?.url)links.push([t('dex'),tk.dex.url]);links.push([t('pump'),`https://pump.fun/coin/${tk.mint}`],[t('solscan'),`https://solscan.io/token/${tk.mint}`]);
  const scores=[['market',parts.market,20],['momentum',parts.momentum,20],['security',parts.security,20],['distribution',parts.distribution,20],['transparency',parts.transparency,15],['attention',parts.attention,5]];
  const flags=(tk.flags||[]).map(k=>`<span class="flag">${esc(flagLabels[state.lang][k]||k)}</span>`).join('')||`<span class="num-sub">—</span>`;
  const reasons=(tk.reasons||[]).map(k=>`<span class="flag reason">${esc(reasonLabels[state.lang][k]||k)}</span>`).join('')||`<span class="num-sub">—</span>`;
  const cex=(tk.cex?.mentions||[]).map(m=>`<div class="cex-mention"><strong>Binance</strong><br>${esc(m.title||'')}</div>`).join('');
  $('drawerContent').innerHTML=`
    <section class="drawer-hero"><div class="drawer-token">${logoHtml(tk)}<div><h2>${esc(tk.name||tk.symbol||short(tk.mint))} <span style="color:#66758a;font-size:12px">$${esc(tk.symbol||'')}</span></h2><p>${esc(tk.description||'')}</p></div></div><div class="contract-line"><code class="contract">${esc(tk.mint)}</code><button class="copy-btn" id="copyMint">${esc(t('copy'))}</button><span class="risk-pill ${riskClass(tk.riskLevel)}">${esc(tk.riskLevel||'unknown')} · ${tk.risk??'—'}</span></div></section>
    <section class="drawer-score-grid"><div class="big-score" style="--p:${tk.score||0}"><div><strong>${tk.score??'—'}</strong><span>${esc(t('score').toUpperCase())}</span></div></div><div class="score-bars">${scores.map(([k,v,max])=>`<div class="score-bar"><span>${esc(t(k))}</span><span class="track"><i style="width:${Math.min(100,(Number(v)||0)/max*100)}%"></i></span><b>${v??0}</b></div>`).join('')}</div></section>
    <section class="drawer-section"><h3>${esc(t('marketData'))}</h3><div class="metric-grid">
      <div class="metric-box"><span>${esc(t('price'))}</span><strong>${formatPrice(tk.dex?.priceUsd)}</strong><small>${tk.dex?.changeM5?`${tk.dex.changeM5>0?'+':''}${tk.dex.changeM5.toFixed(1)}% / 5m`:'—'}</small></div>
      <div class="metric-box"><span>${esc(t('marketCap'))}</span><strong>${formatMoney(tk.dex?.marketCap||tk.pump?.marketCapUsd)}</strong><small>FDV ${formatMoney(tk.dex?.fdv)}</small></div>
      <div class="metric-box"><span>${esc(t('liquidity'))}</span><strong>${formatMoney(tk.dex?.liquidityUsd)}</strong><small>${esc(tk.dex?.dexId||'—')}</small></div>
      <div class="metric-box"><span>${esc(t('volume1h'))}</span><strong>${formatMoney(tk.dex?.volumeH1)}</strong><small>${numFmt(tk.dex?.txH1||0)} tx</small></div>
      <div class="metric-box"><span>${esc(t('tx5m'))}</span><strong>${numFmt(tk.dex?.txM5||0)}</strong><small><span style="color:#65f2b4">▲${tk.dex?.buysM5||0}</span> / <span style="color:#ff6476">▼${tk.dex?.sellsM5||0}</span></small></div>
      <div class="metric-box"><span>${esc(t('boosts'))}</span><strong>${numFmt(tk.dex?.boosts||0)}</strong><small>${formatAge(tk.ageMs)}</small></div>
    </div><div class="spark-wrap">${sparkline(tk.timeline,'mc')}</div></section>
    <section class="drawer-section"><h3>${esc(t('holderIntel'))}</h3><div class="metric-grid"><div class="metric-box"><span>${esc(t('top1'))}</span><strong>${pct(tk.holders?.top1Pct)}</strong></div><div class="metric-box"><span>${esc(t('top5'))}</span><strong>${pct(tk.holders?.top5Pct)}</strong></div><div class="metric-box"><span>${esc(t('top10'))}</span><strong>${pct(tk.holders?.top10Pct||tk.security?.top10Pct)}</strong></div></div>${tk.holders?.stage==='bonding-curve'?`<p class="drawer-note">${esc(t('holderBonding'))}</p>`:''}${holderTop.length?`<div class="holder-list" style="margin-top:12px">${holderTop.map((h,i)=>`<div class="holder-row"><code>#${i+1} ${esc(short(h.owner||h.tokenAccount))}</code><b>${pct(h.pct)}</b><span class="holder-meter"><i style="width:${Math.min(100,h.pct*3)}%"></i></span></div>`).join('')}</div>`:''}</section>
    <section class="drawer-section"><h3>${esc(t('securityChecks'))}</h3><div class="metric-grid"><div class="metric-box"><span>${esc(t('mintAuth'))}</span><strong style="color:${tk.chain?(!tk.chain.mintAuthority?'#65f2b4':'#ff6476'):'#718097'}">${tk.chain?(tk.chain.mintAuthority?t('active'):t('revoked')):t('unavailable')}</strong><small>${tk.chain?.mintAuthority?short(tk.chain.mintAuthority):''}</small></div><div class="metric-box"><span>${esc(t('freezeAuth'))}</span><strong style="color:${tk.chain?(!tk.chain.freezeAuthority?'#65f2b4':'#ff6476'):'#718097'}">${tk.chain?(tk.chain.freezeAuthority?t('active'):t('revoked')):t('unavailable')}</strong><small>${tk.chain?.freezeAuthority?short(tk.chain.freezeAuthority):''}</small></div><div class="metric-box"><span>GoPlus</span><strong>${tk.security?.available?'CHECKED':t('unavailable')}</strong><small>${tk.security?.holderCount?`${numFmt(tk.security.holderCount)} holders`:''}</small></div></div><h3 style="margin-top:16px">${esc(t('flags'))}</h3><div class="flag-wrap">${flags}</div></section>
    <section class="drawer-section"><h3>${esc(t('creatorIntel'))}</h3><div class="metric-grid"><div class="metric-box"><span>${esc(t('projects'))}</span><strong>${tk.creatorStats?.projectCount??'—'}</strong><small>${tk.creator?short(tk.creator):'—'}</small></div><div class="metric-box"><span>${esc(t('completed'))}</span><strong>${tk.creatorStats?.completed??'—'}</strong></div><div class="metric-box"><span>${esc(t('created24'))}</span><strong>${tk.creatorStats?.created24h??'—'}</strong><small>${tk.creatorStats?.serialDeployer?t('serial'):''}</small></div></div></section>
    <section class="drawer-section"><h3>${esc(t('reasons'))}</h3><div class="flag-wrap">${reasons}</div></section>
    <section class="drawer-section"><h3>${esc(t('cexWatch'))}</h3>${cex||`<p class="drawer-note">${esc(t('noCex'))}</p>`}<p class="drawer-note">${esc(t('cexCaution'))}</p></section>
    <section class="drawer-section"><h3>${esc(t('links'))}</h3><div class="link-row">${links.map(([label,url])=>`<a class="out-link" target="_blank" rel="noopener noreferrer" href="${esc(url)}">${esc(label)} ↗</a>`).join('')}</div></section>`;
  $('copyMint').onclick=async()=>{await navigator.clipboard.writeText(tk.mint);$('copyMint').textContent=t('copied');setTimeout(()=>{if($('copyMint'))$('copyMint').textContent=t('copy')},1200)}
}

function bind(){
  $('langBtn').onclick=()=>{state.lang=state.lang==='ru'?'en':'ru';localStorage.setItem('radar-lang',state.lang);applyLang()};
  $('soundBtn').onclick=()=>{state.sound=!state.sound;localStorage.setItem('radar-sound',state.sound?'on':'off');if(state.sound){initAudio();beep('important')}updateSoundButton()};
  $('searchInput').oninput=e=>{state.search=e.target.value;renderTokens()};
  $('riskSelect').onchange=e=>{state.risk=e.target.value;renderTokens()};
  $('sortSelect').onchange=e=>{state.sort=e.target.value;renderTokens()};
  $('tierFilters').querySelectorAll('.filter').forEach(btn=>btn.onclick=()=>{$('tierFilters').querySelectorAll('.filter').forEach(x=>x.classList.remove('active'));btn.classList.add('active');state.tier=btn.dataset.tier;renderTokens()});
  $('drawerClose').onclick=closeDrawer;$('drawerBackdrop').onclick=closeDrawer;
  $('methodBtn').onclick=()=>$('methodModal').classList.add('open');$('methodClose').onclick=()=>$('methodModal').classList.remove('open');$('methodModal').onclick=e=>{if(e.target===$('methodModal'))$('methodModal').classList.remove('open')};
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeDrawer();$('methodModal').classList.remove('open')}})
}

bind();applyLang();fetchRadar();connectEvents();setInterval(fetchRadar,10000);setInterval(()=>{if(state.data){renderTokens();renderAlerts();updateConnection()}},15000);
