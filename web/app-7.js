// NEXUS ALPHA clean loader — animated market map only.
var shortAddr = typeof short === 'function' ? short : (value => value ? `${String(value).slice(0,5)}…${String(value).slice(-4)}` : '—');
(function loadNexusClean(){
  if(window.__nexusCleanLoading)return;window.__nexusCleanLoading=true;

  // app-1 defines API_BASE as a global lexical const, not window.API_BASE.
  // Expose the verified Render backend explicitly for the canvas map.
  try{window.API_BASE=(typeof API_BASE!=='undefined'&&API_BASE)||'https://murdilimax-live-earth-api.onrender.com'}catch{window.API_BASE='https://murdilimax-live-earth-api.onrender.com'}

  // MARKET MAP is the product UI now. Legacy SSE trading alerts must never create bottom popups.
  try{if(typeof showToast==='function')showToast=function(){};if(typeof handleAlert==='function')handleAlert=function(){}}catch{}
  document.getElementById('toastStack')?.remove();
  document.querySelectorAll('.toast,.toast-stack,.mexc-panel,.extreme-panel,.radar-mode-switch,#extremeWorkspace,#radarModeSwitch').forEach(el=>el.remove());
  document.title='NEXUS ALPHA — Live Crypto Market Map';

  const loadMap=()=>{if(window.__nexusCanvasMapLoaded)return;const m=document.createElement('script');m.src='./app-13.js?v=20260920-canvas-physics-v2';m.defer=true;document.body.appendChild(m)};
  if(window.__nexusJupiterUILoading){setTimeout(loadMap,120);return}
  window.__nexusJupiterUILoading=true;
  const s=document.createElement('script');s.src='./app-8.js?v=20260920-jupiter';s.defer=true;s.onload=loadMap;s.onerror=loadMap;document.body.appendChild(s);
})();
