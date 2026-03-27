import { XMLParser } from 'fast-xml-parser';
import { insertLead } from './db';

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

const RSS_FEEDS = [
  { url: 'https://www.reddit.com/r/datacenter+homelab+sysadmin+networking.rss?limit=25', source: 'reddit' },
  { url: 'https://www.reddit.com/search.rss?q=generator+sizing+data+center&sort=new', source: 'reddit' },
  { url: 'https://www.reddit.com/search.rss?q=NFPA+110+compliance&sort=new', source: 'reddit' },
  { url: 'https://www.reddit.com/search.rss?q=UPS+sizing+data+center&sort=new', source: 'reddit' },
  { url: 'https://www.reddit.com/search.rss?q=PUE+calculator&sort=new', source: 'reddit' },
  { url: 'https://www.reddit.com/search.rss?q=data+center+tier+certification&sort=new', source: 'reddit' },
];

const GOOGLE_NEWS_FEEDS = [
  { url: 'https://news.google.com/rss/search?q=data+center+generator+sizing&hl=en-US&gl=US&ceid=US:en', source: 'google_news' },
  { url: 'https://news.google.com/rss/search?q=NFPA+110+compliance+data+center&hl=en-US&gl=US&ceid=US:en', source: 'google_news' },
  { url: 'https://news.google.com/rss/search?q=data+center+PUE+optimization&hl=en-US&gl=US&ceid=US:en', source: 'google_news' },
  { url: 'https://news.google.com/rss/search?q=UPS+sizing+data+center&hl=en-US&gl=US&ceid=US:en', source: 'google_news' },
  { url: 'https://news.google.com/rss/search?q=data+center+tier+certification&hl=en-US&gl=US&ceid=US:en', source: 'google_news' },
  { url: 'https://news.google.com/rss/search?q=data+center+construction+power+permits&hl=en-US&gl=US&ceid=US:en', source: 'google_news' },
  { url: 'https://news.google.com/rss/search?q=generator+sizing+NFPA&hl=en-US&gl=US&ceid=US:en', source: 'google_news' },
  { url: 'https://news.google.com/rss/search?q=site:linkedin.com+data+center+power+infrastructure&hl=en-US&gl=US&ceid=US:en', source: 'linkedin' },
  { url: 'https://news.google.com/rss/search?q=site:linkedin.com+generator+sizing+data+center&hl=en-US&gl=US&ceid=US:en', source: 'linkedin' },
  { url: 'https://news.google.com/rss/search?q=site:linkedin.com+NFPA+110&hl=en-US&gl=US&ceid=US:en', source: 'linkedin' },
];

const SO_ENDPOINTS = [
  'https://api.stackexchange.com/2.3/questions?order=desc&sort=activity&tagged=data-center&site=stackoverflow&pagesize=10&filter=withbody',
  'https://api.stackexchange.com/2.3/questions?order=desc&sort=activity&tagged=electrical-engineering&site=stackoverflow&pagesize=10&filter=withbody',
  'https://api.stackexchange.com/2.3/search?order=desc&sort=activity&intitle=generator+sizing&site=stackoverflow&pagesize=10&filter=withbody',
  'https://api.stackexchange.com/2.3/search?order=desc&sort=activity&intitle=NFPA+110&site=stackoverflow&pagesize=10&filter=withbody',
  'https://api.stackexchange.com/2.3/search?order=desc&sort=activity&intitle=UPS+sizing&site=stackoverflow&pagesize=10&filter=withbody',
  'https://api.stackexchange.com/2.3/search?order=desc&sort=activity&intitle=data+center+power&site=stackoverflow&pagesize=5&filter=withbody',
];

const HN_QUERIES = [
  { url: 'https://hn.algolia.com/api/v1/search_by_date?query=data+center+power&tags=story', source: 'hn' },
  { url: 'https://hn.algolia.com/api/v1/search_by_date?query=generator+sizing&tags=story,comment', source: 'hn' },
  { url: 'https://hn.algolia.com/api/v1/search_by_date?query=NFPA+110&tags=story,comment', source: 'hn' },
];

async function fetchWithTimeout(url: string, timeoutMs = 10000): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'orchestra-growth/1.0 (lead intelligence bot)' },
    });
    return res;
  } finally {
    clearTimeout(id);
  }
}

