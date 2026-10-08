-- Apply only to the dedicated production database after db/schema.sql.
-- Keep the existing Express API as the only public interface; Supabase Auth is not used.
CREATE ROLE htafl_backend NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
GRANT USAGE ON SCHEMA public TO htafl_backend;
REVOKE ALL ON TABLE users, profiles, posts, votes, comments, reports, ranking_snapshots, featured_archive
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE weekly_prompts, reply_notifications FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE reply_email_budget FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE post_media FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE post_media TO htafl_backend;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE reply_email_budget TO htafl_backend;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE weekly_prompts, reply_notifications TO htafl_backend;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  users, profiles, posts, votes, comments, reports, ranking_snapshots, featured_archive TO htafl_backend;

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE ranking_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE featured_archive ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE reply_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE reply_email_budget ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_media ENABLE ROW LEVEL SECURITY;

CREATE POLICY backend_access ON users TO htafl_backend USING (true) WITH CHECK (true);
CREATE POLICY backend_access ON profiles TO htafl_backend USING (true) WITH CHECK (true);
CREATE POLICY backend_access ON posts TO htafl_backend USING (true) WITH CHECK (true);
CREATE POLICY backend_access ON votes TO htafl_backend USING (true) WITH CHECK (true);
CREATE POLICY backend_access ON comments TO htafl_backend USING (true) WITH CHECK (true);
CREATE POLICY backend_access ON reports TO htafl_backend USING (true) WITH CHECK (true);
CREATE POLICY backend_access ON ranking_snapshots TO htafl_backend USING (true) WITH CHECK (true);
CREATE POLICY backend_access ON featured_archive TO htafl_backend USING (true) WITH CHECK (true);
CREATE POLICY backend_access ON weekly_prompts TO htafl_backend USING (true) WITH CHECK (true);
CREATE POLICY backend_access ON reply_notifications TO htafl_backend USING (true) WITH CHECK (true);
CREATE POLICY backend_access ON reply_email_budget TO htafl_backend USING (true) WITH CHECK (true);
CREATE POLICY backend_access ON post_media TO htafl_backend USING (true) WITH CHECK (true);

-- Set this role's separate random login password through the operator connection.
-- Never grant this role to anon/authenticated or put its credentials in web/.
