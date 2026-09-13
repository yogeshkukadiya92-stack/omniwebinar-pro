-- ====================================================================
-- Webinar Platform Production Database Schema (WebinarJam Alternative)
-- Compatible with PostgreSQL 14+ / Supabase / AWS RDS
-- ====================================================================

-- 1. Enable UUID Extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Organizations / Accounts
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    subdomain VARCHAR(100) UNIQUE NOT NULL,
    custom_domain VARCHAR(255) UNIQUE,
    plan_tier VARCHAR(50) DEFAULT 'PRO', -- 'STARTER', 'PRO', 'ENTERPRISE'
    max_attendees INT DEFAULT 1000,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Users (Hosts, Co-Presenters, Moderators)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    avatar_url TEXT,
    role VARCHAR(50) DEFAULT 'HOST', -- 'SUPERADMIN', 'HOST', 'CO_PRESENTER', 'MODERATOR'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Webinars Master Table
CREATE TABLE webinars (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    host_id UUID REFERENCES users(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    description TEXT,
    webinar_type VARCHAR(50) NOT NULL DEFAULT 'LIVE', -- 'LIVE', 'AUTOMATED', 'HYBRID'
    scheduled_start_time TIMESTAMPTZ,
    actual_start_time TIMESTAMPTZ,
    actual_end_time TIMESTAMPTZ,
    status VARCHAR(50) DEFAULT 'SCHEDULED', -- 'SCHEDULED', 'LIVE', 'PANIC_RECOVERY', 'COMPLETED', 'CANCELLED'
    
    -- Disaster Recovery / Panic Room Configuration
    livekit_room_name VARCHAR(100) NOT NULL,
    shadow_room_name VARCHAR(100) NOT NULL,
    active_room_version INT DEFAULT 1,
    
    -- Streaming & Ingest Settings
    stream_key VARCHAR(100) UNIQUE,
    playback_hls_url TEXT,
    recording_url TEXT,
    
    -- Settings & Customizations (JSONB)
    settings JSONB NOT NULL DEFAULT '{
        "chat_enabled": true,
        "moderated_chat": false,
        "show_attendee_count": true,
        "allow_replies": true,
        "panic_button_enabled": true,
        "max_duration_minutes": 180,
        "theme_color": "#6366f1"
    }',
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Webinar Registrations & Lead Capture
CREATE TABLE registrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    webinar_id UUID REFERENCES webinars(id) ON DELETE CASCADE,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100),
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    ip_address INET,
    country_code VARCHAR(10),
    
    -- Unique Secure Token for 1-Click Access
    access_token VARCHAR(255) UNIQUE NOT NULL,
    
    -- Attendance Telemetry
    has_attended BOOLEAN DEFAULT FALSE,
    first_joined_at TIMESTAMPTZ,
    last_left_at TIMESTAMPTZ,
    total_seconds_watched INT DEFAULT 0,
    has_watched_replay BOOLEAN DEFAULT FALSE,
    replay_seconds_watched INT DEFAULT 0,
    
    -- Funnel & Conversion Tracking
    utm_source VARCHAR(100),
    utm_medium VARCHAR(100),
    utm_campaign VARCHAR(100),
    has_purchased BOOLEAN DEFAULT FALSE,
    purchase_amount NUMERIC(10, 2) DEFAULT 0.00,
    
    registered_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(webinar_id, email)
);