async function fetchRssFeed(feedUrl: string, source: string): Promise<void> {
  try {
    const res = await fetchWithTimeout(feedUrl);
    if (!res.ok) {
      console.warn(`RSS fetch failed for ${feedUrl}: ${res.status}`);
      return;
    }
    const xml = await res.text();
    const parsed = parser.parse(xml);
    const items = parsed?.feed?.entry || parsed?.rss?.channel?.item || [];
    const entries = Array.isArray(items) ? items : [items];

    for (const item of entries) {
      const url = item.link?.['@_href'] || item.link || item.guid || '';
      const title = item.title?.['#text'] || item.title || '';
      const body = item.content?.['#text'] || item.description || item.summary || '';
      const author = item.author?.name || item['dc:creator'] || item.author || 'unknown';

      if (!url || !title) continue;

      insertLead({
        source,
        url: typeof url === 'string' ? url : String(url),
        title: stripHtml(String(title)).slice(0, 500),
        body: stripHtml(String(body)).slice(0, 2000),
        author: String(author).slice(0, 100),
      });
    }
    console.log(`[monitor] Fetched ${entries.length} items from ${source} RSS`);
  } catch (err) {
    console.error(`[monitor] Error fetching ${feedUrl}:`, err);
  }
}

async function fetchHnFeed(apiUrl: string, source: string): Promise<void> {
  try {
    const res = await fetchWithTimeout(apiUrl);
    if (!res.ok) {
      console.warn(`HN fetch failed for ${apiUrl}: ${res.status}`);
      return;
    }
    const data = await res.json() as { hits: HnHit[] };
    const hits = data.hits || [];

    for (const hit of hits) {
      const url = hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`;
      const title = hit.title || hit.story_title || '';
      const body = hit.comment_text || hit.story_text || '';
      const author = hit.author || 'unknown';

      if (!title) continue;

      insertLead({
        source,
        url,
        title: title.slice(0, 500),
        body: stripHtml(body).slice(0, 2000),
        author: author.slice(0, 100),
      });
    }
    console.log(`[monitor] Fetched ${hits.length} items from HN`);
  } catch (err) {
    console.error(`[monitor] Error fetching HN ${apiUrl}:`, err);
  }
}

interface SoItem {
  question_id: number;
  title: string;
  body?: string;
  link: string;
  owner?: { display_name?: string };
}

async function fetchStackOverflow(apiUrl: string): Promise<void> {
  try {
    const res = await fetchWithTimeout(apiUrl);
    if (!res.ok) {
      console.warn(`[monitor] SO fetch failed for ${apiUrl}: ${res.status}`);
      return;
    }
    const data = await res.json() as { items: SoItem[] };
    const items = data.items || [];

    for (const item of items) {
      const url = item.link || `https://stackoverflow.com/q/${item.question_id}`;
      const title = item.title || '';
      const body = stripHtml(item.body || '').slice(0, 2000);
      const author = item.owner?.display_name || 'unknown';

      if (!title) continue;

      insertLead({
        source: 'stackoverflow',
        url,
        title: title.slice(0, 500),
        body,
        author: author.slice(0, 100),
      });
    }
    console.log(`[monitor] Fetched ${items.length} items from Stack Overflow`);
  } catch (err) {
    console.error(`[monitor] Error fetching SO ${apiUrl}:`, err);
  }
}

interface HnHit {
  objectID: string;
  url?: string;
  title?: string;
  story_title?: string;
  comment_text?: string;
  story_text?: string;
  author?: string;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
}

export async function runMonitor(): Promise<void> {
  console.log('[monitor] Starting signal fetch (Reddit + HN)...');
  const rssPromises = RSS_FEEDS.map(f => fetchRssFeed(f.url, f.source));
  const hnPromises = HN_QUERIES.map(f => fetchHnFeed(f.url, f.source));
  await Promise.allSettled([...rssPromises, ...hnPromises]);
  console.log('[monitor] Reddit + HN fetch complete.');
}

export async function runExtendedMonitor(): Promise<void> {
  console.log('[monitor] Starting extended signal fetch (Google News + SO + LinkedIn)...');
  const gnPromises = GOOGLE_NEWS_FEEDS.map(f => fetchRssFeed(f.url, f.source));
  const soPromises = SO_ENDPOINTS.map(url => fetchStackOverflow(url));
  await Promise.allSettled([...gnPromises, ...soPromises]);
  console.log('[monitor] Extended fetch complete.');
}
