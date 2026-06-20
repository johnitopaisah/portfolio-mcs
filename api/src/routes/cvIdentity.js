'use strict';

const express         = require('express');
const pool            = require('../db/client');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const CV_FIELDS = [
  'cv_display_name', 'cv_headline', 'cv_website', 'cv_phone',
  'cv_location_display', 'cv_linkedin', 'cv_github',
  'cv_email_primary', 'cv_email_secondary',
  'cv_contact_fields', 'application_emails',
];

// GET /api/cv-identity
router.get('/', requireAuth, async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${CV_FIELDS.join(', ')}, name AS full_name, email FROM profile LIMIT 1`
    );
    res.json(rows[0] || {});
  } catch (err) { next(err); }
});

// PATCH /api/cv-identity
router.patch('/', requireAuth, async (req, res, next) => {
  const fields = [];
  const vals   = [];
  let i = 1;

  for (const key of CV_FIELDS) {
    if (req.body[key] !== undefined) {
      // JSONB fields need explicit casting
      if (key === 'cv_contact_fields' || key === 'application_emails') {
        fields.push(`${key} = $${i++}::jsonb`);
        vals.push(JSON.stringify(req.body[key]));
      } else {
        fields.push(`${key} = $${i++}`);
        vals.push(req.body[key]);
      }
    }
  }

  if (!fields.length) return res.status(400).json({ error: 'No valid fields provided' });

  try {
    const { rows } = await pool.query(
      `UPDATE profile SET ${fields.join(', ')} RETURNING ${CV_FIELDS.join(', ')}, name AS full_name`,
      vals
    );
    res.json(rows[0] || {});
  } catch (err) { next(err); }
});

// POST /api/cv-identity/build-contact-fields
// Auto-builds cv_contact_fields from existing profile data
router.post('/build-contact-fields', requireAuth, async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT name AS full_name, email, cv_display_name, cv_email_primary, cv_email_secondary,
              cv_website, cv_phone, cv_linkedin, cv_github, cv_location_display
       FROM profile LIMIT 1`
    );
    if (!rows.length) return res.status(404).json({ error: 'Profile not found' });
    const p = rows[0];

    const fields = [
      { field: 'email',    label: 'Email',    value: p.cv_email_primary || p.email || '',  visible: true,  order: 0 },
      { field: 'website',  label: 'Website',  value: p.cv_website || '',                    visible: !!p.cv_website, order: 1 },
      { field: 'phone',    label: 'Phone',    value: p.cv_phone || '',                      visible: !!p.cv_phone,   order: 2 },
      { field: 'linkedin', label: 'LinkedIn', value: p.cv_linkedin || '',                   visible: !!p.cv_linkedin, order: 3 },
      { field: 'github',   label: 'GitHub',   value: p.cv_github || '',                     visible: !!p.cv_github,  order: 4 },
      { field: 'location', label: 'Location', value: p.cv_location_display || '',           visible: !!p.cv_location_display, order: 5 },
    ];

    await pool.query(
      'UPDATE profile SET cv_contact_fields=$1::jsonb',
      [JSON.stringify(fields)]
    );

    res.json({ fields });
  } catch (err) { next(err); }
});

module.exports = router;
