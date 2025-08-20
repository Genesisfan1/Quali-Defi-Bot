import axios from "axios";
import { parseStringPromise } from "xml2js";
import dayjs from "dayjs";
const FEED = "https://cointelegraph.com/rss";
export async function getLatestNews() {
    const { data } = await axios.get(FEED, { timeout: 10000 });
    const xml = await parseStringPromise(data);
    const items = (xml?.rss?.channel?.[0]?.item ?? []);
    const now = dayjs();
    const last24 = items.filter(it => {
        const d = dayjs(it.pubDate?.[0]);
        return d.isAfter(now.subtract(24, 'hour'));
    });
    const top = last24.slice(0, 10).map((it) => ({
        title: it.title?.[0] || "",
        link: it.link?.[0] || "",
        pubDate: it.pubDate?.[0] || "",
        icon: pickIcon(it.title?.[0] || ""),
    }));
    return top;
}
function pickIcon(title) {
    const t = title.toLowerCase();
    if (t.includes("bitcoin") || t.includes("btc"))
        return "🟠";
    if (t.includes("ethereum") || t.includes("eth"))
        return "🟣";
    if (t.includes("defi"))
        return "🧱";
    if (t.includes("regulation") || t.includes("sec"))
        return "🏛️";
    return "📰";
}
