const ENDPOINT = "https://cenaradar-feed-api.onrender.com/api/analytics";
const SESSION_KEY = "murdilimax:analytics-session";
const session = localStorage.getItem(SESSION_KEY) || crypto.randomUUID();
localStorage.setItem(SESSION_KEY, session);

const device = /Mobi|Android/i.test(navigator.userAgent) ? "mobile" : "desktop";
const source = (() => {
  try {
    return document.referrer ? new URL(document.referrer).hostname : "direct";
  } catch {
    return "direct";
  }
})();

export function track(event: string, extra: Record<string, string> = {}) {
  const body = JSON.stringify({
    site: "murdilimax",
    event,
    session,
    path: location.pathname,
    source,
    device,
    language: navigator.language,
    ...extra,
  });
  if (navigator.sendBeacon) {
    navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "application/json" }));
    return;
  }
  void fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {});
}

track("page_view");
