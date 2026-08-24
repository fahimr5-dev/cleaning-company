-- ============================================================================
-- The three security roles the Row Level Security rules depend on.
--
-- PLAIN ENGLISH: Supabase creates these for you. Any other Postgres — Neon, a
-- database on your own server, one on your laptop — does not, and the security
-- rules in 01_rls.sql refer to them by name. This creates them if they are
-- missing and does nothing at all if they already exist, so it is safe to run
-- against Supabase too.
--
--   anon           a visitor who is not logged in. Gets nothing.
--   authenticated  somebody signed in. What they can see is decided row by row.
--   service_role   the app's own connection, which the rules do not restrict.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- The schema CleanOS lives in.
--
-- PLAIN ENGLISH: a schema is a named folder for tables inside one database.
-- CleanOS keeps all 57 of its tables in a folder called `cleanos`, so that the
-- other apps sharing this database (Anqa RMS, the PMS, DINE OS) can each have
-- their own folder without fighting over table names — every one of them wants
-- a table called `users`, `clients`, `invoices` and `payments`.
-- ----------------------------------------------------------------------------

CREATE SCHEMA IF NOT EXISTS cleanos;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN NOINHERIT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN NOINHERIT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
  END IF;
END
$$;

-- The connecting user must be allowed to become these roles, otherwise
-- `SET LOCAL ROLE authenticated` fails and every page 500s.
DO $$
BEGIN
  EXECUTE format('GRANT anon, authenticated, service_role TO %I', current_user);
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'Could not grant the roles to %. On Supabase this is already done.', current_user;
END
$$;

-- ----------------------------------------------------------------------------
-- auth.uid() — "who is making this request?"
--
-- PLAIN ENGLISH: the security rules ask this constantly. On Supabase it already
-- exists and this leaves it completely alone. On any other Postgres it has to
-- be created, or every rule fails with "schema auth does not exist".
--
-- It reads the signed-in user's id out of the request settings, which is what
-- `withUserRls()` in src/lib/rls.ts puts there at the start of every query.
-- ----------------------------------------------------------------------------

CREATE SCHEMA IF NOT EXISTS auth;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'auth' AND p.proname = 'uid'
  ) THEN
    EXECUTE $fn$
      CREATE FUNCTION auth.uid() RETURNS uuid
      LANGUAGE sql STABLE AS $body$
        SELECT nullif(current_setting('request.jwt.claims', true)::jsonb->>'sub', '')::uuid;
      $body$;
    $fn$;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA cleanos TO anon, authenticated, service_role;
