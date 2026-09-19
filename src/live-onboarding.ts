import './live-onboarding.css';

const params = new URLSearchParams(window.location.search);
const isControl = params.get('control') === '1';
const isObs = params.get('obs') === '1';
const API_BASE = (import.meta.env.VITE_API_BASE || 'http://localhost:8787').replace(/\/$/, '');

const copy = {
  title: 'CLAIM YOUR PERMANENT PLACE ON EARTH',
  step1Title: '1 · TYPE YOUR CITY',
  step1Text: 'CITY Riga in the chat',
  step2Title: '2 · SEND ANY GIFT',
  step2Text: 'your @name is placed on Earth',
  step3Title: '3 · STAY FOREVER',
  step3Text: 'your @name stays on murdilimax.com',
  levelTitle: '⚡ KEEP GIFTING → BUILD A BIGGER PLACE',
  levelText: 'name → beacon → tower → city → mega city → landmark',
  followFallback: '➕ FOLLOW · DON’T MISS THE NEXT LIVE',
  followPrefix: '➕ FOLLOW',
  followSuffix: '· COME BACK NEXT LIVE TO KEEP BUILDING',
};

async function lockPortraitForStream() {
  if (!isObs) return;
  try {
    const orientation = screen.orientation as ScreenOrientation & { lock?: (value: string) => Promise<void> };
    if (orientation?.lock) await orientation.lock('portrait-primary');
  } catch {
    /* Browsers that do not allow orientation locking still respect the PWA manifest. */
  }
}

function addOnboarding() {
  if (isControl || document.querySelector('.live-onboarding')) return;

  if (isObs) {
    document.documentElement.classList.add('portrait-stream');
    void lockPortraitForStream();
  }

  const layer = document.createElement('div');
  layer.className = `live-onboarding${isObs ? ' is-obs' : ''}`;
  layer.innerHTML = `
    <section class="live-guide" aria-label="Live Earth instructions">
      <div class="live-guide-title"><span class="guide-pulse"></span>${copy.title}</div>
      <div class="live-guide-steps">
        <div class="live-guide-step"><b>${copy.step1Title}</b><span>${copy.step1Text}</span></div>
        <div class="guide-arrow">→</div>
        <div class="live-guide-step"><b>${copy.step2Title}</b><span>${copy.step2Text}</span></div>
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
