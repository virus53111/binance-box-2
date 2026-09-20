// NEXUS ALPHA compatibility guard for rare nameless Extreme assets.
var shortAddr = typeof short === 'function' ? short : (value => value ? `${String(value).slice(0,5)}…${String(value).slice(-4)}` : '—');
// Keep the HTML stable while loading the safety layer after all core modules are ready.
(()=>{const s=document.createElement('script');s.src='./app-8.js?v=20260920-jupiter';s.defer=true;document.body.appendChild(s)})();
