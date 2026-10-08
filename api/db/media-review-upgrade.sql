BEGIN;
CREATE TABLE IF NOT EXISTS post_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_key text NOT NULL UNIQUE,
  storage_key text UNIQUE,
  source_cleaned boolean NOT NULL DEFAULT false,
  kind text NOT NULL CHECK (kind IN ('picture','video')),
  state text NOT NULL DEFAULT 'uploading' CHECK (state IN ('uploading','processing','pending','approved')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE post_media ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE post_media ADD COLUMN IF NOT EXISTS source_cleaned boolean NOT NULL DEFAULT false;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS media_id uuid UNIQUE REFERENCES post_media(id);
ALTER TABLE posts ADD COLUMN IF NOT EXISTS media_alt text CHECK (char_length(media_alt) <= 300);
ALTER TABLE post_media ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON post_media FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='htafl_backend') THEN
    REVOKE ALL ON post_media FROM anon, authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON post_media TO htafl_backend;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='post_media' AND policyname='backend_access') THEN
      CREATE POLICY backend_access ON post_media TO htafl_backend USING (true) WITH CHECK (true);
    END IF;
  END IF;
END $$;
COMMIT;
