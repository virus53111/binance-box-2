const ENDPOINT = "https://murdilimax-analytics-api.onrender.com/api/analytics";
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
  void fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=UTF-8" },
    body,
    keepalive: true,
    mode: "cors",
  }).catch(() => {
    window.setTimeout(() => {
      void fetch(ENDPOINT, { method: "POST", body, keepalive: true, mode: "cors" }).catch(() => {});
    }, 2500);
  });
}

track("page_view");
