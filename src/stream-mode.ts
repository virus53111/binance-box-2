import './stream-mode.css';

const params = new URLSearchParams(window.location.search);
const isStreamMode = params.get('stream') === '1';

if (isStreamMode) {
  document.documentElement.classList.add('portrait-stream');
  document.body.classList.add('portrait-stream-body');

  const launch = () => {
    if (document.querySelector('.stream-launch')) return;
    const button = document.createElement('button');
    button.className = 'stream-launch';
    button.type = 'button';
    button.innerHTML = '<b>START CLEAN STREAM VIEW</b><span>Tap once after TikTok LIVE starts</span>';
    button.addEventListener('click', async () => {
      try {
        if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
          await document.documentElement.requestFullscreen();
        }
      } catch {}
      try {
        const orientation = screen.orientation as ScreenOrientation & { lock?: (orientation: string) => Promise<void> };
        await orientation.lock?.('portrait');
      } catch {}
      try {
        const wakeLock = (navigator as Navigator & { wakeLock?: { request: (type: 'screen') => Promise<unknown> } }).wakeLock;
        await wakeLock?.request('screen');
      } catch {}
      button.remove();
    });
    document.body.appendChild(button);
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', launch, { once: true });
  else launch();
}
