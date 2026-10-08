-- Apply once to existing installations before deploying the community features.
-- Additive: no existing titles, stories, votes or members are fabricated or removed.
BEGIN;
ALTER TABLE users ADD COLUMN IF NOT EXISTS reply_email_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS reply_email_consented_at timestamptz;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS title text CHECK (char_length(title) BETWEEN 1 AND 100);
ALTER TABLE posts ADD COLUMN IF NOT EXISTS response_label text NOT NULL DEFAULT 'Just sharing'
  CHECK (response_label IN ('Encouragement', 'Constructive feedback', 'Looking for collaborators', 'Just sharing'));
ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_body_check;
ALTER TABLE posts ADD CONSTRAINT posts_body_check CHECK (char_length(body) BETWEEN 1 AND 10000);
CREATE TABLE IF NOT EXISTS weekly_prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start date NOT NULL UNIQUE CHECK (extract(isodow FROM week_start) = 1),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 100),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
  scheduled_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS reply_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  comment_id uuid NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(), read_at timestamptz,
  email_status text NOT NULL DEFAULT 'none' CHECK (email_status IN ('none', 'pending', 'sending', 'sent', 'failed', 'cancelled')),
  email_attempts int NOT NULL DEFAULT 0, email_attempted_at timestamptz,
  email_next_at timestamptz NOT NULL DEFAULT now(), UNIQUE(recipient_id, comment_id)
);
CREATE INDEX IF NOT EXISTS reply_notifications_inbox_idx ON reply_notifications(recipient_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS reply_notifications_email_idx ON reply_notifications(email_next_at) WHERE email_status IN ('pending', 'sending');
ALTER TABLE weekly_prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE reply_notifications ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS reply_email_budget (day date PRIMARY KEY, attempts int NOT NULL DEFAULT 0 CHECK (attempts >= 0));
ALTER TABLE reply_email_budget ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE reply_email_budget FROM PUBLIC;
REVOKE ALL ON TABLE weekly_prompts, reply_notifications FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='htafl_backend') THEN
    REVOKE ALL ON TABLE weekly_prompts, reply_notifications FROM anon, authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE weekly_prompts, reply_notifications TO htafl_backend;
    REVOKE ALL ON TABLE reply_email_budget FROM anon, authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE reply_email_budget TO htafl_backend;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='weekly_prompts' AND policyname='backend_access') THEN
      CREATE POLICY backend_access ON weekly_prompts TO htafl_backend USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='reply_email_budget' AND policyname='backend_access') THEN
      CREATE POLICY backend_access ON reply_email_budget TO htafl_backend USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='reply_notifications' AND policyname='backend_access') THEN
      CREATE POLICY backend_access ON reply_notifications TO htafl_backend USING (true) WITH CHECK (true);
    END IF;
  END IF;
END $$;
COMMIT;
