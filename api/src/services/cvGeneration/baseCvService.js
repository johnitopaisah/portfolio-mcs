'use strict';

const pool = require('../../db/client');

let _cache = null;

async function getActiveBaseCv() {
  if (_cache) return _cache;

  const result = await pool.query(
    'SELECT * FROM base_cv_versions WHERE is_active = TRUE ORDER BY id DESC LIMIT 1'
  );

  if (!result.rows.length) {
    throw new Error('No active base CV version found. Run the migration seed.');
  }

  _cache = result.rows[0];
  return _cache;
}

async function refreshBaseCv() {
  const [profileRes, expRes, skillsRes, certRes] = await Promise.all([
    pool.query('SELECT name, headline, bio, email, github_url, linkedin_url, hero_tags FROM profile LIMIT 1'),
    pool.query(`
      SELECT jsonb_agg(jsonb_build_object(
        'company',    company,
        'role',       role,
        'description',description,
        'start_date', start_date,
        'end_date',   end_date,
        'ongoing',    ongoing,
        'tech_stack', tech_stack
      ) ORDER BY order_index) AS data
      FROM experiences
    `),
    pool.query(`
      SELECT jsonb_agg(jsonb_build_object(
        'name',        name,
        'category',    category,
        'proficiency', proficiency
      ) ORDER BY order_index) AS data
      FROM skills
    `),
    pool.query(`
      SELECT jsonb_agg(jsonb_build_object(
        'name',           name,
        'issuer',         issuer,
        'issue_date',     issue_date,
        'expiry_date',    expiry_date,
        'credential_url', credential_url
      ) ORDER BY issue_date DESC) AS data
      FROM certifications
    `),
  ]);

  const p = profileRes.rows[0] || {};

  const contentJson = {
    name:         p.name,
    headline:     p.headline,
    bio:          p.bio,
    email:        p.email,
    github_url:   p.github_url,
    linkedin_url: p.linkedin_url,
    hero_tags:    p.hero_tags,
    experiences:  expRes.rows[0]?.data   || [],
    skills:       skillsRes.rows[0]?.data || [],
    certifications: certRes.rows[0]?.data || [],
  };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const versionRes = await client.query(
      'SELECT COALESCE(MAX(version), 0) + 1 AS next_version FROM base_cv_versions'
    );
    const nextVersion = versionRes.rows[0].next_version;

    await client.query('UPDATE base_cv_versions SET is_active = FALSE WHERE is_active = TRUE');
    const insertRes = await client.query(
      `INSERT INTO base_cv_versions (name, content_json, version, is_active)
       VALUES ($1, $2, $3, TRUE)
       RETURNING *`,
      [`v${nextVersion} — assembled from portfolio DB`, contentJson, nextVersion]
    );
    await client.query('COMMIT');
    _cache = null;
    return insertRes.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { getActiveBaseCv, refreshBaseCv };
