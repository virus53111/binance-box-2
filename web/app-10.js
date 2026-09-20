// NEXUS ALPHA focused-mode stability patch: keep VETTED stats and labels authoritative after legacy live refreshes.
(function(){
  const renderVettedStatsStable=function(){
    if(state.radarMode!=='vetted')return;
    const list=state.vettedTokens||[];
    const pre=list.filter(x=>x.vetted?.cex?.preCexCandidate||x.vetted?.cex?.projectClaimDetected).length;
    const acc=list.filter(x=>(x.vetted?.setup?.accumulationPressure||0)>=65).length;
    const avg=list.length?Math.round(list.reduce((s,x)=>s+(x.vetted?.ageDays||0),0)/list.length):0;
    const cards=document.querySelectorAll('#statGrid .stat-card');
    if(cards[0]){const label=cards[0].querySelector('span'),value=cards[0].querySelector('strong'),note=cards[0].querySelector('small');if(label)label.textContent=state.lang==='ru'?'МИН. ВОЗРАСТ':'MIN AGE';if(value)value.textContent='30D';if(note)note.textContent=state.lang==='ru'?'новые токены скрыты':'new tokens hidden'}
    if(cards[1]){const label=cards[1].querySelector('span'),value=cards[1].querySelector('strong'),note=cards[1].querySelector('small');if(label)label.textContent=state.lang==='ru'?'ПРОШЛИ GATE':'VETTED';if(value)value.textContent=String(list.length);if(note)note.textContent=avg?`avg ${avg}d`:'strict gate'}
    if(cards[2]){const label=cards[2].querySelector('span'),value=cards[2].querySelector('strong'),note=cards[2].querySelector('small');if(label)label.textContent='PRE-CEX';if(value)value.textContent=String(pre);if(note){let prime=note.querySelector('#statPrime');if(!prime){prime=document.createElement('b');prime.id='statPrime';note.replaceChildren(prime,document.createTextNode(' '),document.createElement('span'))}prime.textContent=String(list.length);const s=note.querySelector('span');if(s)s.textContent=state.lang==='ru'?'проверенных всего':'vetted total'}}
    if(cards[3]){const label=cards[3].querySelector('span'),value=cards[3].querySelector('strong'),note=cards[3].querySelector('small');if(label)label.textContent='ACCUMULATION';if(value)value.textContent=String(acc);if(note)note.textContent='pressure ≥ 65'}
  };
  renderVettedStats=renderVettedStatsStable;
  const priorRenderAll=renderAll;
  renderAll=function(){const out=priorRenderAll();if(state.radarMode==='vetted')queueMicrotask(()=>{renderVettedStatsStable();renderTokens()});return out};
  const priorApplyLang=applyLang;
  applyLang=function(){const out=priorApplyLang();setTimeout(()=>{const box=document.getElementById('radarModeSwitch');if(box){box.remove();installRadarModes();document.querySelectorAll('.mode-btn').forEach(x=>x.classList.toggle('active',x.dataset.mode===state.radarMode))}if(state.radarMode==='vetted'){rebuildVettedFilters();renderVettedStatsStable();renderTokens()}else renderMexcPumpFocused()},0);return out};
  I18N.ru.subhead='Проверенные DEX-токены 30–365 дней без major CEX + ранние listing-сигналы. Отдельно — MEXC Pump Radar.';
  I18N.en.subhead='Vetted 30–365 day DEX assets without major-CEX presence + early listing signals. Separate MEXC Pump Radar.';
  document.querySelector('[data-i18n="subhead"]')?.replaceChildren(document.createTextNode(I18N[state.lang].subhead));
  setTimeout(renderVettedStatsStable,300);
})();
