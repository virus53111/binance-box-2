// NEXUS ALPHA compatibility guard for rare nameless Extreme assets.
var shortAddr = typeof short === 'function' ? short : (value => value ? `${String(value).slice(0,5)}…${String(value).slice(-4)}` : '—');
// Older installed PWAs may execute this guard through app-6 and as its own script; load safety UI once.
if(!window.__nexusJupiterUILoading){window.__nexusJupiterUILoading=true;const s=document.createElement('script');s.src='./app-8.js?v=20260920-jupiter';s.defer=true;document.body.appendChild(s)}
