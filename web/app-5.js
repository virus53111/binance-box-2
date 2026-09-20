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

setTimeout(refreshAlphaArchive, 1400);
setInterval(refreshAlphaArchive, 15000);
