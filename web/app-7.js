// NEXUS ALPHA clean loader — keep Jupiter trust for token details and boot the animated Retina market map.
var shortAddr = typeof short === 'function' ? short : (value => value ? `${String(value).slice(0,5)}…${String(value).slice(-4)}` : '—');
(function loadNexusClean(){
  if(window.__nexusCleanLoading)return;window.__nexusCleanLoading=true;
  const loadMap=()=>{if(window.__nexusCanvasMapLoaded)return;const m=document.createElement('script');m.src='./app-13.js?v=20260920-canvas-physics-v1';m.defer=true;document.body.appendChild(m)};
  if(window.__nexusJupiterUILoading){setTimeout(loadMap,180);return}
  window.__nexusJupiterUILoading=true;
  const s=document.createElement('script');s.src='./app-8.js?v=20260920-jupiter';s.defer=true;s.onload=loadMap;s.onerror=loadMap;document.body.appendChild(s);
})();
