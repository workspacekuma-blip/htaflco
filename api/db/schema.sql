-- HTAFL starter schema (PostgreSQL 14+)

CREATE TYPE post_status AS ENUM ('pending', 'published', 'hidden', 'removed');
CREATE TYPE pillar      AS ENUM ('Create', 'Overcome', 'Connect');

CREATE TABLE users (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email          text NOT NULL UNIQUE CHECK (email = lower(email)),
  password_hash  text NOT NULL,
  email_verified boolean NOT NULL DEFAULT false,
  verify_token   text,
  reply_email_enabled boolean NOT NULL DEFAULT false,
  reply_email_consented_at timestamptz,
  role           text NOT NULL DEFAULT 'member'  CHECK (role   IN ('member', 'moderator', 'admin')),
  status         text NOT NULL DEFAULT 'active'  CHECK (status IN ('active', 'suspended')),
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE profiles (
  user_id      uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 2 AND 30),
  craft        text NOT NULL DEFAULT 'Something else',
  trust_level  int  NOT NULL DEFAULT 1,   -- 0 = flagged: their votes count for nothing
  joined_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE post_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_key text NOT NULL UNIQUE,
  storage_key text UNIQUE,
  source_cleaned boolean NOT NULL DEFAULT false,
  kind text NOT NULL CHECK (kind IN ('picture', 'video')),
  state text NOT NULL DEFAULT 'uploading' CHECK (state IN ('uploading','processing','pending','approved')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE posts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title         text CHECK (char_length(title) BETWEEN 1 AND 100),
  body          text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 10000),
  response_label text NOT NULL DEFAULT 'Just sharing' CHECK (response_label IN ('Encouragement', 'Constructive feedback', 'Looking for collaborators', 'Just sharing')),
  media_url     text,                                  -- filled by the media pipeline (not built yet)
  media_id      uuid UNIQUE REFERENCES post_media(id),
  media_alt     text CHECK (char_length(media_alt) <= 300),
  pillar        pillar NOT NULL DEFAULT 'Create',
  craft         text NOT NULL DEFAULT 'Something else',
  challenge_id  uuid,
  status        post_status NOT NULL DEFAULT 'published',
  sensitive     boolean NOT NULL DEFAULT false,        -- needs a human look, never auto-featured
  up            int NOT NULL DEFAULT 0,
  down          int NOT NULL DEFAULT 0,
  comment_count int NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  edited_at     timestamptz
);
CREATE INDEX posts_feed_idx      ON posts (status, created_at DESC, id DESC);
CREATE INDEX posts_pillar_idx    ON posts (pillar, created_at DESC, id DESC) WHERE status = 'published';
CREATE INDEX posts_craft_idx     ON posts (craft, created_at DESC, id DESC)  WHERE status = 'published';
CREATE INDEX posts_challenge_idx ON posts (challenge_id, created_at DESC, id DESC) WHERE status = 'published';
CREATE INDEX posts_author_idx    ON posts (author_id, created_at DESC, id DESC);

CREATE TABLE votes (
  post_id    uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  value      smallint NOT NULL CHECK (value IN (1, -1)),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)                       -- one vote per member per post
);
CREATE INDEX votes_user_idx   ON votes (user_id, created_at DESC);
CREATE INDEX votes_recent_idx ON votes (created_at DESC);

CREATE TABLE comments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body       text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
  status     post_status NOT NULL DEFAULT 'published',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX comments_post_idx ON comments (post_id, created_at);

CREATE TABLE reports (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type text NOT NULL CHECK (target_type IN ('post', 'comment', 'profile')),
  target_id   uuid NOT NULL,
  reason      text NOT NULL CHECK (char_length(reason) BETWEEN 3 AND 300),
  status      text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX reports_open_idx   ON reports (status, created_at);
CREATE INDEX reports_target_idx ON reports (target_type, target_id) WHERE status = 'open';

-- Latest computed ranking per kind ('featured', 'rising'): an ordered list of post ids.
CREATE TABLE ranking_snapshots (
  kind        text PRIMARY KEY,
  computed_at timestamptz NOT NULL DEFAULT now(),
  items       jsonb NOT NULL DEFAULT '[]'
);

-- Latest recorded winners per UTC Monday-start week. Current week updates; past weeks freeze.
CREATE TABLE featured_archive (
  week_start date PRIMARY KEY,
  items      jsonb NOT NULL
);

CREATE TABLE weekly_prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start date NOT NULL UNIQUE CHECK (extract(isodow FROM week_start) = 1),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 100),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
  scheduled_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE reply_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  comment_id uuid NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  email_status text NOT NULL DEFAULT 'none' CHECK (email_status IN ('none', 'pending', 'sending', 'sent', 'failed', 'cancelled')),
  email_attempts int NOT NULL DEFAULT 0,
  email_attempted_at timestamptz,
  email_next_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (recipient_id, comment_id)
);
CREATE INDEX reply_notifications_inbox_idx ON reply_notifications(recipient_id, created_at DESC, id DESC);
CREATE INDEX reply_notifications_email_idx ON reply_notifications(email_next_at) WHERE email_status IN ('pending', 'sending');
CREATE TABLE reply_email_budget (day date PRIMARY KEY, attempts int NOT NULL DEFAULT 0 CHECK (attempts >= 0));
