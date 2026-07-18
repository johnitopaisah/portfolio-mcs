-- ═══════════════════════════════════════════════════════════════════
-- MIGRATION 018: Full Feature Expansion
--   CV Identity · Document Intelligence · Interview Intelligence
--   Communication Toolkit · Workflow Automation · Goal Tracking
-- ═══════════════════════════════════════════════════════════════════

-- ── CV IDENTITY ──────────────────────────────────────────────────────
ALTER TABLE profile
  ADD COLUMN IF NOT EXISTS cv_display_name      VARCHAR(100),
  ADD COLUMN IF NOT EXISTS cv_headline          VARCHAR(200),
  ADD COLUMN IF NOT EXISTS cv_website           VARCHAR(255),
  ADD COLUMN IF NOT EXISTS cv_phone             VARCHAR(50),
  ADD COLUMN IF NOT EXISTS cv_location_display  VARCHAR(100),
  ADD COLUMN IF NOT EXISTS cv_linkedin          VARCHAR(255),
  ADD COLUMN IF NOT EXISTS cv_github            VARCHAR(255),
  ADD COLUMN IF NOT EXISTS cv_email_primary     VARCHAR(255),
  ADD COLUMN IF NOT EXISTS cv_email_secondary   VARCHAR(255),
  ADD COLUMN IF NOT EXISTS cv_contact_fields    JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS application_emails   JSONB DEFAULT '[]'::jsonb;

-- cv_contact_fields shape:
-- [{ "field":"email","label":"Email","value":"...","visible":true,"order":0 }, ...]
-- application_emails shape:
-- [{ "label":"Gmail","email":"...","is_default":true }, ...]

ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS applied_from_email VARCHAR(255);

