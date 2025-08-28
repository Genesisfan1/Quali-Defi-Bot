import axios from "axios";
import { parseStringPromise } from "xml2js";
import dayjs from "dayjs";

const FEED = "https://cointelegraph.com/rss";

export type NewsTimeframe = "1h" | "24h" | "7d" | "1m";

export async function getLatestNews() {
  const { data } = await axios.get(FEED, { timeout: 10000 });
  const xml = await parseStringPromise(data);
  const items = (xml?.rss?.channel?.[0]?.item ?? []) as any[];
  const now = dayjs();
  const last24 = items.filter(it => {
    const d = dayjs(it.pubDate?.[0]);
    return d.isAfter(now.subtract(24, 'hour'));
  });
  const top = last24.slice(0, 10).map((it: any) => ({
    title: it.title?.[0] || "",
    link: it.link?.[0] || "",
    pubDate: it.pubDate?.[0] || "",
    icon: pickIcon(it.title?.[0] || ""),
  }));
  return top;
}

export async function getTopNews(timeframe: NewsTimeframe) {
  const { data } = await axios.get(FEED, { timeout: 10000 });
  const xml = await parseStringPromise(data);
  const items = (xml?.rss?.channel?.[0]?.item ?? []) as any[];
  const now = dayjs();
  const sub =
    timeframe === "1h" ? { n: 1, u: "hour" } :
    timeframe === "24h" ? { n: 24, u: "hour" } :
    timeframe === "7d" ? { n: 7, u: "day" } :
    { n: 30, u: "day" };
  const filtered = items.filter(it => {
    const d = dayjs(it.pubDate?.[0]);
    return d.isAfter((now as any).subtract(sub.n, sub.u as any));
  });
  const top = filtered.slice(0, 10).map((it: any) => ({
    title: it.title?.[0] || "",
    link: it.link?.[0] || "",
    pubDate: it.pubDate?.[0] || "",
    icon: pickIcon(it.title?.[0] || ""),
  }));
  return top;
}

// removed CryptoPanic-based popularity; Cointelegraph feed only

function withinWindow(pubDate: string, tf: NewsTimeframe): boolean {
  const now = dayjs();
  const d = dayjs(pubDate);
  if (!d.isValid()) return false;
  if (tf === "1h") return d.isAfter(now.subtract(1, "hour"));
  if (tf === "24h") return d.isAfter(now.subtract(24, "hour"));
  if (tf === "7d") return d.isAfter(now.subtract(7, "day"));
  return d.isAfter(now.subtract(30, "day"));
}

function extractViewsFromHtml(html: string): number {
  try {
    const re = /post-card-inline__eye-icon[\s\S]*?<span[^>]*>\s*&nbsp;\s*([0-9.,_\s]+)/i;
    const m = html.match(re);
    if (m && m[1]) {
      const num = m[1].replace(/[^0-9]/g, "");
      const n = Number(num || "0");
      return isNaN(n) ? 0 : n;
    }
  } catch {}
  return 0;
}

export async function getMostViewed(tf: NewsTimeframe) {
  // Fetch RSS for candidate list, then rank by views scraped from article page
  const { data } = await axios.get(FEED, { timeout: 10000 });
  const xml = await parseStringPromise(data);
  const items = (xml?.rss?.channel?.[0]?.item ?? []) as any[];
  const candidates = items
    .map((it: any) => ({
      title: it.title?.[0] || "",
      link: it.link?.[0] || "",
      pubDate: it.pubDate?.[0] || "",
    }))
    .filter(it => withinWindow(it.pubDate, tf))
    .slice(0, 50); // cap requests

  const ranked: { item: any; views: number }[] = [];
  for (const it of candidates) {
    try {
      const res = await axios.get(it.link, { timeout: 10000 });
      const views = extractViewsFromHtml(res.data || "");
      ranked.push({ item: it, views });
    } catch {
      ranked.push({ item: it, views: 0 });
    }
  }
  ranked.sort((a, b) => b.views - a.views);
  const top = ranked.slice(0, 10).map(({ item }) => ({
    title: item.title,
    link: item.link,
    pubDate: item.pubDate,
    icon: pickIcon(item.title),
  }));
  return top;
}

function pickIcon(title: string): string {
  const t = title.toLowerCase();
  if (t.includes("bitcoin") || t.includes("btc")) return "🟠";
  if (t.includes("ethereum") || t.includes("eth")) return "🟣";
  if (t.includes("defi")) return "🧱";
  if (t.includes("regulation") || t.includes("sec")) return "🏛️";
  return "📰";
}
