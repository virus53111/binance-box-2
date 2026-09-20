// NEXUS ALPHA compatibility/power loader for installed PWAs and the focused radar UX.
var shortAddr = typeof short === 'function' ? short : (value => value ? `${String(value).slice(0,5)}…${String(value).slice(-4)}` : '—');
(function loadNexusLayers(){
  if(window.__nexusFocusedLayersLoading)return;window.__nexusFocusedLayersLoading=true;
  const loadFocused=()=>{if(window.__nexusFocusedLoaded)return;window.__nexusFocusedLoaded=true;const n=document.createElement('script');n.src='./app-9.js?v=20260920-vetted-mexc';n.defer=true;document.body.appendChild(n)};
  if(window.__nexusJupiterUILoading){setTimeout(loadFocused,450);return}
  window.__nexusJupiterUILoading=true;const s=document.createElement('script');s.src='./app-8.js?v=20260920-jupiter';s.defer=true;s.onload=loadFocused;s.onerror=loadFocused;document.body.appendChild(s);
})();