-- ── DOCUMENT INTELLIGENCE ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS portfolio_items (
  id           SERIAL PRIMARY KEY,
  title        VARCHAR(200) NOT NULL,
  description  TEXT,
  url          VARCHAR(500),
  item_type    VARCHAR(50) CHECK (item_type IN
                 ('github','live_site','case_study','article',
                  'video','design','other')),
  tags         TEXT[],
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS application_portfolio_items (
  id                 SERIAL PRIMARY KEY,
  application_id     INTEGER NOT NULL REFERENCES applications(id)  ON DELETE CASCADE,
  portfolio_item_id  INTEGER NOT NULL REFERENCES portfolio_items(id) ON DELETE CASCADE,
  note               TEXT,
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (application_id, portfolio_item_id)
);

CREATE TABLE IF NOT EXISTS reference_usage (
  id              SERIAL PRIMARY KEY,
  application_id  INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  referee_id      UUID    NOT NULL REFERENCES referees(id)     ON DELETE CASCADE,
  asked_at        TIMESTAMPTZ,
  confirmed_at    TIMESTAMPTZ,
  note            TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ref_usage_app  ON reference_usage(application_id);
CREATE INDEX IF NOT EXISTS idx_portfolio_app  ON application_portfolio_items(application_id);

-- ── INTERVIEW INTELLIGENCE ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS company_research (
  id                    SERIAL PRIMARY KEY,
  application_id        INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE UNIQUE,
  funding_stage         VARCHAR(50),
  employee_count_range  VARCHAR(50),
  glassdoor_rating      NUMERIC(2,1) CHECK (glassdoor_rating BETWEEN 1 AND 5),
  interview_difficulty  VARCHAR(20) CHECK (interview_difficulty IN ('easy','medium','hard','unknown')),
  headquarters          VARCHAR(100),
  founded_year          INTEGER,
  tech_stack_confirmed  TEXT[],
  competitors           TEXT[],
  recent_news           TEXT,
  culture_notes         TEXT,
  red_flags             TEXT,
  links                 JSONB DEFAULT '[]'::jsonb,
  raw_notes             TEXT,
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS star_stories (
  id          SERIAL PRIMARY KEY,
  title       VARCHAR(200),
  situation   TEXT NOT NULL,
  task        TEXT NOT NULL,
  action      TEXT NOT NULL,
  result      TEXT NOT NULL,
  themes      TEXT[] DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS interview_questions (
  id              SERIAL PRIMARY KEY,
  application_id  INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  question        TEXT NOT NULL,
  question_type   VARCHAR(50) CHECK (question_type IN ('technical','behavioral','situational','company')),
  difficulty      VARCHAR(20) CHECK (difficulty IN ('easy','medium','hard')),
  ai_hint         TEXT,
  star_story_id   INTEGER REFERENCES star_stories(id) ON DELETE SET NULL,
  answer_notes    TEXT,
  was_asked       BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_iq_app ON interview_questions(application_id);

-- ── COMMUNICATION TOOLKIT ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_templates (
  id               SERIAL PRIMARY KEY,
  name             VARCHAR(100) NOT NULL,
  category         VARCHAR(50) CHECK (category IN (
                     'follow_up','thank_you','withdrawal','negotiation',
                     'rejection_feedback','timeline_request','reconnect','general')),
  subject_template TEXT,
  body_template    TEXT,
  is_system        BOOLEAN DEFAULT FALSE,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS application_communications (
  id              SERIAL PRIMARY KEY,
  application_id  INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  template_id     INTEGER REFERENCES email_templates(id) ON DELETE SET NULL,
  comm_type       VARCHAR(50) CHECK (comm_type IN ('email','linkedin_message','phone','other'))
                    DEFAULT 'email',
  direction       VARCHAR(10) CHECK (direction IN ('outbound','inbound')) DEFAULT 'outbound',
  subject         TEXT,
  body            TEXT,
  sent_to         VARCHAR(255),
  sent_from       VARCHAR(255),
  sent_at         TIMESTAMPTZ DEFAULT NOW(),
  channel         VARCHAR(50),
  note            TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS linkedin_outreach (
  id                SERIAL PRIMARY KEY,
  application_id    INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  contact_name      VARCHAR(200),
  contact_title     VARCHAR(200),
  linkedin_url      VARCHAR(500),
  message_sent      TEXT,
  sent_at           TIMESTAMPTZ,
  replied_at        TIMESTAMPTZ,
  meeting_booked_at TIMESTAMPTZ,
  status            VARCHAR(50) DEFAULT 'sent'
                      CHECK (status IN ('draft','sent','replied','meeting_booked','no_reply')),
  note              TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comms_app     ON application_communications(application_id);
CREATE INDEX IF NOT EXISTS idx_linkedin_app  ON linkedin_outreach(application_id);

-- ── WORKFLOW AUTOMATION ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS automation_rules (
  id            SERIAL PRIMARY KEY,
  rule_key      VARCHAR(100) UNIQUE NOT NULL,
  name          VARCHAR(200) NOT NULL,
  description   TEXT,
  is_enabled    BOOLEAN DEFAULT TRUE,
  trigger_type  VARCHAR(50),
  config        JSONB DEFAULT '{}'::jsonb,
  last_ran_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS automation_log (
  id              SERIAL PRIMARY KEY,
  rule_key        VARCHAR(100),
  application_id  INTEGER REFERENCES applications(id) ON DELETE CASCADE,
  action_taken    VARCHAR(200),
  detail          TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auto_log_app ON automation_log(application_id);
CREATE INDEX IF NOT EXISTS idx_auto_log_ts  ON automation_log(created_at DESC);

INSERT INTO automation_rules (rule_key, name, description, trigger_type, config) VALUES
('follow_up_7d',
 'Follow-up reminder after 7 days',
 'Creates a reminder when application sits in APPLIED for 7+ days with no follow-up',
 'time_since_status',
 '{"days":7,"statuses":["APPLIED"],"reminder_type":"follow_up","reminder_title":"Follow up with {{company}}"}'
),
('interview_prep_24h',
 'Interview prep reminder 24h before',
 'Creates a prep reminder when interview_at is within 24 hours',
 'schedule',
 '{"hours_before":24,"reminder_type":"preparation","reminder_title":"Prep session: {{company}} interview tomorrow"}'
),
('post_interview_3d',
 'Post-interview follow-up after 3 days',
 'Flags application 3 days after interview with no status change',
 'time_since_status',
 '{"days":3,"statuses":["INTERVIEW_SCHEDULED","FINAL_INTERVIEW","TECHNICAL_TEST"],"reminder_type":"follow_up","reminder_title":"Send thank-you / chase {{company}}"}'
),
('offer_deadline_48h',
 'Offer response reminder 48h before deadline',
 'Creates reminder when offer follow_up_at is within 48 hours',
 'schedule',
 '{"hours_before":48,"reminder_type":"deadline","reminder_title":"Respond to offer from {{company}}"}'
),
('stale_14d',
 'Stale application alert after 14 days',
 'Flags applications with no activity for 14+ days in active statuses',
 'time_since_status',
 '{"days":14,"statuses":["APPLIED","EMAIL_RECEIVED","HR_CONTACTED"],"reminder_type":"review","reminder_title":"Review stale application: {{company}}"}'
)
ON CONFLICT (rule_key) DO NOTHING;

-- ── GOAL TRACKING ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_settings (
  id                       SERIAL PRIMARY KEY,
  weekly_application_goal  INTEGER DEFAULT 5,
  goal_start_day           VARCHAR(10) DEFAULT 'monday',
  job_hunt_active          BOOLEAN DEFAULT TRUE,
  target_role              VARCHAR(200),
  target_salary_min        INTEGER,
  target_salary_max        INTEGER,
  target_locations         TEXT[] DEFAULT '{}',
  target_work_arrangements TEXT[] DEFAULT '{}',
  available_from           DATE,
  notice_period_days       INTEGER,
  created_at               TIMESTAMPTZ DEFAULT NOW(),
  updated_at               TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO user_settings DEFAULT VALUES
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS weekly_snapshots (
  id                  SERIAL PRIMARY KEY,
  week_start          DATE NOT NULL UNIQUE,
  applications_count  INTEGER DEFAULT 0,
  interviews_count    INTEGER DEFAULT 0,
  offers_count        INTEGER DEFAULT 0,
  responses_count     INTEGER DEFAULT 0,
  goal_met            BOOLEAN DEFAULT FALSE,
  health_score        INTEGER,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ── EMAIL TEMPLATE SEEDS ─────────────────────────────────────────────
INSERT INTO email_templates (name, category, subject_template, body_template, is_system)
VALUES
('Follow-up after applying','follow_up',
 'Following up — {{role}} application',
 E'Hi {{recruiter_name}},\n\nI hope you''re well. I''m writing to follow up on my application for the {{role}} position at {{company}}, submitted on {{applied_date}}.\n\nI remain very excited about this opportunity and would love to discuss how my background aligns with your needs.\n\nThank you for your time.\n\nBest regards,\n{{your_name}}',
 TRUE),
('Post-interview thank you','thank_you',
 'Thank you — {{role}} interview at {{company}}',
 E'Hi {{recruiter_name}},\n\nThank you for taking the time to speak with me today about the {{role}} role at {{company}}. I genuinely enjoyed our conversation and came away even more enthusiastic about the opportunity.\n\nI''d welcome the chance to continue the discussion. Please let me know if you need anything further.\n\nBest regards,\n{{your_name}}',
 TRUE),
('Request for timeline update','timeline_request',
 'Quick check-in — {{role}} at {{company}}',
 E'Hi {{recruiter_name}},\n\nI wanted to reach out regarding the {{role}} position. I''m still very interested and wondered if you could share an update on the timeline or next steps.\n\nI''m happy to provide any additional information.\n\nThank you,\n{{your_name}}',
 TRUE),
('Withdrawal — accepted another offer','withdrawal',
 'Withdrawing application — {{role}} at {{company}}',
 E'Hi {{recruiter_name}},\n\nI''m writing to let you know that I''ve accepted another position and would like to withdraw my application for the {{role}} role at {{company}}.\n\nI appreciate the time and consideration given to my application. I hold {{company}} in high regard and hope our paths cross in the future.\n\nBest wishes,\n{{your_name}}',
 TRUE),
('Salary negotiation opener','negotiation',
 'Re: Offer — {{role}} at {{company}}',
 E'Hi {{recruiter_name}},\n\nThank you for the offer for the {{role}} position — I''m genuinely excited about the opportunity and the team.\n\nAfter careful consideration, I was hoping we could discuss the base salary. Based on my research and experience, I was expecting something closer to [TARGET FIGURE]. Would there be any flexibility on this?\n\nI''m very keen to make this work and look forward to your thoughts.\n\nBest regards,\n{{your_name}}',
 TRUE),
('Rejection feedback request','rejection_feedback',
 'Feedback request — {{role}} at {{company}}',
 E'Hi {{recruiter_name}},\n\nThank you for letting me know about your decision regarding the {{role}} role at {{company}}. While I''m disappointed, I fully respect the decision.\n\nI''d be grateful if you could spare a moment to share any feedback on my application or interviews — it would be genuinely valuable for my development.\n\nThank you again for your time.\n\nBest,\n{{your_name}}',
 TRUE),
('Reconnect with recruiter','reconnect',
 'Checking in — open to new opportunities',
 E'Hi {{recruiter_name}},\n\nI hope you''re doing well. I''m reaching out as I''m actively exploring new opportunities and thought of you.\n\nI''d love to reconnect and hear if you have anything that might be a good fit for my background.\n\nBest regards,\n{{your_name}}',
 TRUE)
ON CONFLICT DO NOTHING;