-- 6. Live In-Webinar Offers (Timed Popups)
CREATE TABLE webinar_offers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    webinar_id UUID REFERENCES webinars(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    headline VARCHAR(255) NOT NULL,
    description TEXT,
    image_url TEXT,
    regular_price NUMERIC(10, 2),
    special_price NUMERIC(10, 2) NOT NULL,
    currency VARCHAR(10) DEFAULT 'USD',
    cta_text VARCHAR(100) DEFAULT 'Buy Now',
    checkout_url TEXT NOT NULL,
    countdown_duration_seconds INT DEFAULT 300,
    limited_units INT DEFAULT 0, -- 0 means unlimited
    units_sold INT DEFAULT 0,
    is_active BOOLEAN DEFAULT FALSE,
    pushed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Live Polls & Quizzes
CREATE TABLE webinar_polls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    webinar_id UUID REFERENCES webinars(id) ON DELETE CASCADE,
    question TEXT NOT NULL,
    options JSONB NOT NULL,
    is_multi_choice BOOLEAN DEFAULT FALSE,
    is_published BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE webinar_poll_responses (
    id BIGSERIAL PRIMARY KEY,
    poll_id UUID REFERENCES webinar_polls(id) ON DELETE CASCADE,
    registration_id UUID REFERENCES registrations(id) ON DELETE CASCADE,
    selected_option_ids JSONB NOT NULL,
    responded_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(poll_id, registration_id)
);

-- 8. Downloadable Handouts
CREATE TABLE webinar_handouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    webinar_id UUID REFERENCES webinars(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_url TEXT NOT NULL,
    file_size_bytes BIGINT,
    is_shared BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. Timeline Event Logs (The Core of "Replica Replay")
CREATE TABLE replica_event_logs (
    id BIGSERIAL PRIMARY KEY,
    webinar_id UUID REFERENCES webinars(id) ON DELETE CASCADE,
    offset_milliseconds BIGINT NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    sender_name VARCHAR(100),
    sender_role VARCHAR(50),
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_replica_events ON replica_event_logs(webinar_id, offset_milliseconds ASC);

-- 10. Automated / Evergreen Schedules
CREATE TABLE automated_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    webinar_id UUID REFERENCES webinars(id) ON DELETE CASCADE,
    schedule_type VARCHAR(50) NOT NULL,
    cron_expression VARCHAR(100),
    interval_minutes INT DEFAULT 15,
    timezone VARCHAR(100) DEFAULT 'UTC',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11. Notification Queue (Email & SMS Reminders)
CREATE TABLE notification_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    webinar_id UUID REFERENCES webinars(id) ON DELETE CASCADE,
    registration_id UUID REFERENCES registrations(id) ON DELETE CASCADE,
    channel VARCHAR(20) NOT NULL, -- 'EMAIL', 'SMS', 'WHATSAPP'
    trigger_type VARCHAR(50) NOT NULL, -- 'CONFIRMATION', 'BEFORE_24H', 'BEFORE_1H', 'BEFORE_15M', 'LIVE_NOW', 'REPLAY'
    scheduled_for TIMESTAMPTZ NOT NULL,
    sent_at TIMESTAMPTZ,
    status VARCHAR(50) DEFAULT 'PENDING', -- 'PENDING', 'SENT', 'FAILED'
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notification_due ON notification_jobs(scheduled_for) WHERE status = 'PENDING';

-- 12. Complete Email Marketing Automation & Funnel Suite
CREATE TABLE email_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    webinar_id UUID REFERENCES webinars(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    subject VARCHAR(255) NOT NULL,
    preview_text VARCHAR(255),
    html_body TEXT NOT NULL,
    text_body TEXT,
    template_type VARCHAR(50) NOT NULL, -- 'CONFIRMATION', 'REMINDER_24H', 'REMINDER_1H', 'REMINDER_15M', 'LIVE_NOW', 'POST_ATTENDED', 'POST_LEFT_EARLY', 'POST_NO_SHOW', 'POST_PURCHASE'
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Email Automation Sequences (Triggers & Segment Rules)
CREATE TABLE email_automation_sequences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    webinar_id UUID REFERENCES webinars(id) ON DELETE CASCADE,
    template_id UUID REFERENCES email_templates(id) ON DELETE CASCADE,
    sequence_type VARCHAR(50) NOT NULL, -- 'PRE_WEBINAR', 'POST_WEBINAR'
    target_segment VARCHAR(50) NOT NULL, -- 'ALL_REGISTRANTS', 'ATTENDED_ALL', 'ATTENDED_SAW_OFFER', 'ATTENDED_LEFT_EARLY', 'NO_SHOW', 'PURCHASED'
    trigger_timing_type VARCHAR(50) NOT NULL, -- 'IMMEDIATE', 'OFFSET_BEFORE_START', 'OFFSET_AFTER_END'
    offset_minutes INT NOT NULL DEFAULT 0,
    is_enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Email Delivery & Analytics Telemetry
CREATE TABLE email_delivery_logs (
    id BIGSERIAL PRIMARY KEY,
    webinar_id UUID REFERENCES webinars(id) ON DELETE CASCADE,
    registration_id UUID REFERENCES registrations(id) ON DELETE CASCADE,
    template_id UUID REFERENCES email_templates(id) ON DELETE SET NULL,
    recipient_email VARCHAR(255) NOT NULL,
    subject VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'SENT', -- 'QUEUED', 'SENT', 'DELIVERED', 'OPENED', 'CLICKED', 'BOUNCED', 'SPAM'
    open_count INT DEFAULT 0,
    click_count INT DEFAULT 0,
    first_opened_at TIMESTAMPTZ,
    last_clicked_at TIMESTAMPTZ,
    clicked_url TEXT,
    sent_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_email_analytics ON email_delivery_logs(webinar_id, status);

-- Custom SMTP & ESP Credentials (AWS SES, SendGrid, Postmark, Mailgun)
CREATE TABLE esp_integrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    provider_name VARCHAR(50) NOT NULL, -- 'AWS_SES', 'SENDGRID', 'POSTMARK', 'MAILGUN', 'SMTP_CUSTOM'
    from_name VARCHAR(100) NOT NULL,
    from_email VARCHAR(255) NOT NULL,
    reply_to_email VARCHAR(255),
    api_key_encrypted TEXT,
    smtp_host VARCHAR(255),
    smtp_port INT,
    smtp_user VARCHAR(255),
    smtp_pass_encrypted TEXT,
    is_default BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 13. Affiliates & Referral Partner Tracking
CREATE TABLE affiliates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id),
    referral_code VARCHAR(50) UNIQUE NOT NULL,
    payout_email VARCHAR(255) NOT NULL,
    commission_rate_percent NUMERIC(5, 2) DEFAULT 30.00,
    total_earnings NUMERIC(10, 2) DEFAULT 0.00,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 14. Ticket Tiers & One-Click Upsells (OTO)
CREATE TABLE webinar_ticket_tiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    webinar_id UUID REFERENCES webinars(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL, -- 'FREE', 'VIP_PASS', 'MASTERMIND'
    price NUMERIC(10, 2) DEFAULT 0.00,
    currency VARCHAR(10) DEFAULT 'INR',
    features JSONB NOT NULL DEFAULT '[]',
    has_vip_stage_access BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 15. WhatsApp Automation Message Logs (Meta Cloud API)
CREATE TABLE whatsapp_messages_log (
    id BIGSERIAL PRIMARY KEY,
    webinar_id UUID REFERENCES webinars(id) ON DELETE CASCADE,
    registration_id UUID REFERENCES registrations(id) ON DELETE CASCADE,
    phone_number VARCHAR(50) NOT NULL,
    template_name VARCHAR(100) NOT NULL,
    status VARCHAR(50) DEFAULT 'SENT', -- 'SENT', 'DELIVERED', 'READ', 'FAILED'
    message_sid VARCHAR(255),
    sent_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_whatsapp_webinar ON whatsapp_messages_log(webinar_id, status);

-- 16. Audience Gamification & Points
CREATE TABLE attendee_gamification (
    id BIGSERIAL PRIMARY KEY,
    webinar_id UUID REFERENCES webinars(id) ON DELETE CASCADE,
    registration_id UUID REFERENCES registrations(id) ON DELETE CASCADE,
    points_total INT DEFAULT 0,
    polls_answered INT DEFAULT 0,
    questions_asked INT DEFAULT 0,
    won_lucky_draw BOOLEAN DEFAULT FALSE,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(webinar_id, registration_id)
);

-- 17. AI Meeting Transcripts & Generated Shorts
CREATE TABLE ai_webinar_artifacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    webinar_id UUID REFERENCES webinars(id) ON DELETE CASCADE,
    full_transcript TEXT,
    summary_markdown TEXT,
    key_takeaways JSONB,
    generated_shorts_urls JSONB, -- Array of S3 URLs
    created_at TIMESTAMPTZ DEFAULT NOW()
);

