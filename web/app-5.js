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

// The backend keeps a simple legacy /api/market-regime route for compatibility.
// NEXUS ALPHA uses the richer v2 route (EMA trend, BTC/SOL relative strength,
// volatility and risk-on/risk-off context) and protects it from legacy refreshes.
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

setTimeout(refreshAlphaArchive, 1400);
setInterval(refreshAlphaArchive, 15000);
setTimeout(refreshNexusRichRegime, 1800);
setInterval(refreshNexusRichRegime, 60000);
