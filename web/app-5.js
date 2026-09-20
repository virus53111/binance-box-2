// Preserve the 7-day Alpha Radar universe across the legacy fast live refresh.
state.alphaExtendedTokens = state.alphaExtendedTokens || [];
const alphaArchiveRenderAllBase = renderAll;
renderAll = function renderAllWithAlphaArchive() {
  if (state.alphaExtendedTokens.length && state.data?.tokens) {
    const current = new Map(state.data.tokens.map(token => [token.mint, token]));
    for (const archived of state.alphaExtendedTokens) {
      const live = current.get(archived.mint);
      if (live) {
        if (!live.intel && archived.intel) live.intel = archived.intel;
      } else {
        state.data.tokens.push(archived);
      }
    }
  }
  return alphaArchiveRenderAllBase();
};

async function refreshAlphaArchive() {
  try {
    const response = await fetch(`${API_BASE}/api/radar?limit=300&maxAgeHours=168`, { cache:'no-store' });
    if (!response.ok) return;
    const payload = await response.json();
    const existingIntel = new Map((state.data?.tokens || []).filter(token => token.intel).map(token => [token.mint, token.intel]));
    state.alphaExtendedTokens = (payload.tokens || []).map(token => ({ ...token, intel: existingIntel.get(token.mint) || token.intel || null }));
    if (!state.data) state.data = payload;
    else {
      state.data.stats = payload.stats || state.data.stats;
      state.data.sources = payload.sources || state.data.sources;
      state.data.alerts = payload.alerts || state.data.alerts;
    }
    renderAll();
    if (typeof refreshIntel === 'function') refreshIntel().catch(()=>{});
  } catch {}
}

state.marketRegimeRich = state.marketRegimeRich || null;
const alphaRichRegimeRenderer = renderMarketRegimeV2;
renderMarketRegimeV2 = function renderNexusRichRegime() {
  const current = state.marketRegime;
  if (current && typeof current === 'object' && current.updatedAt) state.marketRegimeRich = current;
  if ((!current || typeof current !== 'object' || !current.updatedAt) && state.marketRegimeRich) {
    state.marketRegime = state.marketRegimeRich;
    try { return alphaRichRegimeRenderer(); }
    finally { state.marketRegime = current; }
  }
  return alphaRichRegimeRenderer();
};

async function refreshNexusRichRegime() {
  try {
    const response = await fetch(`${API_BASE}/api/market-regime-v2`, { cache:'no-store' });
    if (!response.ok) return;
    const payload = await response.json();
    if (!payload?.regime || typeof payload.regime !== 'object') return;
    state.marketRegimeRich = payload.regime;
    state.marketRegime = payload.regime;
    renderMarketRegimeV2();
  } catch {}
}

// Reliability + project-channel signal UX.
Object.assign(I18N.ru,{projectNews:'PROJECT NEWS',noFiltered:'Сейчас подходящих токенов нет.',noPrime:'Сейчас нет токенов, прошедших строгий PRIME-порог. Радар продолжает наблюдение.',noPreCex:'Сейчас нет PRE-CEX сигналов. Мониторинг официальных каналов проектов и CEX продолжается.',noProjectNews:'Новых заявлений о листинге в каналах проектов пока нет.',projectClaim:'ЗАЯВЛЕНИЕ ПРОЕКТА',notCexConfirmed:'НЕ ПОДТВЕРЖДЕНО CEX',intelUnavailable:'Источник временно недоступен — это не считается отсутствием сигнала.'});
Object.assign(I18N.en,{projectNews:'PROJECT NEWS',noFiltered:'No matching tokens right now.',noPrime:'No token currently passes the strict PRIME threshold. Monitoring continues.',noPreCex:'No PRE-CEX signal right now. Project-channel and CEX monitoring continues.',noProjectNews:'No new listing claims detected in project channels yet.',projectClaim:'PROJECT CLAIM',notCexConfirmed:'NOT CEX CONFIRMED',intelUnavailable:'Source temporarily unavailable — this is not treated as absence of a signal.'});

