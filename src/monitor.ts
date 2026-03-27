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
  console.log('[monitor] Starting signal fetch...');
  const rssPromises = RSS_FEEDS.map(f => fetchRssFeed(f.url, f.source));
  const hnPromises = HN_QUERIES.map(f => fetchHnFeed(f.url, f.source));
  await Promise.allSettled([...rssPromises, ...hnPromises]);
  console.log('[monitor] Signal fetch complete.');
}
