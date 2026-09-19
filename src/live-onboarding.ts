import './live-onboarding.css';

const params = new URLSearchParams(window.location.search);
const isControl = params.get('control') === '1';
const isObs = params.get('obs') === '1';
const langParam = params.get('lang');
const isRussian = langParam === 'ru' || (langParam !== 'en' && navigator.language.toLowerCase().startsWith('ru'));
const API_BASE = (import.meta.env.VITE_API_BASE || 'http://localhost:8787').replace(/\/$/, '');

const copy = isRussian
  ? {
      title: 'КАК ОСТАТЬСЯ НА ЗЕМЛЕ НАВСЕГДА',
      step1Title: '1 · НАПИШИ ГОРОД',
      step1Text: 'CITY Riga в чате',
      step2Title: '2 · ОТПРАВЬ ПОДАРОК',
      step2Text: 'любой подарок закрепит @ник',
      step3Title: '3 · ТВОЙ @НИК ОСТАНЕТСЯ',
      step3Text: 'навсегда на murdilimax.com',
      levelTitle: '⚡ ДАРИ ЕЩЁ → ПРОКАЧИВАЙ МЕСТО',
      levelText: 'ник → маяк → башня → город → мегаполис → монумент',
      followFallback: '➕ ПОДПИШИСЬ · НЕ ПРОПУСТИ СЛЕДУЮЩИЙ LIVE',
      followPrefix: '➕ ПОДПИШИСЬ НА',
      followSuffix: '· СЛЕДУЮЩИЙ LIVE = НОВАЯ ПРОКАЧКА',
    }
  : {
      title: 'HOW TO STAY ON EARTH FOREVER',
      step1Title: '1 · TYPE YOUR CITY',
      step1Text: 'CITY Riga in the chat',
      step2Title: '2 · SEND ANY GIFT',
      step2Text: 'any gift locks your @name',
      step3Title: '3 · YOUR @NAME STAYS',
      step3Text: 'forever on murdilimax.com',
      levelTitle: '⚡ GIFT AGAIN → LEVEL UP YOUR PLACE',
      levelText: 'name → beacon → tower → city → mega city → landmark',
      followFallback: '➕ FOLLOW · DON’T MISS THE NEXT LIVE',
      followPrefix: '➕ FOLLOW',
      followSuffix: '· NEXT LIVE = KEEP BUILDING',
    };

function addOnboarding() {
  if (isControl || document.querySelector('.live-onboarding')) return;

  const layer = document.createElement('div');
  layer.className = `live-onboarding${isObs ? ' is-obs' : ''}`;
  layer.innerHTML = `
    <section class="live-guide" aria-label="Live Earth instructions">
      <div class="live-guide-title"><span class="guide-pulse"></span>${copy.title}</div>
      <div class="live-guide-steps">
        <div class="live-guide-step step-one"><b>${copy.step1Title}</b><span>${copy.step1Text}</span></div>
        <div class="guide-arrow">→</div>
        <div class="live-guide-step step-two"><b>${copy.step2Title}</b><span>${copy.step2Text}</span></div>
        <div class="guide-arrow">→</div>
        <div class="live-guide-step step-three"><b>${copy.step3Title}</b><span>${copy.step3Text}</span></div>
      </div>
      <div class="live-level-strip"><b>${copy.levelTitle}</b><span>${copy.levelText}</span></div>
    </section>
    <a class="live-follow-cta" rel="noreferrer" target="_blank">
      <span class="follow-plus">+</span>
      <b class="follow-label">${copy.followFallback}</b>
      <span class="follow-shine"></span>
    </a>
  `;
  document.body.appendChild(layer);

  const follow = layer.querySelector<HTMLAnchorElement>('.live-follow-cta');
  const label = layer.querySelector<HTMLElement>('.follow-label');
  if (!follow || !label) return;

  fetch(`${API_BASE}/api/control/status`)
    .then(response => (response.ok ? response.json() : Promise.reject()))
    .then((status: { tiktokUsername?: string }) => {
      const username = String(status?.tiktokUsername || '').replace(/^@/, '').trim();
      if (!username) return;
      label.textContent = `${copy.followPrefix} @${username} ${copy.followSuffix}`;
      follow.href = `https://www.tiktok.com/@${encodeURIComponent(username)}`;
      follow.setAttribute('aria-label', `TikTok @${username}`);
    })
    .catch(() => {
      follow.removeAttribute('href');
    });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', addOnboarding, { once: true });
} else {
  addOnboarding();
}
