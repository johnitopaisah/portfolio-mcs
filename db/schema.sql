-- ============================================================
--  Portfolio MCS — Master Schema
--  Auto-runs on first container start via docker-entrypoint-initdb.d
--  (db/Dockerfile → 01-schema.sql), then 02-seed.sh adds the admin user.
--
--  GENERATED — do not edit by hand. This is a schema-only pg_dump of the
--  database after every migration through 037_repair_indexes.sql
--  (the previous hand-written file no longer built a working database:
--  statements were out of order and one had a syntax error).
--
--  Schema changes go in db/migrations/ as a new numbered file; the API
--  image applies them automatically (api/scripts/migrate.js, ArgoCD
--  PreSync). The schema_migrations rows at the end record that this
--  snapshot already includes 001–037, so a fresh
--  database only ever runs migrations added after it.
--
--  Regenerate after adding migrations (optional — the runner applies new
--  files on top of this snapshot either way):
--    pg_dump --schema-only --no-owner --no-privileges  > db/schema.sql
--    and refresh the schema_migrations block below.
-- ============================================================

--
-- PostgreSQL database dump
--


-- Dumped from database version 16.16
-- Dumped by pg_dump version 16.16

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: pg_trgm; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;


--
-- Name: EXTENSION pg_trgm; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pg_trgm IS 'text similarity measurement and index searching based on trigrams';


--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;


