CREATE TABLE IF NOT EXISTS social_links (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  platform    TEXT        NOT NULL,
  label       TEXT        NOT NULL,
  url         TEXT        NOT NULL,
  order_index INTEGER     NOT NULL DEFAULT 0,
  visible     BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed from existing profile data so nothing is lost
INSERT INTO social_links (platform, label, url, order_index, visible)
SELECT 'email',
       email,
       'mailto:' || email,
       0,
       true
FROM profile
WHERE email IS NOT NULL AND email <> ''
ON CONFLICT DO NOTHING;

INSERT INTO social_links (platform, label, url, order_index, visible)
SELECT 'github',
       regexp_replace(github_url, 'https?://(www\.)?', ''),
       github_url,
       1,
       true
FROM profile
WHERE github_url IS NOT NULL AND github_url <> ''
ON CONFLICT DO NOTHING;

INSERT INTO social_links (platform, label, url, order_index, visible)
SELECT 'linkedin',
       regexp_replace(linkedin_url, 'https?://(www\.)?', ''),
       linkedin_url,
       2,
       true
FROM profile
WHERE linkedin_url IS NOT NULL AND linkedin_url <> ''
ON CONFLICT DO NOTHING;
