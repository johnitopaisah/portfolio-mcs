-- ============================================================
--  Dummy data for local testing
--  Run AFTER containers are up:
--    docker compose exec -T db psql -U portfolio_user -d portfolio_db -f - < bootstrapping/dummy_data.sql
-- ============================================================

-- 1. Insert dummy certifications with placeholder badge images
--    (1x1 pixel purple PNG encoded as base64 — renders as a tiny coloured dot)
DO $$
DECLARE
  tiny_png BYTEA := decode(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64'
  );
  id1 UUID; id2 UUID; id3 UUID; id4 UUID;
BEGIN
  -- Insert certs only if certifications table is empty
  IF (SELECT COUNT(*) FROM certifications) = 0 THEN
    INSERT INTO certifications (name, issuer, issue_date, image, image_mime, order_index)
    VALUES ('Certified Kubernetes Administrator', 'CNCF', '2024-01-15', tiny_png, 'image/png', 0)
    RETURNING id INTO id1;

    INSERT INTO certifications (name, issuer, issue_date, image, image_mime, order_index)
    VALUES ('AWS Solutions Architect', 'Amazon Web Services', '2024-03-20', tiny_png, 'image/png', 1)
    RETURNING id INTO id2;

    INSERT INTO certifications (name, issuer, issue_date, image, image_mime, order_index)
    VALUES ('HashiCorp Terraform Associate', 'HashiCorp', '2023-11-10', tiny_png, 'image/png', 2)
    RETURNING id INTO id3;

    INSERT INTO certifications (name, issuer, issue_date, image, image_mime, order_index)
    VALUES ('Docker Certified Associate', 'Docker', '2023-08-05', tiny_png, 'image/png', 3)
    RETURNING id INTO id4;

    -- Set orbit_badge_ids on profile to show all 4 in the butterfly animation
    UPDATE profile SET orbit_badge_ids = ARRAY[id1::TEXT, id2::TEXT, id3::TEXT, id4::TEXT];

    RAISE NOTICE 'Inserted 4 dummy certifications and set orbit_badge_ids';
  ELSE
    -- Certs exist — just grab the first 4 and set orbit_badge_ids
    UPDATE profile
    SET orbit_badge_ids = (
      SELECT ARRAY_AGG(id::TEXT ORDER BY order_index)
      FROM (SELECT id, order_index FROM certifications LIMIT 4) sub
    );
    RAISE NOTICE 'Certifications already exist — updated orbit_badge_ids with first 4';
  END IF;
END $$;

-- 2. Ensure social_links has the 3 default entries (idempotent)
INSERT INTO social_links (platform, label, url, order_index, visible)
VALUES
  ('email',    'johnitopaisah@gmail.com',       'mailto:johnitopaisah@gmail.com',       0, true),
  ('github',   'github.com/johnitopaisah',       'https://github.com/johnitopaisah',     1, true),
  ('linkedin', 'linkedin.com/in/johnitopaisah',  'https://linkedin.com/in/johnitopaisah', 2, true)
ON CONFLICT DO NOTHING;

-- 3. Add a Medium link as an extra to test extensibility
INSERT INTO social_links (platform, label, url, order_index, visible)
SELECT 'medium', 'medium.com/@johnitopaisah', 'https://medium.com/@johnitopaisah', 3, true
WHERE NOT EXISTS (SELECT 1 FROM social_links WHERE platform = 'medium');

SELECT 'Done — dummy data loaded' AS status;
