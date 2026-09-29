import { useEffect, useState } from "react";
import { ExternalLink, Pause, Play, RefreshCw, Rocket } from "lucide-react";
import { auth } from "./firebase";

const API = "https://murdilimax-live-earth-api.onrender.com";

type TrafficPage = {
  id: string;
  slug: string;
  title: string;
  views: number;
  crawls: number;
  clicks: number;
  url: string;
};

type TrafficCampaign = {
  id: string;
  url: string;
  host: string;
  title: string;
  status: "active" | "paused" | string;
  lastError: string;
  indexNowStatus: string;
  lastRunAt: number;
  views: number;
  crawls: number;
  clicks: number;
  pageCount: number;
  indexableCount: number;
  pagesWithTasks: number;
  crawlCount: number;
  publicHubUrl: string;
  pages: TrafficPage[];
};

type TrafficResponse = { campaigns: TrafficCampaign[]; maxActive?: number };

async function ownerRequest(path: string, options: RequestInit = {}) {
  const user = auth.currentUser;
  if (!user) throw new Error("Нужно войти в аккаунт владельца.");
  const token = await user.getIdToken();
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
    signal: options.signal || AbortSignal.timeout(45000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

export default function TrafficLab() {
  const [campaigns, setCampaigns] = useState<TrafficCampaign[]>([]);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [loaded, setLoaded] = useState(false);

  const load = async () => {
    try {
      setMessage("");
      const data = (await ownerRequest("/api/traffic/campaigns")) as TrafficResponse;
      setCampaigns(data.campaigns || []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось загрузить Traffic Lab.");
    } finally {
      setLoaded(true);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const startNew = async () => {
    const value = url.trim();
    if (!value) return;
    setBusy("new");
    setMessage("Сканирую сайт и создаю первые страницы…");
    try {
      const data = (await ownerRequest("/api/traffic/campaigns", {
        method: "POST",
        body: JSON.stringify({ url: value }),
      })) as TrafficResponse;
      setCampaigns(data.campaigns || []);
      setUrl("");
      setMessage("Запущено. Страницы созданы и отправлены через IndexNow.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось запустить сайт.");
    } finally {
      setBusy("");
    }
  };

  const action = async (campaign: TrafficCampaign, type: "refresh" | "stop" | "start") => {
    setBusy(`${campaign.id}:${type}`);
    setMessage("");
    try {
      const data = (await ownerRequest(`/api/traffic/campaigns/${campaign.id}/${type}`, {
        method: "POST",
        body: "{}",
      })) as TrafficResponse;
      setCampaigns(data.campaigns || []);
      setMessage(type === "stop" ? "Кампания остановлена." : type === "start" ? "Кампания снова запущена." : "Страницы обновлены.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Операция не выполнена.");
    } finally {
      setBusy("");
    }
  };

  const active = campaigns.filter((item) => item.status === "active").length;

  return (
    <section className="admin-section traffic-lab-section">
      <div className="admin-section-head traffic-lab-head">
        <div>
          <h3>Traffic Lab</h3>
          <small>Приватный тест: URL → Start → публичные полезные страницы → реальные просмотры и переходы</small>
        </div>
        <span className="traffic-lab-limit">{active}/2 активно</span>
      </div>

      <div className="traffic-launch">
        <input
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !busy) void startNew();
          }}
          placeholder="https://ваш-сайт.com"
          inputMode="url"
        />
        <button onClick={() => void startNew()} disabled={!url.trim() || Boolean(busy)}>
          <Rocket />
          {busy === "new" ? "Запуск…" : "START"}
        </button>
      </div>
      <p className="traffic-lab-note">
        Traffic Lab строит страницы под реальный поисковый спрос: цены, калькуляторы, сметы и сравнения.
        Числовые ориентиры берутся с целевого сайта или из опубликованного рыночного benchmark Murdilimax.
        В sitemap попадают только страницы, прошедшие Quality Gate; слабые остаются noindex.
      </p>

      {!loaded && <div className="admin-empty">Загружаем Traffic Lab…</div>}
      {loaded && campaigns.length === 0 && (
        <div className="admin-empty">
          <Rocket />
          Добавьте первый из двух тестовых сайтов.
        </div>
      )}

      <div className="traffic-campaigns">
        {campaigns.map((campaign) => {
          const refreshing = busy === `${campaign.id}:refresh`;
          const stopping = busy === `${campaign.id}:stop`;
          const starting = busy === `${campaign.id}:start`;
          return (
            <article className="traffic-campaign" key={campaign.id}>
              <div className="traffic-campaign-top">
                <div>
                  <div className="traffic-site-line">
                    <span className={campaign.status === "active" ? "traffic-dot active" : "traffic-dot"} />
                    <b>{campaign.host}</b>
                    <span>{campaign.status === "active" ? "работает" : "остановлен"}</span>
                  </div>
                  <small>{campaign.title || campaign.url}</small>
                </div>
                <a href={campaign.publicHubUrl} target="_blank" rel="noreferrer" title="Открыть публичный hub">
                  <ExternalLink />
                </a>
              </div>

              <div className="traffic-metrics">
                <div><strong>{campaign.indexableCount || 0}</strong><span>индексируемых · {Math.max(0, campaign.pageCount - (campaign.indexableCount || 0))} noindex</span></div>
                <div><strong>{campaign.views}</strong><span>просмотров</span></div>
                <div><strong>{campaign.crawls}</strong><span>crawler hits</span></div>
                <div><strong>{campaign.clicks}</strong><span>переходов на сайт</span></div>
              </div>

              <div className="traffic-meta">
                <span>Последний запуск: {campaign.lastRunAt ? new Date(campaign.lastRunAt).toLocaleString("ru-RU") : "—"}</span>
                <span>Quality Gate: {campaign.indexableCount || 0}/{campaign.pageCount} страниц · HTML-скан источника: до {campaign.crawlCount || 1} стр.</span>
                <span>IndexNow: {campaign.indexNowStatus || "ещё не отправлялся"}</span>
              </div>

              {campaign.lastError && <div className="traffic-error">{campaign.lastError}</div>}

              <div className="traffic-pages">
                {campaign.pages.map((page) => (
                  <a href={page.url} target="_blank" rel="noreferrer" key={page.id}>
                    <span>{page.title}</span>
                    <small>{page.views} просмотров · {page.crawls} crawler hits · {page.clicks} переходов</small>
                  </a>
                ))}
              </div>

              <div className="traffic-actions">
                <button className="secondary" onClick={() => void action(campaign, "refresh")} disabled={Boolean(busy)}>
                  <RefreshCw />
                  {refreshing ? "Обновляю…" : "Обновить"}
                </button>
                {campaign.status === "active" ? (
                  <button className="secondary" onClick={() => void action(campaign, "stop")} disabled={Boolean(busy)}>
                    <Pause />
                    {stopping ? "Останавливаю…" : "Stop"}
                  </button>
                ) : (
                  <button onClick={() => void action(campaign, "start")} disabled={Boolean(busy)}>
                    <Play />
                    {starting ? "Запускаю…" : "Start"}
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {message && <div className="traffic-message">{message}</div>}
    </section>
  );
}
