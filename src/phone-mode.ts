const params = new URLSearchParams(window.location.search);

function patchPhoneSetup() {
  if (params.get('control') !== '1') return;

  const heading = document.querySelector<HTMLElement>('.control-heading h1');
  const headingText = document.querySelector<HTMLElement>('.control-heading p');
  if (heading) heading.textContent = 'Go LIVE from your phone';
  if (headingText) headingText.textContent = 'The TikTok gift connector now runs on the Live Earth server. No Mac, Terminal or OBS connector is required.';

  const steps = Array.from(document.querySelectorAll<HTMLElement>('.setup-step'));
  const first = steps[0];
  const second = steps[1];

  if (first) {
    const title = first.querySelector<HTMLElement>('h2');
    const text = first.querySelector<HTMLElement>('p');
    const button = first.querySelector<HTMLButtonElement>('button');
    if (title) title.textContent = '1. Connect your TikTok once';
    if (text) text.textContent = 'Enter the TikTok @username you use for LIVE. The server will watch that LIVE automatically whenever you go online.';
    if (button && !button.disabled) button.textContent = 'Connect TikTok';
  }

  if (second) {
    const title = second.querySelector<HTMLElement>('h2');
    const text = second.querySelector<HTMLElement>('p');
    const urlBox = second.querySelector<HTMLElement>('.url-box');
    if (title) title.textContent = '2. Start LIVE on your phone';
    if (text) text.innerHTML = 'Start TikTok LIVE with <b>screen sharing / Mobile Gaming</b>, then open <b>murdilimax.com</b>. Gifts and CITY commands are detected by the server automatically.';
    if (urlBox) urlBox.style.display = 'none';
  }

  const action = document.querySelector<HTMLElement>('.action-box');
  if (action && action.dataset.phoneReady !== '1') {
    action.dataset.phoneReady = '1';
    action.innerHTML = '<b>SERVER READY</b><span>Mac is not needed. Start your TikTok LIVE on the phone and show murdilimax.com on screen.</span>';
  }

  const bannerTitle = document.querySelector<HTMLElement>('.connection-banner b');
  const bannerText = document.querySelector<HTMLElement>('.connection-banner small');
  if (bannerTitle && bannerTitle.textContent?.includes('connector is waiting')) bannerTitle.textContent = 'Server is waiting for your TikTok LIVE';
  if (bannerText && /Mac command|Start your LIVE/i.test(bannerText.textContent || '')) bannerText.textContent = 'Go LIVE on your phone. The server will connect automatically.';

  document.querySelectorAll<HTMLElement>('.notice').forEach(notice => {
    if (/Terminal|Mac connector|paste/i.test(notice.textContent || '')) {
      notice.textContent = 'Server connection saved. Start TikTok LIVE on your phone — no Mac or Terminal needed.';
    }
  });

  const how = document.querySelector<HTMLElement>('.how-it-works');
  if (how) how.innerHTML = '<b>Phone-only flow:</b> TikTok LIVE → screen share → open <code>murdilimax.com</code> → viewer types <code>CITY Paris</code> → sends a gift → their permanent place appears.';
}

if (params.get('control') === '1') {
  let queued = false;
  const run = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      patchPhoneSetup();
    });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
  else run();

  const observer = new MutationObserver(run);
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
}
