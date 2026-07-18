'use strict';

const router  = require('express').Router();
const crypto  = require('crypto');
const pool    = require('../db/client');
const { requireAuth } = require('../middleware/auth');

const CLIENT_ID     = process.env.LINKEDIN_CLIENT_ID;
const CLIENT_SECRET = process.env.LINKEDIN_CLIENT_SECRET;
const REDIRECT_URI  = process.env.LINKEDIN_REDIRECT_URI  || 'http://localhost:4000/api/admin/linkedin/callback';
const ADMIN_UI_URL  = process.env.ADMIN_UI_URL            || 'http://localhost:3001';

const LI_AUTH_URL  = 'https://www.linkedin.com/oauth/v2/authorization';
const LI_TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken';
const LI_USERINFO  = 'https://api.linkedin.com/v2/userinfo';
const LI_UGC_URL   = 'https://api.linkedin.com/v2/ugcPosts';

// ── DB helpers ────────────────────────────────────────────────────────────────

async function getSetting(key) {
  const { rows } = await pool.query('SELECT value FROM app_settings WHERE key = $1', [key]);
  return rows[0]?.value ?? null;
}

async function setSetting(key, value) {
  await pool.query(
    `INSERT INTO app_settings (key, value, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [key, value]
  );
}

// ── Token management ──────────────────────────────────────────────────────────

async function getValidAccessToken() {
  const token      = await getSetting('linkedin_access_token');
  const expiresAt  = await getSetting('linkedin_token_expires_at');
  const refreshTok = await getSetting('linkedin_refresh_token');

  if (!token) return null;

  // Refresh proactively if expiring within 7 days
  if (expiresAt && refreshTok) {
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    if (Date.now() + sevenDays > new Date(expiresAt).getTime()) {
      return refreshAccessToken(refreshTok);
    }
  }

  return token;
}

async function refreshAccessToken(refreshToken) {
  const params = new URLSearchParams({
    grant_type:    'refresh_token',
    refresh_token: refreshToken,
    client_id:     CLIENT_ID,
    client_secret: CLIENT_SECRET,
  });

  const res = await fetch(LI_TOKEN_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    params.toString(),
  });

  if (!res.ok) {
    // Refresh failed — wipe tokens so user can reconnect
    await pool.query(`DELETE FROM app_settings WHERE key LIKE 'linkedin_%'`);
    return null;
  }

  const data      = await res.json();
  const expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();

  await setSetting('linkedin_access_token',    data.access_token);
  await setSetting('linkedin_token_expires_at', expiresAt);
  if (data.refresh_token) await setSetting('linkedin_refresh_token', data.refresh_token);

  return data.access_token;
}

// ── Routes ────────────────────────────────────────────────────────────────────

// Step 1 — generate auth URL and return it to the admin UI
router.get('/auth', requireAuth, async (req, res, next) => {
  try {
    const state = crypto.randomBytes(16).toString('hex');
    await setSetting('linkedin_oauth_state',         state);
    await setSetting('linkedin_oauth_state_expires', new Date(Date.now() + 10 * 60 * 1000).toISOString());

    const params = new URLSearchParams({
      response_type: 'code',
      client_id:     CLIENT_ID,
      redirect_uri:  REDIRECT_URI,
      state,
      scope:         'openid profile w_member_social',
    });

    res.json({ url: `${LI_AUTH_URL}?${params.toString()}` });
  } catch (err) { next(err); }
});

// Step 2 — LinkedIn redirects here after user consent (no JWT — LinkedIn doesn't forward it)
router.get('/callback', async (req, res, next) => {
  try {
    const { code, state, error } = req.query;

    if (error) return res.redirect(`${ADMIN_UI_URL}/dashboard/blog?linkedin=denied`);

    const storedState  = await getSetting('linkedin_oauth_state');
    const stateExpires = await getSetting('linkedin_oauth_state_expires');

    const stateExpired = stateExpires && Date.now() > new Date(stateExpires).getTime();
    if (!storedState || state !== storedState || stateExpired) {
      return res.redirect(`${ADMIN_UI_URL}/dashboard/blog?linkedin=error`);
    }

    // Exchange code for tokens
    const tokenParams = new URLSearchParams({
      grant_type:    'authorization_code',
      code,
      redirect_uri:  REDIRECT_URI,
      client_id:     CLIENT_ID,
      client_secret: CLIENT_SECRET,
    });

    const tokenRes = await fetch(LI_TOKEN_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    tokenParams.toString(),
    });

    if (!tokenRes.ok) {
      console.error('LinkedIn token exchange failed:', await tokenRes.text());
      return res.redirect(`${ADMIN_UI_URL}/dashboard/blog?linkedin=error`);
    }

    const tokens    = await tokenRes.json();
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    // Get LinkedIn person ID and display name via OpenID Connect userinfo
    const userRes  = await fetch(LI_USERINFO, { headers: { Authorization: `Bearer ${tokens.access_token}` } });
    const userInfo = userRes.ok ? await userRes.json() : {};

    await setSetting('linkedin_access_token',    tokens.access_token);
    await setSetting('linkedin_token_expires_at', expiresAt);
    await setSetting('linkedin_person_id',        userInfo.sub   ?? '');
    await setSetting('linkedin_person_name',      userInfo.name  ?? userInfo.given_name ?? 'You');
    if (tokens.refresh_token) await setSetting('linkedin_refresh_token', tokens.refresh_token);

    // Clear one-time state
    await pool.query(`DELETE FROM app_settings WHERE key IN ('linkedin_oauth_state','linkedin_oauth_state_expires')`);

    res.redirect(`${ADMIN_UI_URL}/dashboard/blog?linkedin=connected`);
  } catch (err) { next(err); }
});

// Connection status
router.get('/status', requireAuth, async (req, res, next) => {
  try {
    const token     = await getSetting('linkedin_access_token');
    const expiresAt = await getSetting('linkedin_token_expires_at');
    const name      = await getSetting('linkedin_person_name');

    if (!token) return res.json({ connected: false });

    res.json({ connected: true, name: name || 'LinkedIn User', expiresAt });
  } catch (err) { next(err); }
});

// Disconnect
router.delete('/disconnect', requireAuth, async (req, res, next) => {
  try {
    await pool.query(`DELETE FROM app_settings WHERE key LIKE 'linkedin_%'`);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// Share a blog post to LinkedIn.
// If the post has a cover image we upload it directly to LinkedIn (IMAGE type) — guaranteed
// thumbnail, better algorithm reach. Falls back to ARTICLE link card if upload fails.
router.post('/share/:id', requireAuth, async (req, res, next) => {
  try {
    const { caption } = req.body;
    if (!caption?.trim()) return res.status(400).json({ error: 'caption is required' });

    const accessToken = await getValidAccessToken();
    if (!accessToken) return res.status(401).json({ error: 'LinkedIn not connected' });

    const personId = await getSetting('linkedin_person_id');
    if (!personId) return res.status(401).json({ error: 'LinkedIn person ID missing — please reconnect' });

    const { rows } = await pool.query(
      'SELECT id, title, excerpt, medium_url, cover_image_url FROM blog_posts WHERE id = $1',
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Post not found' });
    const post = rows[0];

    let shareContent;

    if (post.cover_image_url) {
      try {
        // Step 1 — register an image upload slot with LinkedIn
        const regRes = await fetch('https://api.linkedin.com/v2/assets?action=registerUpload', {
          method:  'POST',
          headers: {
            Authorization:               `Bearer ${accessToken}`,
            'Content-Type':              'application/json',
            'X-Restli-Protocol-Version': '2.0.0',
          },
          body: JSON.stringify({
            registerUploadRequest: {
              recipes:              ['urn:li:digitalmediaRecipe:feedshare-image'],
              owner:                `urn:li:person:${personId}`,
              serviceRelationships: [{ relationshipType: 'OWNER', identifier: 'urn:li:userGeneratedContent' }],
            },
          }),
        });
        if (!regRes.ok) throw new Error(`Register upload failed: ${regRes.status}`);

        const regData   = await regRes.json();
        const uploadUrl = regData.value.uploadMechanism['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'].uploadUrl;
        const assetUrn  = regData.value.asset;

        // Step 2 — fetch the cover image from Medium CDN
        const imgRes = await fetch(post.cover_image_url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PortfolioBot/1.0)' },
        });
        if (!imgRes.ok) throw new Error(`Cover image fetch failed: ${imgRes.status}`);

        const imgBuf     = Buffer.from(await imgRes.arrayBuffer());
        const contentType = imgRes.headers.get('content-type') || 'image/jpeg';

        // Step 3 — PUT the image binary to LinkedIn's upload URL
        const upRes = await fetch(uploadUrl, {
          method:  'PUT',
          headers: {
            Authorization:  `Bearer ${accessToken}`,
            'Content-Type': contentType,
          },
          body: imgBuf,
        });
        // LinkedIn returns 201 on success (occasionally 200)
        if (!upRes.ok && upRes.status !== 201) throw new Error(`Image PUT failed: ${upRes.status}`);

        shareContent = {
          shareCommentary:    { text: caption },
          shareMediaCategory: 'IMAGE',
          media: [{
            status:      'READY',
            description: { text: post.excerpt || '' },
            media:       assetUrn,
            title:       { text: post.title },
          }],
        };
      } catch (imgErr) {
        // Image upload failed — fall back to article link card so the post still goes out
        console.warn('Image upload failed, falling back to ARTICLE:', imgErr.message);
        shareContent = {
          shareCommentary:    { text: caption },
          shareMediaCategory: 'ARTICLE',
          media: [{
            status:      'READY',
            description: { text: post.excerpt || '' },
            originalUrl: post.medium_url.split('?')[0],
            title:       { text: post.title },
          }],
        };
      }
    } else {
      // No cover image stored — use article link card
      shareContent = {
        shareCommentary:    { text: caption },
        shareMediaCategory: 'ARTICLE',
        media: [{
          status:      'READY',
          description: { text: post.excerpt || '' },
          originalUrl: post.medium_url.split('?')[0],
          title:       { text: post.title },
        }],
      };
    }

    const payload = {
      author:          `urn:li:person:${personId}`,
      lifecycleState:  'PUBLISHED',
      specificContent: { 'com.linkedin.ugc.ShareContent': shareContent },
      visibility:      { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
    };

    const liRes = await fetch(LI_UGC_URL, {
      method:  'POST',
      headers: {
        Authorization:               `Bearer ${accessToken}`,
        'Content-Type':              'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
      },
      body: JSON.stringify(payload),
    });

    if (!liRes.ok) {
      const errBody = await liRes.text();
      console.error('LinkedIn UGC post failed:', errBody);
      return res.status(502).json({ error: `LinkedIn error ${liRes.status}: ${errBody}` });
    }

    const liData   = await liRes.json();
    const sharedAt = new Date().toISOString();

    await pool.query(
      'UPDATE blog_posts SET linkedin_shared_at = $1, linkedin_post_urn = $2 WHERE id = $3',
      [sharedAt, liData.id ?? null, req.params.id]
    );

    res.json({ ok: true, sharedAt, postUrn: liData.id });
  } catch (err) { next(err); }
});

// Delete a LinkedIn post and clear the share record on the blog post
router.delete('/share/:id', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT linkedin_post_urn FROM blog_posts WHERE id = $1',
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Post not found' });

    const postUrn = rows[0].linkedin_post_urn;

    if (postUrn) {
      const accessToken = await getValidAccessToken();
      if (accessToken) {
        const encodedUrn = encodeURIComponent(postUrn);
        const liRes = await fetch(`https://api.linkedin.com/v2/ugcPosts/${encodedUrn}`, {
          method:  'DELETE',
          headers: {
            Authorization:               `Bearer ${accessToken}`,
            'X-Restli-Protocol-Version': '2.0.0',
          },
        });
        // 404 from LinkedIn means already deleted — still fine, clear our DB record
        if (!liRes.ok && liRes.status !== 404) {
          const errBody = await liRes.text();
          console.error('LinkedIn delete failed:', errBody);
          return res.status(502).json({ error: `LinkedIn error ${liRes.status}` });
        }
      }
    }

    await pool.query(
      'UPDATE blog_posts SET linkedin_shared_at = NULL, linkedin_post_urn = NULL WHERE id = $1',
      [req.params.id]
    );

    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