function nexusEmptyMessage(){if(!state.connected)return t('connecting');if(state.tier==='prime')return t('noPrime');if(state.tier==='precex')return t('noPreCex');if(state.tier==='projectnews')return t('noProjectNews');return t('noFiltered')}
const nexusRenderTokensBase=renderTokens;
renderTokens=function(){nexusRenderTokensBase();const list=filteredTokens(),box=$('emptyState');if(!box)return;if(!list.length){box.classList.add('show');box.innerHTML=state.connected?`<div class="empty-radar-mark">◎</div><strong>${esc(nexusEmptyMessage())}</strong><span>${state.intelUpdatedAt?`${state.lang==='ru'?'Последний intelligence refresh':'Last intelligence refresh'}: ${timeAgo(state.intelUpdatedAt)}`:esc(t('noFake'))}</span>`:`<div class="spinner"></div><strong>${esc(t('connecting'))}</strong><span>${esc(t('noFake'))}</span>`}};

const nexusEnsureControlsBase=ensureExtraControls;
ensureExtraControls=function(){nexusEnsureControlsBase();const filters=$('tierFilters');if(filters&&!filters.querySelector('[data-tier="projectnews"]'))filters.insertAdjacentHTML('beforeend',`<button class="filter" data-tier="projectnews">⚡ ${esc(t('projectNews'))}</button>`);if(filters)filters.querySelectorAll('.filter').forEach(btn=>btn.onclick=()=>{filters.querySelectorAll('.filter').forEach(x=>x.classList.remove('active'));btn.classList.add('active');state.tier=btn.dataset.tier;renderTokens()})};
const nexusFilteredTokensBase=filteredTokens;
filteredTokens=function(){let list=nexusFilteredTokensBase();if(state.tier==='projectnews')list=list.filter(x=>x.intel?.cex?.projectClaimDetected);return list};

const nexusRenderDetailIntelBase=renderDetailIntelV2;
renderDetailIntelV2=function(root,data){nexusRenderDetailIntelBase(root,data);const signals=data?.cex?.signals||[];root.querySelectorAll('.listing-signal').forEach((el,i)=>{const s=signals[i];if(!s?.projectClaim)return;el.classList.add('project-claim');const head=el.querySelector('div');if(head)head.insertAdjacentHTML('beforeend',`<span class="project-claim-badge">${esc(t('projectClaim'))} · ${esc(t('notCexConfirmed'))}</span>`)});const status=root.querySelector('#alphaCexContent .cex-status');if(status&&data?.cex?.projectClaimDetected)status.insertAdjacentHTML('afterend',`<p class="project-caution">⚡ ${esc(state.lang==='ru'?'Ранний сигнал найден в канале, который сам проект указал как свой. Это важнее слуха, но всё ещё не является подтверждением биржи.':'Early signal found in a channel supplied by the project itself. Stronger than a rumor, but still not exchange confirmation.')}</p>`)};

const nexusRenderDetailBase=renderDetail;
renderDetail=function(tk){nexusRenderDetailBase(tk);const mint=tk.mint;setTimeout(()=>{if(state.selectedMint!==mint)return;const root=$('drawerContent');root?.querySelectorAll('#alphaSetupContent .chart-loading,#alphaFlowContent .chart-loading,#alphaCexContent .chart-loading').forEach(el=>{el.outerHTML=`<p class="drawer-note">${esc(t('intelUnavailable'))}</p>`})},12000)};

const nexusAlertTitleBase=alertTitle;
alertTitle=function(a){if(a?.title==='PROJECT_LISTING_CLAIM')return state.lang==='ru'?'Проект сообщил о будущем листинге':'Project future-listing claim';return nexusAlertTitleBase(a)};

setTimeout(refreshAlphaArchive, 1400);
setInterval(refreshAlphaArchive, 15000);
setTimeout(refreshNexusRichRegime, 1800);
setInterval(refreshNexusRichRegime, 60000);
setTimeout(ensureExtraControls,300);