--
-- Name: set_updated_at_generic(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at_generic() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: admin_user; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_user (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    username text NOT NULL,
    password_hash text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: app_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_settings (
    key text NOT NULL,
    value text,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: application_communications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.application_communications (
    id integer NOT NULL,
    application_id integer NOT NULL,
    template_id integer,
    comm_type character varying(50) DEFAULT 'email'::character varying,
    direction character varying(10) DEFAULT 'outbound'::character varying,
    subject text,
    body text,
    sent_to character varying(255),
    sent_from character varying(255),
    sent_at timestamp with time zone DEFAULT now(),
    channel character varying(50),
    note text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT application_communications_comm_type_check CHECK (((comm_type)::text = ANY (ARRAY[('email'::character varying)::text, ('linkedin_message'::character varying)::text, ('phone'::character varying)::text, ('other'::character varying)::text]))),
    CONSTRAINT application_communications_direction_check CHECK (((direction)::text = ANY (ARRAY[('outbound'::character varying)::text, ('inbound'::character varying)::text])))
);


--
-- Name: application_communications_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.application_communications_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: application_communications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.application_communications_id_seq OWNED BY public.application_communications.id;


--
-- Name: application_contacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.application_contacts (
    id integer NOT NULL,
    application_id integer NOT NULL,
    name text NOT NULL,
    title text,
    email text,
    linkedin_url text,
    role text DEFAULT 'recruiter'::text,
    notes text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: application_contacts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.application_contacts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: application_contacts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.application_contacts_id_seq OWNED BY public.application_contacts.id;


--
-- Name: application_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.application_documents (
    id integer NOT NULL,
    application_id integer NOT NULL,
    document_type text NOT NULL,
    content_json jsonb,
    source_html text,
    file_data bytea,
    version integer DEFAULT 1 NOT NULL,
    base_cv_version integer,
    ai_model text,
    prompt_version text,
    generated_by_ai boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    template_id character varying(50) DEFAULT 'classic'::character varying,
    color_scheme character varying(20) DEFAULT 'colored'::character varying,
    accent_color character varying(10) DEFAULT '#2563EB'::character varying,
    sections_included jsonb DEFAULT '["summary", "skills", "experience", "education", "certifications"]'::jsonb,
    generation_hints text,
    generation_config jsonb DEFAULT '{}'::jsonb,
    is_manually_edited boolean DEFAULT false NOT NULL,
    edited_at timestamp with time zone,
    last_autosaved_at timestamp with time zone,
    CONSTRAINT application_documents_document_type_check CHECK ((document_type = ANY (ARRAY['CV'::text, 'COVER_LETTER'::text, 'MESSAGE'::text])))
);


--
-- Name: COLUMN application_documents.template_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.application_documents.template_id IS 'CV template key: classic, modern, minimal, executive, technical, harvard, startup, wallstreet, ats-pure, creative, sidebar';


--
-- Name: COLUMN application_documents.color_scheme; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.application_documents.color_scheme IS 'colored | bw';


--
-- Name: COLUMN application_documents.accent_color; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.application_documents.accent_color IS 'Hex accent color used when color_scheme=colored';


--
-- Name: COLUMN application_documents.sections_included; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.application_documents.sections_included IS 'Ordered array of section keys to render: summary, skills, experience, education, certifications, projects, references';


--
-- Name: COLUMN application_documents.generation_hints; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.application_documents.generation_hints IS 'Free-text user instructions injected into AI tailoring prompt';


--
-- Name: COLUMN application_documents.generation_config; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.application_documents.generation_config IS 'Full generation config snapshot: intensity, hint_chips, section_presets, etc.';


--
-- Name: application_documents_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.application_documents_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: application_documents_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.application_documents_id_seq OWNED BY public.application_documents.id;


--
-- Name: application_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.application_events (
    id integer NOT NULL,
    application_id integer NOT NULL,
    event_type text NOT NULL,
    description text,
    event_date timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: application_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.application_events_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: application_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.application_events_id_seq OWNED BY public.application_events.id;


--
-- Name: application_portfolio_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.application_portfolio_items (
    id integer NOT NULL,
    application_id integer NOT NULL,
    portfolio_item_id integer NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: application_portfolio_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.application_portfolio_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: application_portfolio_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.application_portfolio_items_id_seq OWNED BY public.application_portfolio_items.id;


--
-- Name: application_reminders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.application_reminders (
    id integer NOT NULL,
    application_id integer NOT NULL,
    reminder_type text DEFAULT 'custom'::text NOT NULL,
    title text NOT NULL,
    remind_at timestamp with time zone NOT NULL,
    is_done boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: application_reminders_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.application_reminders_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: application_reminders_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.application_reminders_id_seq OWNED BY public.application_reminders.id;


--
-- Name: applications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.applications (
    id integer NOT NULL,
    job_id uuid,
    company_name text NOT NULL,
    job_title text NOT NULL,
    job_url text,
    company_domain text,
    source_platform text,
    application_email_used text,
    match_score numeric(4,2),
    status text DEFAULT 'DRAFT'::text NOT NULL,
    applied_at timestamp with time zone,
    last_response_at timestamp with time zone,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    source_url text,
    entry_method text DEFAULT 'scraper'::text,
    matched_skills text[] DEFAULT '{}'::text[],
    missing_skills text[] DEFAULT '{}'::text[],
    strongest_angle text,
    cover_letter_hook text,
    suggested_hints text[] DEFAULT '{}'::text[],
    suggested_sections text[] DEFAULT '{}'::text[],
    follow_up_at timestamp with time zone,
    interview_at timestamp with time zone,
    submitted_doc_id integer,
    rejection_reason text,
    referral_from text,
    interview_prep jsonb DEFAULT '{}'::jsonb,
    applied_from_email character varying(255)
);


--
-- Name: applications_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.applications_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: applications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.applications_id_seq OWNED BY public.applications.id;


--
-- Name: auth_attempts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auth_attempts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    attempted_at timestamp with time zone DEFAULT now() NOT NULL,
    username text NOT NULL,
    result text NOT NULL,
    ip_address text,
    user_agent text,
    CONSTRAINT auth_attempts_result_check CHECK ((result = ANY (ARRAY['success'::text, 'failure'::text])))
);


--
-- Name: automation_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.automation_log (
    id integer NOT NULL,
    rule_key character varying(100),
    application_id integer,
    action_taken character varying(200),
    detail text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: automation_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.automation_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: automation_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.automation_log_id_seq OWNED BY public.automation_log.id;


--
-- Name: automation_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.automation_rules (
    id integer NOT NULL,
    rule_key character varying(100) NOT NULL,
    name character varying(200) NOT NULL,
    description text,
    is_enabled boolean DEFAULT true,
    trigger_type character varying(50),
    config jsonb DEFAULT '{}'::jsonb,
    last_ran_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: automation_rules_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.automation_rules_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: automation_rules_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.automation_rules_id_seq OWNED BY public.automation_rules.id;


--
-- Name: base_cv_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.base_cv_versions (
    id integer NOT NULL,
    name text NOT NULL,
    content_json jsonb NOT NULL,
    source_html text,
    version integer DEFAULT 1 NOT NULL,
    is_active boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: base_cv_versions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.base_cv_versions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: base_cv_versions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.base_cv_versions_id_seq OWNED BY public.base_cv_versions.id;


--
-- Name: blog_click_daily; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.blog_click_daily (
    post_id uuid NOT NULL,
    day date NOT NULL,
    clicks integer NOT NULL,
    uniques integer NOT NULL
);


--
-- Name: blog_clicks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.blog_clicks (
    id bigint NOT NULL,
    post_id uuid NOT NULL,
    clicked_at timestamp with time zone DEFAULT now() NOT NULL,
    visitor_hash text NOT NULL,
    country_code text,
    country text,
    region text,
    city text,
    device_type text,
    os text,
    browser text,
    language text,
    source_page text,
    traffic_source text
);


--
-- Name: blog_clicks_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.blog_clicks_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: blog_clicks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.blog_clicks_id_seq OWNED BY public.blog_clicks.id;


--
-- Name: blog_posts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.blog_posts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    medium_guid text NOT NULL,
    title text NOT NULL,
    excerpt text,
    cover_image_url text,
    medium_url text NOT NULL,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    published_at timestamp with time zone,
    ingested_at timestamp with time zone DEFAULT now() NOT NULL,
    visible_on_site boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    linkedin_shared_at timestamp with time zone,
    linkedin_post_urn text
);


--
-- Name: certifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.certifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    issuer text NOT NULL,
    issue_date date NOT NULL,
    expiry_date date,
    credential_id text,
    credential_url text,
    image bytea,
    image_mime text,
    order_index integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: companies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.companies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    external_id text,
    name text NOT NULL,
    industry text,
    size text,
    logo_url text,
    website_url text,
    founded_year integer,
    headquarters text,
    description text,
    verified boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: company_research; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.company_research (
    id integer NOT NULL,
    application_id integer NOT NULL,
    funding_stage character varying(50),
    employee_count_range character varying(50),
    glassdoor_rating numeric(2,1),
    interview_difficulty character varying(20),
    headquarters character varying(100),
    founded_year integer,
    tech_stack_confirmed text[],
    competitors text[],
    recent_news text,
    culture_notes text,
    red_flags text,
    links jsonb DEFAULT '[]'::jsonb,
    raw_notes text,
    updated_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT company_research_glassdoor_rating_check CHECK (((glassdoor_rating >= (1)::numeric) AND (glassdoor_rating <= (5)::numeric))),
    CONSTRAINT company_research_interview_difficulty_check CHECK (((interview_difficulty)::text = ANY (ARRAY[('easy'::character varying)::text, ('medium'::character varying)::text, ('hard'::character varying)::text, ('unknown'::character varying)::text])))
);


--
-- Name: company_research_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.company_research_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: company_research_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.company_research_id_seq OWNED BY public.company_research.id;


--
-- Name: contact_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contact_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    subject text NOT NULL,
    message text NOT NULL,
    read boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: crawl_seen_urls; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crawl_seen_urls (
    url text NOT NULL,
    first_seen_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: education; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.education (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    institution text NOT NULL,
    institution_url text,
    degree text NOT NULL,
    field_of_study text NOT NULL,
    description text,
    grade text,
    activities text,
    start_date date NOT NULL,
    end_date date,
    ongoing boolean DEFAULT false NOT NULL,
    logo bytea,
    logo_mime text,
    order_index integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: email_responses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_responses (
    id integer NOT NULL,
    application_id integer,
    gmail_message_id text,
    sender_email text,
    sender_name text,
    subject text,
    body_snippet text,
    received_at timestamp with time zone,
    ai_classification text,
    confidence_score numeric(4,3),
    raw_label text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    source_account text DEFAULT 'gmail'::text NOT NULL,
    reviewed_correct boolean,
    corrected_classification text,
    extracted_company text,
    extracted_role text,
    match_method text,
    suggested_application_id integer,
    thread_id text,
    message_id text,
    imap_folder text,
    imap_uid bigint,
    ai_suggested_status text,
    review_status text,
    CONSTRAINT email_responses_review_status_check CHECK (((review_status IS NULL) OR (review_status = ANY (ARRAY['PENDING'::text, 'APPROVED'::text, 'REJECTED'::text]))))
);


--
-- Name: email_responses_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.email_responses_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: email_responses_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.email_responses_id_seq OWNED BY public.email_responses.id;


--
-- Name: email_sync_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_sync_logs (
    id integer NOT NULL,
    source_account text NOT NULL,
    status text NOT NULL,
    emails_fetched integer DEFAULT 0 NOT NULL,
    emails_new integer DEFAULT 0 NOT NULL,
    error_message text,
    duration_ms integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    details jsonb,
    CONSTRAINT email_sync_logs_status_check CHECK ((status = ANY (ARRAY['SUCCESS'::text, 'PARTIAL'::text, 'FAILED'::text])))
);


--
-- Name: email_sync_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.email_sync_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: email_sync_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.email_sync_logs_id_seq OWNED BY public.email_sync_logs.id;


--
-- Name: email_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_templates (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    category character varying(50),
    subject_template text,
    body_template text,
    is_system boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT email_templates_category_check CHECK (((category)::text = ANY (ARRAY[('follow_up'::character varying)::text, ('thank_you'::character varying)::text, ('withdrawal'::character varying)::text, ('negotiation'::character varying)::text, ('rejection_feedback'::character varying)::text, ('timeline_request'::character varying)::text, ('reconnect'::character varying)::text, ('general'::character varying)::text])))
);


--
-- Name: email_templates_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.email_templates_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: email_templates_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.email_templates_id_seq OWNED BY public.email_templates.id;


--
-- Name: experiences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.experiences (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company text NOT NULL,
    role text NOT NULL,
    description text NOT NULL,
    start_date date NOT NULL,
    end_date date,
    ongoing boolean DEFAULT false NOT NULL,
    tech_stack text[] DEFAULT '{}'::text[] NOT NULL,
    logo bytea,
    logo_mime text,
    order_index integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: imap_folder_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.imap_folder_state (
    source_account text NOT NULL,
    folder text NOT NULL,
    uid_validity bigint NOT NULL,
    last_uid bigint DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: imap_message_failures; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.imap_message_failures (
    source_account text NOT NULL,
    message_id text NOT NULL,
    attempts integer DEFAULT 1 NOT NULL,
    last_error text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: interview_questions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.interview_questions (
    id integer NOT NULL,
    application_id integer NOT NULL,
    question text NOT NULL,
    question_type character varying(50),
    difficulty character varying(20),
    ai_hint text,
    star_story_id integer,
    answer_notes text,
    was_asked boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT interview_questions_difficulty_check CHECK (((difficulty)::text = ANY (ARRAY[('easy'::character varying)::text, ('medium'::character varying)::text, ('hard'::character varying)::text]))),
    CONSTRAINT interview_questions_question_type_check CHECK (((question_type)::text = ANY (ARRAY[('technical'::character varying)::text, ('behavioral'::character varying)::text, ('situational'::character varying)::text, ('company'::character varying)::text])))
);


--
-- Name: interview_questions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.interview_questions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: interview_questions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.interview_questions_id_seq OWNED BY public.interview_questions.id;


--
-- Name: job_feedback; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.job_feedback (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    job_id uuid NOT NULL,
    decision text NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT job_feedback_decision_check CHECK ((decision = ANY (ARRAY['applied'::text, 'saved'::text, 'skipped'::text, 'interested'::text, 'skip'::text, 'hidden'::text])))
);


--
-- Name: job_ingestion_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.job_ingestion_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    source_api text NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    status text NOT NULL,
    jobs_fetched integer,
    jobs_new integer,
    jobs_duplicates integer,
    jobs_filtered integer,
    error_message text,
    duration_ms integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: job_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.job_preferences (
    id uuid NOT NULL,
    desired_roles text[] DEFAULT '{}'::text[] NOT NULL,
    desired_locations text[] DEFAULT '{Remote,France,EU,Europe}'::text[] NOT NULL,
    min_salary numeric,
    required_tech_stack text[] DEFAULT '{}'::text[] NOT NULL,
    avoid_tech_stack text[] DEFAULT '{}'::text[] NOT NULL,
    preferred_seniority text[] DEFAULT '{}'::text[] NOT NULL,
    visa_requirement text,
    min_relevance_score smallint DEFAULT 65 NOT NULL,
    digest_email text,
    digest_time text DEFAULT '08:15'::text NOT NULL,
    excluded_companies text[] DEFAULT '{}'::text[] NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    ai_engine text DEFAULT 'pattern'::text NOT NULL,
    llm_enabled boolean DEFAULT false NOT NULL,
    ambiguous_min smallint DEFAULT 30 NOT NULL,
    ambiguous_max smallint DEFAULT 72 NOT NULL,
    pattern_role_keywords text[] DEFAULT '{}'::text[] NOT NULL,
    pattern_tech_boosts jsonb DEFAULT '[]'::jsonb NOT NULL,
    pattern_penalties jsonb DEFAULT '[]'::jsonb NOT NULL,
    pattern_locations text[] DEFAULT '{}'::text[] NOT NULL
);


--
-- Name: job_targets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.job_targets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    role_query text NOT NULL,
    locations text[] DEFAULT '{}'::text[] NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    min_score smallint,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    posted_within_days smallint
);


--
-- Name: jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    job_raw_id uuid,
    external_id text NOT NULL,
    company_name text NOT NULL,
    title text NOT NULL,
    location text DEFAULT 'Remote'::text NOT NULL,
    job_type text,
    description text,
    requirements text,
    salary_min numeric,
    salary_max numeric,
    salary_currency text,
    posted_at timestamp with time zone DEFAULT now() NOT NULL,
    apply_url text,
    source_api text,
    relevance_score smallint DEFAULT 50 NOT NULL,
    ai_decision text DEFAULT 'REVIEW'::text NOT NULL,
    ai_reasoning text,
    tech_stack text[] DEFAULT '{}'::text[] NOT NULL,
    seniority_level text,
    visa_sponsored boolean,
    is_active boolean DEFAULT true NOT NULL,
    expires_at timestamp with time zone,
    notified_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    entry_method text DEFAULT 'scraper'::text,
    raw_text text,
    source_url text,
    role_summary text,
    red_flags text[] DEFAULT '{}'::text[],
    required_skills text[] DEFAULT '{}'::text[],
    nice_to_have text[] DEFAULT '{}'::text[],
    soft_skills text[] DEFAULT '{}'::text[],
    certifications_req text[] DEFAULT '{}'::text[],
    languages_required text[] DEFAULT '{}'::text[],
    company_stage text,
    team_size_hint text,
    reporting_to text,
    work_arrangement text,
    CONSTRAINT jobs_ai_decision_check CHECK ((ai_decision = ANY (ARRAY['KEEP'::text, 'REVIEW'::text, 'DROP'::text])))
);


--
-- Name: jobs_raw; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.jobs_raw (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    external_id text NOT NULL,
    company_id uuid,
    company_name text NOT NULL,
    title text NOT NULL,
    location text,
    job_type text,
    description text NOT NULL,
    requirements text,
    salary_min numeric(10,2),
    salary_max numeric(10,2),
    salary_currency text,
    posted_at timestamp with time zone NOT NULL,
    apply_url text NOT NULL,
    source_api text NOT NULL,
    raw_data jsonb,
    dedup_hash text,
    is_duplicate boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: known_boards; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.known_boards (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ats_platform text NOT NULL,
    board_slug text NOT NULL,
    first_discovered_via text,
    last_polled_at timestamp with time zone,
    last_yield_count integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    consecutive_failures integer DEFAULT 0 NOT NULL,
    backoff_until timestamp with time zone
);


--
-- Name: linkedin_outreach; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.linkedin_outreach (
    id integer NOT NULL,
    application_id integer NOT NULL,
    contact_name character varying(200),
    contact_title character varying(200),
    linkedin_url character varying(500),
    message_sent text,
    sent_at timestamp with time zone,
    replied_at timestamp with time zone,
    meeting_booked_at timestamp with time zone,
    status character varying(50) DEFAULT 'sent'::character varying,
    note text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT linkedin_outreach_status_check CHECK (((status)::text = ANY (ARRAY[('draft'::character varying)::text, ('sent'::character varying)::text, ('replied'::character varying)::text, ('meeting_booked'::character varying)::text, ('no_reply'::character varying)::text])))
);


--
-- Name: linkedin_outreach_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.linkedin_outreach_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: linkedin_outreach_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.linkedin_outreach_id_seq OWNED BY public.linkedin_outreach.id;


--
-- Name: llm_requests_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.llm_requests_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider text NOT NULL,
    status text NOT NULL,
    prompt_tokens integer,
    completion_tokens integer,
    estimated_cost_usd numeric(12,6),
    duration_ms integer,
    error_message text,
    requested_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT llm_requests_log_status_check CHECK ((status = ANY (ARRAY['success'::text, 'failed'::text])))
);


--
-- Name: notification_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    channel text NOT NULL,
    alert_key text NOT NULL,
    sent_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: password_reset_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.password_reset_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    token text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: portfolio_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.portfolio_items (
    id integer NOT NULL,
    title character varying(200) NOT NULL,
    description text,
    url character varying(500),
    item_type character varying(50),
    tags text[],
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT portfolio_items_item_type_check CHECK (((item_type)::text = ANY (ARRAY[('github'::character varying)::text, ('live_site'::character varying)::text, ('case_study'::character varying)::text, ('article'::character varying)::text, ('video'::character varying)::text, ('design'::character varying)::text, ('other'::character varying)::text])))
);


--
-- Name: portfolio_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.portfolio_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: portfolio_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.portfolio_items_id_seq OWNED BY public.portfolio_items.id;


--
-- Name: profile; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profile (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    headline text NOT NULL,
    bio text NOT NULL,
    avatar bytea,
    avatar_mime text,
    resume bytea,
    resume_mime text,
    github_url text,
    linkedin_url text,
    email text NOT NULL,
    hero_tags text[] DEFAULT '{}'::text[] NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    resume_en bytea,
    resume_en_mime text,
    resume_fr bytea,
    resume_fr_mime text,
    availability_status text DEFAULT 'active'::text NOT NULL,
    orbit_badge_ids text[] DEFAULT '{}'::text[] NOT NULL,
    cv_display_name character varying(100),
    cv_headline character varying(200),
    cv_website character varying(255),
    cv_phone character varying(50),
    cv_location_display character varying(100),
    cv_linkedin character varying(255),
    cv_github character varying(255),
    cv_email_primary character varying(255),
    cv_email_secondary character varying(255),
    cv_contact_fields jsonb DEFAULT '[]'::jsonb,
    application_emails jsonb DEFAULT '[]'::jsonb,
    cv_email_choice text DEFAULT 'gmail'::text,
    CONSTRAINT availability_status_check CHECK ((availability_status = ANY (ARRAY['active'::text, 'passive'::text, 'not_open'::text]))),
    CONSTRAINT profile_cv_email_choice_check CHECK ((cv_email_choice = ANY (ARRAY['gmail'::text, 'professional'::text, 'both'::text, 'none'::text])))
);


--
-- Name: project_images; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_images (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    image bytea NOT NULL,
    image_mime text DEFAULT 'image/jpeg'::text NOT NULL,
    caption text,
    order_index integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: projects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.projects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    description text NOT NULL,
    tech_stack text[] DEFAULT '{}'::text[] NOT NULL,
    live_url text,
    repo_url text,
    image bytea,
    image_mime text,
    featured boolean DEFAULT false NOT NULL,
    published boolean DEFAULT false NOT NULL,
    order_index integer DEFAULT 0 NOT NULL,
    start_date date,
    end_date date,
    ongoing boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: referee_contact_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.referee_contact_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    referee_id uuid NOT NULL,
    requester_name text NOT NULL,
    requester_email text NOT NULL,
    requester_email_verified boolean DEFAULT false NOT NULL,
    requester_company text,
    requester_linkedin_url text,
    requester_purpose text DEFAULT 'recruiting'::text NOT NULL,
    requester_message text,
    status text DEFAULT 'submitted'::text NOT NULL,
    verification_token uuid DEFAULT gen_random_uuid(),
    verification_token_expires_at timestamp with time zone,
    consent_token uuid,
    consent_token_expires_at timestamp with time zone,
    consent_resend_count integer DEFAULT 0 NOT NULL,
    consent_reminder_count integer DEFAULT 0 NOT NULL,
    consent_last_reminded_at timestamp with time zone,
    consent_requested_at timestamp with time zone,
    consent_responded_at timestamp with time zone,
    admin_note text,
    resend_note text,
    fulfilled_at timestamp with time zone,
    declined_at timestamp with time zone,
    expires_at timestamp with time zone DEFAULT (now() + '30 days'::interval) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT rcr_purpose_check CHECK ((requester_purpose = ANY (ARRAY['recruiting'::text, 'collaboration'::text, 'other'::text]))),
    CONSTRAINT rcr_status_check CHECK ((status = ANY (ARRAY['submitted'::text, 'approved'::text, 'rejected'::text, 'consent_requested'::text, 'consent_given'::text, 'consent_denied'::text, 'fulfilled'::text, 'declined'::text, 'expired'::text])))
);


--
-- Name: referee_invitations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.referee_invitations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    token text NOT NULL,
    note text,
    type text DEFAULT 'create'::text NOT NULL,
    referee_id uuid,
    expires_at timestamp with time zone NOT NULL,
    used boolean DEFAULT false NOT NULL,
    used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    referee_email text
);


--
-- Name: referees; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.referees (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    title text NOT NULL,
    organization text NOT NULL,
    relationship text NOT NULL,
    review text,
    linkedin_url text,
    email text,
    phone text,
    available_on_request boolean DEFAULT true NOT NULL,
    photo bytea,
    photo_mime text,
    org_logo bytea,
    org_logo_mime text,
    order_index integer DEFAULT 0 NOT NULL,
    visible boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    modification_requested boolean DEFAULT false NOT NULL,
    modification_requested_at timestamp with time zone,
    star_config jsonb
);


--
-- Name: reference_usage; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reference_usage (
    id integer NOT NULL,
    application_id integer NOT NULL,
    referee_id uuid NOT NULL,
    asked_at timestamp with time zone,
    confirmed_at timestamp with time zone,
    note text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: reference_usage_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.reference_usage_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: reference_usage_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.reference_usage_id_seq OWNED BY public.reference_usage.id;


--
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schema_migrations (
    filename text NOT NULL,
    checksum text NOT NULL,
    applied_at timestamp with time zone DEFAULT now() NOT NULL,
    duration_ms integer,
    applied_by text DEFAULT 'migrate'::text NOT NULL
);


--
-- Name: skills; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.skills (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    category text NOT NULL,
    proficiency smallint NOT NULL,
    icon bytea,
    icon_mime text,
    order_index integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT skills_proficiency_check CHECK (((proficiency >= 1) AND (proficiency <= 5)))
);


--
-- Name: social_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.social_links (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    platform text NOT NULL,
    label text NOT NULL,
    url text NOT NULL,
    order_index integer DEFAULT 0 NOT NULL,
    visible boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: star_stories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.star_stories (
    id integer NOT NULL,
    title character varying(200),
    situation text NOT NULL,
    task text NOT NULL,
    action text NOT NULL,
    result text NOT NULL,
    themes text[] DEFAULT '{}'::text[],
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: star_stories_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.star_stories_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: star_stories_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.star_stories_id_seq OWNED BY public.star_stories.id;


--
-- Name: user_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_settings (
    id integer NOT NULL,
    weekly_application_goal integer DEFAULT 5,
    goal_start_day character varying(10) DEFAULT 'monday'::character varying,
    job_hunt_active boolean DEFAULT true,
    target_role character varying(200),
    target_salary_min integer,
    target_salary_max integer,
    target_locations text[] DEFAULT '{}'::text[],
    target_work_arrangements text[] DEFAULT '{}'::text[],
    available_from date,
    notice_period_days integer,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: user_settings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.user_settings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.user_settings_id_seq OWNED BY public.user_settings.id;


--
-- Name: visitor_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.visitor_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    visited_at timestamp with time zone DEFAULT now() NOT NULL,
    ip_address text,
    country_code text,
    country text,
    city text,
    region text,
    latitude numeric(9,6),
    longitude numeric(9,6),
    browser text,
    os text,
    device_type text,
    referer_raw text,
    referer_label text,
    language text,
    is_bot boolean DEFAULT false NOT NULL,
    session_id text
);


--
-- Name: weekly_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.weekly_snapshots (
    id integer NOT NULL,
    week_start date NOT NULL,
    applications_count integer DEFAULT 0,
    interviews_count integer DEFAULT 0,
    offers_count integer DEFAULT 0,
    responses_count integer DEFAULT 0,
    goal_met boolean DEFAULT false,
    health_score integer,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: weekly_snapshots_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.weekly_snapshots_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: weekly_snapshots_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.weekly_snapshots_id_seq OWNED BY public.weekly_snapshots.id;


--
-- Name: application_communications id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.application_communications ALTER COLUMN id SET DEFAULT nextval('public.application_communications_id_seq'::regclass);


--
-- Name: application_contacts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.application_contacts ALTER COLUMN id SET DEFAULT nextval('public.application_contacts_id_seq'::regclass);


--
-- Name: application_documents id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.application_documents ALTER COLUMN id SET DEFAULT nextval('public.application_documents_id_seq'::regclass);


--
-- Name: application_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.application_events ALTER COLUMN id SET DEFAULT nextval('public.application_events_id_seq'::regclass);


--
-- Name: application_portfolio_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.application_portfolio_items ALTER COLUMN id SET DEFAULT nextval('public.application_portfolio_items_id_seq'::regclass);


--
-- Name: application_reminders id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.application_reminders ALTER COLUMN id SET DEFAULT nextval('public.application_reminders_id_seq'::regclass);


--
-- Name: applications id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.applications ALTER COLUMN id SET DEFAULT nextval('public.applications_id_seq'::regclass);


--
-- Name: automation_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_log ALTER COLUMN id SET DEFAULT nextval('public.automation_log_id_seq'::regclass);


--
-- Name: automation_rules id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_rules ALTER COLUMN id SET DEFAULT nextval('public.automation_rules_id_seq'::regclass);


--
-- Name: base_cv_versions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.base_cv_versions ALTER COLUMN id SET DEFAULT nextval('public.base_cv_versions_id_seq'::regclass);


--
-- Name: blog_clicks id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_clicks ALTER COLUMN id SET DEFAULT nextval('public.blog_clicks_id_seq'::regclass);


--
-- Name: company_research id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_research ALTER COLUMN id SET DEFAULT nextval('public.company_research_id_seq'::regclass);


--
-- Name: email_responses id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_responses ALTER COLUMN id SET DEFAULT nextval('public.email_responses_id_seq'::regclass);


--
-- Name: email_sync_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_sync_logs ALTER COLUMN id SET DEFAULT nextval('public.email_sync_logs_id_seq'::regclass);


--
-- Name: email_templates id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_templates ALTER COLUMN id SET DEFAULT nextval('public.email_templates_id_seq'::regclass);


--
-- Name: interview_questions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interview_questions ALTER COLUMN id SET DEFAULT nextval('public.interview_questions_id_seq'::regclass);


--
-- Name: linkedin_outreach id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.linkedin_outreach ALTER COLUMN id SET DEFAULT nextval('public.linkedin_outreach_id_seq'::regclass);


--
-- Name: portfolio_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.portfolio_items ALTER COLUMN id SET DEFAULT nextval('public.portfolio_items_id_seq'::regclass);


--
-- Name: reference_usage id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reference_usage ALTER COLUMN id SET DEFAULT nextval('public.reference_usage_id_seq'::regclass);


--
-- Name: star_stories id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.star_stories ALTER COLUMN id SET DEFAULT nextval('public.star_stories_id_seq'::regclass);


--
-- Name: user_settings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_settings ALTER COLUMN id SET DEFAULT nextval('public.user_settings_id_seq'::regclass);


--
-- Name: weekly_snapshots id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weekly_snapshots ALTER COLUMN id SET DEFAULT nextval('public.weekly_snapshots_id_seq'::regclass);


--
-- Name: admin_user admin_user_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_user
    ADD CONSTRAINT admin_user_pkey PRIMARY KEY (id);


--
-- Name: admin_user admin_user_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_user
    ADD CONSTRAINT admin_user_username_key UNIQUE (username);


--
-- Name: app_settings app_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_settings
    ADD CONSTRAINT app_settings_pkey PRIMARY KEY (key);


--
-- Name: application_communications application_communications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.application_communications
    ADD CONSTRAINT application_communications_pkey PRIMARY KEY (id);


--
-- Name: application_contacts application_contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.application_contacts
    ADD CONSTRAINT application_contacts_pkey PRIMARY KEY (id);


--
-- Name: application_documents application_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.application_documents
    ADD CONSTRAINT application_documents_pkey PRIMARY KEY (id);


--
-- Name: application_events application_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.application_events
    ADD CONSTRAINT application_events_pkey PRIMARY KEY (id);


--
-- Name: application_portfolio_items application_portfolio_items_application_id_portfolio_item_i_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.application_portfolio_items
    ADD CONSTRAINT application_portfolio_items_application_id_portfolio_item_i_key UNIQUE (application_id, portfolio_item_id);


--
-- Name: application_portfolio_items application_portfolio_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.application_portfolio_items
    ADD CONSTRAINT application_portfolio_items_pkey PRIMARY KEY (id);


--
-- Name: application_reminders application_reminders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.application_reminders
    ADD CONSTRAINT application_reminders_pkey PRIMARY KEY (id);


--
-- Name: applications applications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.applications
    ADD CONSTRAINT applications_pkey PRIMARY KEY (id);


--
-- Name: auth_attempts auth_attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_attempts
    ADD CONSTRAINT auth_attempts_pkey PRIMARY KEY (id);


--
-- Name: automation_log automation_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_log
    ADD CONSTRAINT automation_log_pkey PRIMARY KEY (id);


--
-- Name: automation_rules automation_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_rules
    ADD CONSTRAINT automation_rules_pkey PRIMARY KEY (id);


--
-- Name: automation_rules automation_rules_rule_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_rules
    ADD CONSTRAINT automation_rules_rule_key_key UNIQUE (rule_key);


--
-- Name: base_cv_versions base_cv_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.base_cv_versions
    ADD CONSTRAINT base_cv_versions_pkey PRIMARY KEY (id);


--
-- Name: blog_click_daily blog_click_daily_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_click_daily
    ADD CONSTRAINT blog_click_daily_pkey PRIMARY KEY (post_id, day);


--
-- Name: blog_clicks blog_clicks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_clicks
    ADD CONSTRAINT blog_clicks_pkey PRIMARY KEY (id);


--
-- Name: blog_posts blog_posts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_posts
    ADD CONSTRAINT blog_posts_pkey PRIMARY KEY (id);


--
-- Name: certifications certifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.certifications
    ADD CONSTRAINT certifications_pkey PRIMARY KEY (id);


--
-- Name: companies companies_external_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_external_id_key UNIQUE (external_id);


--
-- Name: companies companies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_pkey PRIMARY KEY (id);


--
-- Name: company_research company_research_application_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_research
    ADD CONSTRAINT company_research_application_id_key UNIQUE (application_id);


--
-- Name: company_research company_research_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_research
    ADD CONSTRAINT company_research_pkey PRIMARY KEY (id);


--
-- Name: contact_messages contact_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_messages
    ADD CONSTRAINT contact_messages_pkey PRIMARY KEY (id);


--
-- Name: crawl_seen_urls crawl_seen_urls_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crawl_seen_urls
    ADD CONSTRAINT crawl_seen_urls_pkey PRIMARY KEY (url);


--
-- Name: education education_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.education
    ADD CONSTRAINT education_pkey PRIMARY KEY (id);


--
-- Name: email_responses email_responses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_responses
    ADD CONSTRAINT email_responses_pkey PRIMARY KEY (id);


--
-- Name: email_sync_logs email_sync_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_sync_logs
    ADD CONSTRAINT email_sync_logs_pkey PRIMARY KEY (id);


--
-- Name: email_templates email_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_templates
    ADD CONSTRAINT email_templates_pkey PRIMARY KEY (id);


--
-- Name: experiences experiences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.experiences
    ADD CONSTRAINT experiences_pkey PRIMARY KEY (id);


--
-- Name: imap_folder_state imap_folder_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.imap_folder_state
    ADD CONSTRAINT imap_folder_state_pkey PRIMARY KEY (source_account, folder);


--
-- Name: imap_message_failures imap_message_failures_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.imap_message_failures
    ADD CONSTRAINT imap_message_failures_pkey PRIMARY KEY (source_account, message_id);


--
-- Name: interview_questions interview_questions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interview_questions
    ADD CONSTRAINT interview_questions_pkey PRIMARY KEY (id);


--
-- Name: job_feedback job_feedback_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_feedback
    ADD CONSTRAINT job_feedback_pkey PRIMARY KEY (id);


--
-- Name: job_ingestion_logs job_ingestion_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_ingestion_logs
    ADD CONSTRAINT job_ingestion_logs_pkey PRIMARY KEY (id);


--
-- Name: job_preferences job_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_preferences
    ADD CONSTRAINT job_preferences_pkey PRIMARY KEY (id);


--
-- Name: job_targets job_targets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_targets
    ADD CONSTRAINT job_targets_pkey PRIMARY KEY (id);


--
-- Name: jobs jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobs
    ADD CONSTRAINT jobs_pkey PRIMARY KEY (id);


--
-- Name: jobs_raw jobs_raw_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobs_raw
    ADD CONSTRAINT jobs_raw_pkey PRIMARY KEY (id);


--
-- Name: known_boards known_boards_ats_platform_board_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.known_boards
    ADD CONSTRAINT known_boards_ats_platform_board_slug_key UNIQUE (ats_platform, board_slug);


--
-- Name: known_boards known_boards_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.known_boards
    ADD CONSTRAINT known_boards_pkey PRIMARY KEY (id);


--
-- Name: linkedin_outreach linkedin_outreach_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.linkedin_outreach
    ADD CONSTRAINT linkedin_outreach_pkey PRIMARY KEY (id);


--
-- Name: llm_requests_log llm_requests_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.llm_requests_log
    ADD CONSTRAINT llm_requests_log_pkey PRIMARY KEY (id);


--
-- Name: notification_log notification_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_log
    ADD CONSTRAINT notification_log_pkey PRIMARY KEY (id);


--
-- Name: password_reset_tokens password_reset_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_pkey PRIMARY KEY (id);


--
-- Name: password_reset_tokens password_reset_tokens_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_token_key UNIQUE (token);


--
-- Name: portfolio_items portfolio_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.portfolio_items
    ADD CONSTRAINT portfolio_items_pkey PRIMARY KEY (id);


--
-- Name: profile profile_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile
    ADD CONSTRAINT profile_pkey PRIMARY KEY (id);


--
-- Name: project_images project_images_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_images
    ADD CONSTRAINT project_images_pkey PRIMARY KEY (id);


--
-- Name: projects projects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_pkey PRIMARY KEY (id);


--
-- Name: referee_contact_requests referee_contact_requests_consent_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referee_contact_requests
    ADD CONSTRAINT referee_contact_requests_consent_token_key UNIQUE (consent_token);


--
-- Name: referee_contact_requests referee_contact_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referee_contact_requests
    ADD CONSTRAINT referee_contact_requests_pkey PRIMARY KEY (id);


--
-- Name: referee_contact_requests referee_contact_requests_verification_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referee_contact_requests
    ADD CONSTRAINT referee_contact_requests_verification_token_key UNIQUE (verification_token);


--
-- Name: referee_invitations referee_invitations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referee_invitations
    ADD CONSTRAINT referee_invitations_pkey PRIMARY KEY (id);


--
-- Name: referee_invitations referee_invitations_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referee_invitations
    ADD CONSTRAINT referee_invitations_token_key UNIQUE (token);


--
-- Name: referees referees_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referees
    ADD CONSTRAINT referees_pkey PRIMARY KEY (id);


--
-- Name: reference_usage reference_usage_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reference_usage
    ADD CONSTRAINT reference_usage_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (filename);


--
-- Name: skills skills_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skills
    ADD CONSTRAINT skills_pkey PRIMARY KEY (id);


--
-- Name: social_links social_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_links
    ADD CONSTRAINT social_links_pkey PRIMARY KEY (id);


--
-- Name: star_stories star_stories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.star_stories
    ADD CONSTRAINT star_stories_pkey PRIMARY KEY (id);


--
-- Name: user_settings user_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_settings
    ADD CONSTRAINT user_settings_pkey PRIMARY KEY (id);


--
-- Name: visitor_logs visitor_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visitor_logs
    ADD CONSTRAINT visitor_logs_pkey PRIMARY KEY (id);


--
-- Name: weekly_snapshots weekly_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weekly_snapshots
    ADD CONSTRAINT weekly_snapshots_pkey PRIMARY KEY (id);


--
-- Name: weekly_snapshots weekly_snapshots_week_start_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weekly_snapshots
    ADD CONSTRAINT weekly_snapshots_week_start_key UNIQUE (week_start);


--
-- Name: blog_posts_medium_guid_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX blog_posts_medium_guid_key ON public.blog_posts USING btree (medium_guid);


--
-- Name: email_responses_source_message_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX email_responses_source_message_key ON public.email_responses USING btree (source_account, gmail_message_id);


--
-- Name: email_responses_source_msgid_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX email_responses_source_msgid_key ON public.email_responses USING btree (source_account, message_id) WHERE (message_id IS NOT NULL);


--
-- Name: idx_app_contacts_app_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_app_contacts_app_id ON public.application_contacts USING btree (application_id);


--
-- Name: idx_app_docs_application_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_app_docs_application_id ON public.application_documents USING btree (application_id);


--
-- Name: idx_app_events_application_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_app_events_application_id ON public.application_events USING btree (application_id);


--
-- Name: idx_app_reminders_app_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_app_reminders_app_id ON public.application_reminders USING btree (application_id);


--
-- Name: idx_app_reminders_due; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_app_reminders_due ON public.application_reminders USING btree (remind_at) WHERE (is_done = false);


--
-- Name: idx_applications_company_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_applications_company_trgm ON public.applications USING gin (company_name public.gin_trgm_ops);


--
-- Name: idx_applications_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_applications_created_at ON public.applications USING btree (created_at);


--
-- Name: idx_applications_job_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_applications_job_id ON public.applications USING btree (job_id);


--
-- Name: idx_applications_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_applications_status ON public.applications USING btree (status);


--
-- Name: idx_auth_attempts_ip_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_auth_attempts_ip_time ON public.auth_attempts USING btree (ip_address, attempted_at);


--
-- Name: idx_auth_attempts_username_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_auth_attempts_username_time ON public.auth_attempts USING btree (username, attempted_at);


--
-- Name: idx_auto_log_app; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_auto_log_app ON public.automation_log USING btree (application_id);


--
-- Name: idx_auto_log_ts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_auto_log_ts ON public.automation_log USING btree (created_at DESC);


--
-- Name: idx_blog_clicks_clicked_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_blog_clicks_clicked_at ON public.blog_clicks USING btree (clicked_at DESC);


--
-- Name: idx_blog_clicks_post_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_blog_clicks_post_time ON public.blog_clicks USING btree (post_id, clicked_at DESC);


--
-- Name: idx_blog_posts_published_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_blog_posts_published_at ON public.blog_posts USING btree (published_at DESC);


--
-- Name: idx_blog_posts_visible_published; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_blog_posts_visible_published ON public.blog_posts USING btree (visible_on_site, published_at DESC);


--
-- Name: idx_certs_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_certs_order ON public.certifications USING btree (order_index, issue_date DESC);


--
-- Name: idx_comms_app; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_comms_app ON public.application_communications USING btree (application_id);


--
-- Name: idx_companies_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_companies_name ON public.companies USING btree (name);


--
-- Name: idx_education_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_education_order ON public.education USING btree (order_index, start_date DESC);


--
-- Name: idx_email_responses_review_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_responses_review_pending ON public.email_responses USING btree (received_at DESC) WHERE (review_status = 'PENDING'::text);


--
-- Name: idx_email_responses_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_responses_source ON public.email_responses USING btree (source_account);


--
-- Name: idx_email_responses_thread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_responses_thread ON public.email_responses USING btree (source_account, thread_id) WHERE (thread_id IS NOT NULL);


--
-- Name: idx_email_sync_logs_source_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_sync_logs_source_created ON public.email_sync_logs USING btree (source_account, created_at DESC);


--
-- Name: idx_ingest_logs_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ingest_logs_created ON public.job_ingestion_logs USING btree (created_at DESC);


--
-- Name: idx_ingest_logs_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ingest_logs_source ON public.job_ingestion_logs USING btree (source_api, created_at DESC);


--
-- Name: idx_ingestion_logs_source_api; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ingestion_logs_source_api ON public.job_ingestion_logs USING btree (source_api, started_at DESC);


--
-- Name: idx_iq_app; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_iq_app ON public.interview_questions USING btree (application_id);


--
-- Name: idx_job_feedback_action; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_job_feedback_action ON public.job_feedback USING btree (decision, created_at DESC);


--
-- Name: idx_job_feedback_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_job_feedback_created_at ON public.job_feedback USING btree (created_at DESC);


--
-- Name: idx_job_feedback_decision; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_job_feedback_decision ON public.job_feedback USING btree (decision);


--
-- Name: idx_job_targets_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_job_targets_active ON public.job_targets USING btree (is_active);


--
-- Name: idx_jobs_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_jobs_active ON public.jobs USING btree (is_active, relevance_score DESC) WHERE (is_active = true);


--
-- Name: idx_jobs_active_score; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_jobs_active_score ON public.jobs USING btree (relevance_score DESC, posted_at DESC) WHERE ((is_active = true) AND (ai_decision <> 'DROP'::text));


--
-- Name: idx_jobs_decision; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_jobs_decision ON public.jobs USING btree (ai_decision);


--
-- Name: idx_jobs_is_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_jobs_is_active ON public.jobs USING btree (is_active) WHERE (is_active = true);


--
-- Name: idx_jobs_location; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_jobs_location ON public.jobs USING btree (location);


--
-- Name: idx_jobs_notified; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_jobs_notified ON public.jobs USING btree (notified_at) WHERE (notified_at IS NULL);


--
-- Name: idx_jobs_posted; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_jobs_posted ON public.jobs USING btree (posted_at DESC);


--
-- Name: idx_jobs_raw_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_jobs_raw_company_id ON public.jobs_raw USING btree (company_id);


--
-- Name: idx_jobs_raw_dedup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_jobs_raw_dedup ON public.jobs_raw USING btree (dedup_hash);


--
-- Name: idx_jobs_raw_dup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_jobs_raw_dup ON public.jobs_raw USING btree (is_duplicate) WHERE (is_duplicate = false);


--
-- Name: idx_jobs_raw_posted; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_jobs_raw_posted ON public.jobs_raw USING btree (posted_at DESC);


--
-- Name: idx_jobs_raw_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_jobs_raw_source ON public.jobs_raw USING btree (source_api, created_at DESC);


--
-- Name: idx_jobs_raw_title_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_jobs_raw_title_trgm ON public.jobs_raw USING gin (title public.gin_trgm_ops);


--
-- Name: idx_jobs_relevance_score; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_jobs_relevance_score ON public.jobs USING btree (relevance_score DESC) WHERE (is_active = true);


--
-- Name: idx_jobs_tech; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_jobs_tech ON public.jobs USING gin (tech_stack);


--
-- Name: idx_jobs_title_tsvector; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_jobs_title_tsvector ON public.jobs USING gin (to_tsvector('english'::regconfig, ((title || ' '::text) || description)));


--
-- Name: idx_known_boards_backoff; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_known_boards_backoff ON public.known_boards USING btree (backoff_until) WHERE (backoff_until IS NOT NULL);


--
-- Name: idx_known_boards_platform; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_known_boards_platform ON public.known_boards USING btree (ats_platform);


--
-- Name: idx_linkedin_app; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_linkedin_app ON public.linkedin_outreach USING btree (application_id);


--
-- Name: idx_llm_requests_log_provider_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_llm_requests_log_provider_time ON public.llm_requests_log USING btree (provider, requested_at);


--
-- Name: idx_messages_unread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_unread ON public.contact_messages USING btree (read, created_at DESC);


--
-- Name: idx_notif_log_key_sent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notif_log_key_sent ON public.notification_log USING btree (alert_key, sent_at DESC);


--
-- Name: idx_portfolio_app; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_portfolio_app ON public.application_portfolio_items USING btree (application_id);


--
-- Name: idx_project_images_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_project_images_project ON public.project_images USING btree (project_id, order_index);


--
-- Name: idx_projects_featured; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_projects_featured ON public.projects USING btree (featured) WHERE (featured = true);


--
-- Name: idx_projects_published; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_projects_published ON public.projects USING btree (published, order_index);


--
-- Name: idx_rcr_consent_reminder; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rcr_consent_reminder ON public.referee_contact_requests USING btree (status, consent_last_reminded_at) WHERE (status = 'consent_requested'::text);


--
-- Name: idx_rcr_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rcr_created_at ON public.referee_contact_requests USING btree (created_at DESC);


--
-- Name: idx_rcr_referee_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rcr_referee_id ON public.referee_contact_requests USING btree (referee_id);


--
-- Name: idx_rcr_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rcr_status ON public.referee_contact_requests USING btree (status);


--
-- Name: idx_ref_usage_app; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ref_usage_app ON public.reference_usage USING btree (application_id);


--
-- Name: idx_referees_visible_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_referees_visible_order ON public.referees USING btree (visible, order_index, created_at);


--
-- Name: idx_skills_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_skills_category ON public.skills USING btree (category, order_index);


--
-- Name: idx_social_links_visible_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_social_links_visible_order ON public.social_links USING btree (visible, order_index, created_at);


--
-- Name: idx_visitor_country; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_visitor_country ON public.visitor_logs USING btree (country_code);


--
-- Name: idx_visitor_is_bot; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_visitor_is_bot ON public.visitor_logs USING btree (is_bot) WHERE (is_bot = false);


--
-- Name: idx_visitor_session; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_visitor_session ON public.visitor_logs USING btree (session_id);


--
-- Name: idx_visitor_visited_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_visitor_visited_at ON public.visitor_logs USING btree (visited_at DESC);


--
-- Name: job_feedback_job_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX job_feedback_job_id_key ON public.job_feedback USING btree (job_id);


--
-- Name: jobs_external_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX jobs_external_id_key ON public.jobs USING btree (external_id);


--
-- Name: jobs_raw_external_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX jobs_raw_external_id_key ON public.jobs_raw USING btree (external_id);


--
-- Name: notification_log_channel_alert_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX notification_log_channel_alert_key ON public.notification_log USING btree (channel, alert_key);


--
-- Name: job_targets trg_job_targets_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_job_targets_updated_at BEFORE UPDATE ON public.job_targets FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_generic();


--
-- Name: application_communications application_communications_application_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.application_communications
    ADD CONSTRAINT application_communications_application_id_fkey FOREIGN KEY (application_id) REFERENCES public.applications(id) ON DELETE CASCADE;


--
-- Name: application_communications application_communications_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.application_communications
    ADD CONSTRAINT application_communications_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.email_templates(id) ON DELETE SET NULL;


--
-- Name: application_contacts application_contacts_application_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.application_contacts
    ADD CONSTRAINT application_contacts_application_id_fkey FOREIGN KEY (application_id) REFERENCES public.applications(id) ON DELETE CASCADE;


--
-- Name: application_documents application_documents_application_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.application_documents
    ADD CONSTRAINT application_documents_application_id_fkey FOREIGN KEY (application_id) REFERENCES public.applications(id) ON DELETE CASCADE;


--
-- Name: application_documents application_documents_base_cv_version_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.application_documents
    ADD CONSTRAINT application_documents_base_cv_version_fkey FOREIGN KEY (base_cv_version) REFERENCES public.base_cv_versions(id);


--
-- Name: application_events application_events_application_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.application_events
    ADD CONSTRAINT application_events_application_id_fkey FOREIGN KEY (application_id) REFERENCES public.applications(id) ON DELETE CASCADE;


--
-- Name: application_portfolio_items application_portfolio_items_application_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.application_portfolio_items
    ADD CONSTRAINT application_portfolio_items_application_id_fkey FOREIGN KEY (application_id) REFERENCES public.applications(id) ON DELETE CASCADE;


--
-- Name: application_portfolio_items application_portfolio_items_portfolio_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.application_portfolio_items
    ADD CONSTRAINT application_portfolio_items_portfolio_item_id_fkey FOREIGN KEY (portfolio_item_id) REFERENCES public.portfolio_items(id) ON DELETE CASCADE;


--
-- Name: application_reminders application_reminders_application_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.application_reminders
    ADD CONSTRAINT application_reminders_application_id_fkey FOREIGN KEY (application_id) REFERENCES public.applications(id) ON DELETE CASCADE;


--
-- Name: applications applications_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.applications
    ADD CONSTRAINT applications_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE SET NULL;


--
-- Name: applications applications_submitted_doc_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.applications
    ADD CONSTRAINT applications_submitted_doc_id_fkey FOREIGN KEY (submitted_doc_id) REFERENCES public.application_documents(id) ON DELETE SET NULL;


--
-- Name: automation_log automation_log_application_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_log
    ADD CONSTRAINT automation_log_application_id_fkey FOREIGN KEY (application_id) REFERENCES public.applications(id) ON DELETE CASCADE;


--
-- Name: blog_click_daily blog_click_daily_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_click_daily
    ADD CONSTRAINT blog_click_daily_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.blog_posts(id) ON DELETE CASCADE;


--
-- Name: blog_clicks blog_clicks_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_clicks
    ADD CONSTRAINT blog_clicks_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.blog_posts(id) ON DELETE CASCADE;


--
-- Name: company_research company_research_application_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_research
    ADD CONSTRAINT company_research_application_id_fkey FOREIGN KEY (application_id) REFERENCES public.applications(id) ON DELETE CASCADE;


--
-- Name: email_responses email_responses_application_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_responses
    ADD CONSTRAINT email_responses_application_id_fkey FOREIGN KEY (application_id) REFERENCES public.applications(id) ON DELETE SET NULL;


--
-- Name: email_responses email_responses_suggested_application_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_responses
    ADD CONSTRAINT email_responses_suggested_application_id_fkey FOREIGN KEY (suggested_application_id) REFERENCES public.applications(id) ON DELETE SET NULL;


--
-- Name: interview_questions interview_questions_application_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interview_questions
    ADD CONSTRAINT interview_questions_application_id_fkey FOREIGN KEY (application_id) REFERENCES public.applications(id) ON DELETE CASCADE;


--
-- Name: interview_questions interview_questions_star_story_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interview_questions
    ADD CONSTRAINT interview_questions_star_story_id_fkey FOREIGN KEY (star_story_id) REFERENCES public.star_stories(id) ON DELETE SET NULL;


--
-- Name: job_feedback job_feedback_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_feedback
    ADD CONSTRAINT job_feedback_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE;


--
-- Name: jobs jobs_job_raw_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobs
    ADD CONSTRAINT jobs_job_raw_id_fkey FOREIGN KEY (job_raw_id) REFERENCES public.jobs_raw(id) ON DELETE SET NULL;


--
-- Name: jobs_raw jobs_raw_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobs_raw
    ADD CONSTRAINT jobs_raw_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: linkedin_outreach linkedin_outreach_application_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.linkedin_outreach
    ADD CONSTRAINT linkedin_outreach_application_id_fkey FOREIGN KEY (application_id) REFERENCES public.applications(id) ON DELETE CASCADE;


--
-- Name: project_images project_images_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_images
    ADD CONSTRAINT project_images_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: referee_contact_requests referee_contact_requests_referee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referee_contact_requests
    ADD CONSTRAINT referee_contact_requests_referee_id_fkey FOREIGN KEY (referee_id) REFERENCES public.referees(id) ON DELETE CASCADE;


--
-- Name: referee_invitations referee_invitations_referee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referee_invitations
    ADD CONSTRAINT referee_invitations_referee_id_fkey FOREIGN KEY (referee_id) REFERENCES public.referees(id) ON DELETE SET NULL;


--
-- Name: reference_usage reference_usage_application_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reference_usage
    ADD CONSTRAINT reference_usage_application_id_fkey FOREIGN KEY (application_id) REFERENCES public.applications(id) ON DELETE CASCADE;


--
-- Name: reference_usage reference_usage_referee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reference_usage
    ADD CONSTRAINT reference_usage_referee_id_fkey FOREIGN KEY (referee_id) REFERENCES public.referees(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

-- ── Reference data ────────────────────────────────────────────
-- Default rows the migrations seed (copied verbatim, all idempotent).
-- Schema-only dumps leave them out; a fresh install needs them
-- (the automation rules, system email templates, settings singletons).
-- pg_dump above empties search_path; these statements use plain table names.
SET search_path = public;

-- from 002_job_system.sql
INSERT INTO job_preferences (
  id,
  desired_roles,
  desired_locations,
  required_tech_stack,
  min_relevance_score,
  digest_time
) VALUES (
  '00000000-0000-0000-0000-000000000001'::uuid,
  ARRAY['DevOps','SRE','Cloud','Infrastructure','Platform','Kubernetes','Embedded'],
  ARRAY['Remote','France','EU','Europe','Germany','Netherlands'],
  ARRAY['Kubernetes','Docker','AWS','Terraform','Linux'],
  65,
  '08:15'
) ON CONFLICT (id) DO NOTHING;

-- from 018_full_feature_expansion.sql
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

INSERT INTO user_settings DEFAULT VALUES
ON CONFLICT DO NOTHING;

-- ── Migration history included in this snapshot ───────────────
INSERT INTO public.schema_migrations (filename, checksum, applied_by) VALUES
  ('001_add_visitor_logs.sql', 'bb132a00963ad465c18f08e3294327a01e9aa6950cfa9123089249d9cd8ec402', 'baseline'),  -- gitleaks:allow (sha256 checksum)
  ('001_project_images.sql', '8ab348e4dd09d740d70693b3cd2c8075d9287df3d43d41219f8e52b0b4322fb6', 'baseline'),  -- gitleaks:allow (sha256 checksum)
  ('002_add_job_feedback.sql', '0b8a8e328212416332b97a669a6a4164b46fcc70f6edb06a663ddeaedca913e8', 'baseline'),  -- gitleaks:allow (sha256 checksum)
  ('002_job_system.sql', '803cc5afdb90e890caf19ac8ed51dfe15df1d1bd8c7bd223777da7760d6ecf67', 'baseline'),  -- gitleaks:allow (sha256 checksum)
  ('003_ai_pattern_config.sql', '95ed2ec59d63f79e83e6b23142cd23f4976db83a3f0a0be26917a29f927d9efd', 'baseline'),  -- gitleaks:allow (sha256 checksum)
  ('004_notification_log.sql', 'c444ed5af13b50f21aa4ac17628aa58da046c3575b143393a3adffa59700ccf7', 'baseline'),  -- gitleaks:allow (sha256 checksum)
  ('005-application-crm.sql', '36c266305134b38e059d7b047df58984efba06f9e1a3150de2dd894e00afaf33', 'baseline'),  -- gitleaks:allow (sha256 checksum)
  ('006-resume-languages.sql', 'b5a53bf11873ecb37fe12350795652d7682772a3bfbb252fddb790387dfa55ca', 'baseline'),  -- gitleaks:allow (sha256 checksum)
  ('007_availability_status.sql', '0fa2d88de333a39a4e5f87159d42ea487b2ecab1a6a4862bb70fca79f15769c7', 'baseline'),  -- gitleaks:allow (sha256 checksum)
  ('008_orbit_badges.sql', 'b97ab4a005abb747fc43130c1f129f0b52264af39762976ed513286b590b9bb7', 'baseline'),  -- gitleaks:allow (sha256 checksum)
  ('009_social_links.sql', '682bc5125d0cb1061fb0739129079547173bfa1b2ab2ed32b86042fe929ad599', 'baseline'),  -- gitleaks:allow (sha256 checksum)
  ('010_education.sql', '56b12a3e53d1e8a28d9a41a06d70a908172cf8f4245e29136197b1b9f5b37449', 'baseline'),  -- gitleaks:allow (sha256 checksum)
  ('011_referees.sql', '224779cef22b9e63f0164dc93484e94ce4ae3cae4239ce2eeed192c69e662a7e', 'baseline'),  -- gitleaks:allow (sha256 checksum)
  ('012_referee_invitations.sql', '491964a3d7b387bbd512d13a014ba49776d502aa0161979ce4f21ac57e1c348e', 'baseline'),  -- gitleaks:allow (sha256 checksum)
  ('013_referee_invitation_email.sql', '336baa32293a41c7b2a7ccd3a2cd1fc483a276c937215e37c3878c90c54c482a', 'baseline'),  -- gitleaks:allow (sha256 checksum)
  ('014_star_config.sql', 'daf338c992fa04e3640de30a3e1c90f111ab4c892a267db0f1cbd80cd98cceaf', 'baseline'),  -- gitleaks:allow (sha256 checksum)
  ('015_referee_contact_requests.sql', 'd403c4e1bfb07f832979ced5ce4265bd1fc850a10052a60f6bf98c15ffc6486e', 'baseline'),  -- gitleaks:allow (sha256 checksum)
  ('016_cv_generation_config.sql', 'a739b1584ddcec9927a0ae11305511d3247a73c0859a6b00fc6996159b4a6714', 'baseline'),  -- gitleaks:allow (sha256 checksum)
  ('017_job_import_tracking.sql', 'f6b35913e0ed079a32c10c336fec074f69300e2fe859f4f3ad511e76dc9ce13f', 'baseline'),  -- gitleaks:allow (sha256 checksum)
  ('018_full_feature_expansion.sql', 'e1fc019446c0bc62ec6e64d4d2c706ea10b23f6d449f7a353e6587281a209e01', 'baseline'),  -- gitleaks:allow (sha256 checksum)
  ('019_cv_email_choice.sql', '3d2089e19315da63bc2e72bf9c5eb251ca8e3f1f40ed14850bf2b572d10f3de5', 'baseline'),  -- gitleaks:allow (sha256 checksum)
  ('020_multi_mailbox_email_tracking.sql', 'e4a8d24540c71812426b2e4a7862755e98bb9a800c346670fd87ad02ada7fb5a', 'baseline'),  -- gitleaks:allow (sha256 checksum)
  ('021_manual_document_editing.sql', 'e9b564b538ec5751189afe3e7c62e6c2093b316de2bd2a04962959a69493fcfb', 'baseline'),  -- gitleaks:allow (sha256 checksum)
  ('022_blog_posts.sql', '4806b3295f75b7a1027b93095b82062e1be23ae51d22b4ade1919eef8d0f3d45', 'baseline'),  -- gitleaks:allow (sha256 checksum)
  ('023_linkedin.sql', 'fbac38e81d654e455553ab6f8c8bd0e5682b4bdc6b3067c73a981e5339a3e9c8', 'baseline'),  -- gitleaks:allow (sha256 checksum)
  ('024_job_targeting.sql', '8eabb6d19396179a42880068e03faedd75d96a3792bce382c7b8c427f7e812f3', 'baseline'),  -- gitleaks:allow (sha256 checksum)
  ('025_pg_trgm.sql', 'd3e7c3c435f970b4afb368ef1968226304f0d1ba94659391cedc4c8f8960a6c0', 'baseline'),  -- gitleaks:allow (sha256 checksum)
  ('026_board_circuit_breaker.sql', 'a2f75d77c97697134823cd7fadfdf5014b9b96e83e554782e9b907de9d73c92a', 'baseline'),  -- gitleaks:allow (sha256 checksum)
  ('027_retire_old_job_sources.sql', '4081dcbe1f6f162c9f8918151280d1054348fe64b2351e63a49c7267e5c8c5df', 'baseline'),  -- gitleaks:allow (sha256 checksum)
  ('028_auth_attempts.sql', '7cf3605cdf2f33007b8031dfd751073b90cb0726d90dbc70cd01d75d508fc659', 'baseline'),  -- gitleaks:allow (sha256 checksum)
  ('029_llm_requests_log.sql', '9582907d0e1d10cf8dd3eb430dcf85f0f15e4ba0e679f7fdef67acf88a82cdb5', 'baseline'),  -- gitleaks:allow (sha256 checksum)
  ('030_monitoring_grants.sql', '6e75c0f1fd597737cbe615a494233d9406b74b1f415415b587296693c83d0951', 'baseline'),  -- gitleaks:allow (sha256 checksum)
  ('031_content_route_indexes.sql', '4cd975c693b67b848b3b1d30fa0bf19b7bf1846848bd86bc0d775bdc463c4ab3', 'baseline'),  -- gitleaks:allow (sha256 checksum)
  ('032_email_application_matching.sql', '9e8c5f7c3fcb0bf0b1bb082826dddacb0685902904c23c71b4dc6a79aa9cf413', 'baseline'),  -- gitleaks:allow (sha256 checksum)
  ('033_role_aware_email_matching.sql', '9adf8b00b3ce97b856b7334a216b955442612eaf5b7066cf947e0d20be522ad6', 'baseline'),  -- gitleaks:allow (sha256 checksum)
  ('034_blog_click_tracking.sql', 'da3f79f7b090d28fb6163cb951063be83746dbf73203b58b999bf699c2acdd07', 'baseline'),  -- gitleaks:allow (sha256 checksum)
  ('035_imap_multi_folder.sql', '93b153f4273bb3180ace04261bcb25ec066cd299209ccabdfd60137bc0d601ae', 'baseline'),  -- gitleaks:allow (sha256 checksum)
  ('036_repair_keys_and_constraints.sql', '7ba3ad5c580c13ccea287598116405051da0978405b15850bf36be7d4bad1539', 'baseline'),  -- gitleaks:allow (sha256 checksum)
  ('037_repair_indexes.sql', 'f76403c93b2ac703007ba500af8d2d1da4648571783106a43777741a88a9e303', 'baseline')  -- gitleaks:allow (sha256 checksum)
ON CONFLICT (filename) DO NOTHING;
