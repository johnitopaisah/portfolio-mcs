'use strict';

const pool = require('../../db/client');
const { resolveCvEmail } = require('./emailResolver');

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
  const [profileRes, expRes, skillsRes, certRes, eduRes, projectsRes, refereesRes] = await Promise.all([
    pool.query(`
      SELECT name, headline, bio, email, github_url, linkedin_url, hero_tags,
             cv_display_name, cv_headline,
             cv_email_primary, cv_email_choice, application_emails,
             cv_website, cv_phone, cv_location_display
      FROM profile LIMIT 1
    `),
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
    pool.query(`
      SELECT jsonb_agg(jsonb_build_object(
        'institution',   institution,
        'degree',        degree,
        'field',         field_of_study,
        'start_date',    start_date,
        'end_date',      end_date,
        'ongoing',       ongoing,
        'grade',         grade,
        'description',   description
      ) ORDER BY order_index) AS data
      FROM education
    `),
    pool.query(`
      SELECT jsonb_agg(jsonb_build_object(
        'title',       title,
        'description', description,
        'tech_stack',  tech_stack,
        'live_url',    live_url,
        'repo_url',    repo_url,
        'start_date',  start_date,
        'end_date',    end_date,
        'ongoing',     ongoing
      ) ORDER BY order_index) AS data
      FROM projects
      WHERE published = TRUE
    `),
    pool.query(`
      SELECT jsonb_agg(jsonb_build_object(
        'name',         name,
        'title',        title,
        'organisation', organization,
        'email',        email,
        'relationship', relationship
      )) AS data
      FROM referees
      WHERE visible = TRUE
    `).catch(() => ({ rows: [{ data: [] }] })),
  ]);

  const p = profileRes.rows[0] || {};

  const contentJson = {
    name:           p.cv_display_name || p.name,
    headline:       p.cv_headline     || p.headline,
    bio:            p.bio,
    email:          resolveCvEmail(p),
    phone:          p.cv_phone           || '',
    location:       p.cv_location_display || '',
    website:        p.cv_website         || '',
    github_url:     p.github_url,
    linkedin_url:   p.linkedin_url,
    hero_tags:      p.hero_tags,
    experiences:    expRes.rows[0]?.data     || [],
    skills:         skillsRes.rows[0]?.data  || [],
    certifications: certRes.rows[0]?.data    || [],
    education:      eduRes.rows[0]?.data     || [],
    projects:       projectsRes.rows[0]?.data || [],
    references:     refereesRes.rows[0]?.data || [],
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
