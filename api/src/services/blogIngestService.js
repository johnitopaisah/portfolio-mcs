'use strict';

const Parser = require('rss-parser');
const pool   = require('../db/client');

const parser = new Parser();

const MEDIUM_FEED_URL = process.env.MEDIUM_FEED_URL
  || (process.env.MEDIUM_USERNAME ? `https://medium.com/feed/@${process.env.MEDIUM_USERNAME}` : null);

// Medium appends a 1x1 tracking pixel (medium.com/_/stat?...) as an <img> in every
// post's content:encoded — skip it and any other medium.com/_/stat pixel to find
// the first real content image.
function firstImageUrl(html) {
  if (!html) return null;
  const matches = html.matchAll(/<img[^>]+src="([^"]+)"/gi);
  for (const match of matches) {
    if (!match[1].includes('medium.com/_/stat')) return match[1];
  }
  return null;
}

function excerptFromSnippet(snippet) {
  if (!snippet) return null;
  const trimmed = snippet.trim().replace(/\s+/g, ' ');
  return trimmed.length > 280 ? `${trimmed.slice(0, 277)}…` : trimmed;
}

// Pulls the Medium RSS feed and upserts new/changed posts into blog_posts.
// Always admin-triggered (POST /api/admin/blog/sync) — never on a schedule.
async function syncBlogFromMedium() {
  if (!MEDIUM_FEED_URL) {
    throw new Error('MEDIUM_FEED_URL or MEDIUM_USERNAME is not configured');
  }

  const feed = await parser.parseURL(MEDIUM_FEED_URL);

  let created = 0;
  let updated = 0;

  for (const item of feed.items || []) {
    const mediumGuid = item.guid || item.link;
    if (!mediumGuid || !item.link) continue;

    const html        = item['content:encoded'] || item.content || '';
    const coverImage   = firstImageUrl(html);
    const excerpt      = excerptFromSnippet(item['content:encodedSnippet'] || item.contentSnippet || item.summary);
    const tags         = Array.isArray(item.categories) ? item.categories : [];
    const publishedAt  = item.isoDate || item.pubDate || null;

    const { rows } = await pool.query(
      `INSERT INTO blog_posts (medium_guid, title, excerpt, cover_image_url, medium_url, tags, published_at, ingested_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (medium_guid) DO UPDATE SET
         title           = EXCLUDED.title,
         excerpt         = EXCLUDED.excerpt,
         cover_image_url = EXCLUDED.cover_image_url,
         tags            = EXCLUDED.tags,
         medium_url      = EXCLUDED.medium_url,
         published_at    = EXCLUDED.published_at,
         ingested_at     = NOW()
       RETURNING (xmax = 0) AS inserted`,
      [mediumGuid, item.title, excerpt, coverImage, item.link, tags, publishedAt]
    );

    if (rows[0]?.inserted) created += 1; else updated += 1;
  }

  return { created, updated, total: feed.items?.length || 0 };
}

module.exports = { syncBlogFromMedium, MEDIUM_FEED_URL };
