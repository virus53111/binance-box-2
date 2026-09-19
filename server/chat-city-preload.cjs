const { createRequire } = require('node:module');
const requireFromHere = createRequire(__filename);

try {
  const { TikTokLiveConnection, WebcastEvent = {} } = requireFromHere('tiktok-live-connector');
  const chatEvent = WebcastEvent.CHAT || 'chat';
  const originalOn = TikTokLiveConnection.prototype.on;

  TikTokLiveConnection.prototype.on = function patchedOn(event, listener) {
    if (event !== chatEvent || typeof listener !== 'function') {
      return originalOn.call(this, event, listener);
    }

    return originalOn.call(this, event, (data, ...args) => {
      const comment = String(data?.comment || '').trim();
      if (comment && comment.length >= 2 && comment.length <= 40 && !/^CITY\s+/i.test(comment)) {
        data = { ...data, comment: `CITY ${comment}` };
      }
      return listener(data, ...args);
    });
  };

  console.log('Live Earth city helper loaded: plain city names are accepted.');
} catch (error) {
  console.warn('Live Earth city helper failed to load:', error?.message || error);
}
