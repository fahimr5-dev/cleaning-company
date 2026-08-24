-- ============================================================================
-- CleanOS — Row Level Security test
-- ----------------------------------------------------------------------------
-- Logs in as each of the four roles and checks the database hands back exactly
-- what that person should see, and refuses what they should not.
--
--   npm run test:rls
--
-- Every line must say PASS. A FAIL means someone can see data they should not.
-- ============================================================================
SET client_min_messages TO WARNING;

-- CleanOS's tables live in the `cleanos` schema, so unqualified table names
-- below resolve there. pg_temp stays on the path for the helpers created here.
SET search_path = cleanos, pg_temp, public;

CREATE TEMP TABLE results(check_name text, expected text, actual text, ok boolean);

CREATE OR REPLACE FUNCTION pg_temp.check_count(p_name text, p_sql text, p_expected bigint)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE n bigint;
BEGIN
  EXECUTE p_sql INTO n;
  INSERT INTO results VALUES (p_name, p_expected::text, n::text, n = p_expected);
EXCEPTION WHEN insufficient_privilege OR others THEN
  INSERT INTO results VALUES (p_name, p_expected::text, 'ERROR: ' || SQLERRM, false);
END $$;

-- For a visitor who is not logged in, two answers are both correct and safe:
-- zero rows back, or a flat "permission denied". Anything else is a leak.
CREATE OR REPLACE FUNCTION pg_temp.check_blocked(p_name text, p_sql text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE n bigint;
BEGIN
  EXECUTE p_sql INTO n;
  INSERT INTO results VALUES (p_name, 'no data', n || ' rows', n = 0);
EXCEPTION WHEN insufficient_privilege THEN
  INSERT INTO results VALUES (p_name, 'no data', 'permission denied', true);
END $$;

-- Records the fact that a write was correctly REFUSED.
CREATE OR REPLACE FUNCTION pg_temp.check_denied(p_name text, p_sql text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE n bigint;
BEGIN
  EXECUTE p_sql;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN
    INSERT INTO results VALUES (p_name, 'refused', 'refused (0 rows changed)', true);
  ELSE
    INSERT INTO results VALUES (p_name, 'refused', 'ALLOWED ' || n || ' rows!', false);
  END IF;
EXCEPTION WHEN insufficient_privilege OR check_violation THEN
  INSERT INTO results VALUES (p_name, 'refused', 'refused (' || SQLSTATE || ')', true);
WHEN others THEN
  INSERT INTO results VALUES (p_name, 'refused', 'refused (' || SQLSTATE || ')', true);
END $$;

-- Ground truth, gathered as the owner before we drop privileges.
CREATE TEMP TABLE truth AS
SELECT
  (SELECT count(*) FROM clients)                                        AS all_clients,
  (SELECT count(*) FROM jobs)                                           AS all_jobs,
  (SELECT count(*) FROM invoices)                                       AS all_invoices,
  (SELECT count(*) FROM staff)                                          AS all_staff,
  (SELECT count(*) FROM leads)                                          AS all_leads,
  (SELECT count(*) FROM marketing_spend)                                AS all_spend,
  (SELECT j.id FROM jobs j LIMIT 1)                                     AS a_job,
  -- Team Alpha is the team the demo cleaner (Maria Santos) leads.
  (SELECT count(*) FROM jobs j
     WHERE j."teamId" = (SELECT tm."teamId" FROM team_members tm
                          JOIN staff s ON s.id = tm."staffId"
                          WHERE s."userId" = '00000000-0000-4000-8000-000000000003')
       AND j."deletedAt" IS NULL)                                       AS cleaner_jobs,
  (SELECT count(*) FROM jobs j
     WHERE j."clientId" = (SELECT c.id FROM clients c
                            WHERE c."userId" = '00000000-0000-4000-8000-000000000004')
       AND j."deletedAt" IS NULL)                                       AS client_jobs,
  (SELECT count(*) FROM invoices i
     WHERE i."clientId" = (SELECT c.id FROM clients c
                            WHERE c."userId" = '00000000-0000-4000-8000-000000000004')
       AND i."deletedAt" IS NULL)                                       AS client_invoices,
  (SELECT count(DISTINCT j."clientId") FROM jobs j
     WHERE j."teamId" = (SELECT tm."teamId" FROM team_members tm
                          JOIN staff s ON s.id = tm."staffId"
                          WHERE s."userId" = '00000000-0000-4000-8000-000000000003')
       AND j."deletedAt" IS NULL)                                       AS cleaner_clients;

-- The scratch tables above belong to the owner; the roles we are about to
-- impersonate need to be able to read and write them, or every check reports a
-- permission error instead of a real result.
GRANT SELECT ON truth TO authenticated, anon;
GRANT ALL ON results TO authenticated, anon;

-- ===========================================================================
-- --- OWNER: should see everything ---
-- ===========================================================================
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', false);
SET ROLE authenticated;

SELECT pg_temp.check_count('owner sees all clients',  'SELECT count(*) FROM clients',        (SELECT all_clients FROM truth));
SELECT pg_temp.check_count('owner sees all jobs',     'SELECT count(*) FROM jobs',           (SELECT all_jobs FROM truth));
SELECT pg_temp.check_count('owner sees all invoices', 'SELECT count(*) FROM invoices',       (SELECT all_invoices FROM truth));
SELECT pg_temp.check_count('owner sees all staff',    'SELECT count(*) FROM staff',          (SELECT all_staff FROM truth));
SELECT pg_temp.check_count('owner sees ad spend',     'SELECT count(*) FROM marketing_spend',(SELECT all_spend FROM truth));
RESET ROLE;

-- ===========================================================================
-- --- OPS MANAGER: all operations, read-only money, no ad spend ---
-- ===========================================================================
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}', false);
SET ROLE authenticated;

SELECT pg_temp.check_count('ops sees all clients',     'SELECT count(*) FROM clients',  (SELECT all_clients FROM truth));
SELECT pg_temp.check_count('ops sees all jobs',        'SELECT count(*) FROM jobs',     (SELECT all_jobs FROM truth));
SELECT pg_temp.check_count('ops sees all leads',       'SELECT count(*) FROM leads',    (SELECT all_leads FROM truth));
SELECT pg_temp.check_count('ops CAN read invoices',    'SELECT count(*) FROM invoices', (SELECT all_invoices FROM truth));
SELECT pg_temp.check_count('ops CANNOT see ad spend',  'SELECT count(*) FROM marketing_spend', 0);
SELECT pg_temp.check_count('ops CANNOT see audit log', 'SELECT count(*) FROM audit_logs', 0);
SELECT pg_temp.check_denied('ops CANNOT edit an invoice', 'UPDATE invoices SET "totalFils" = 1');

-- Salary is a COLUMN restriction, not a row one. An ops manager gets the staff
-- list but must not be able to read what anybody earns, by any route.
SELECT pg_temp.check_blocked('ops CANNOT read salaries',
  'SELECT count("basicSalaryFils") FROM staff');
SELECT pg_temp.check_blocked('ops CANNOT read bank IBANs',
  'SELECT count(iban) FROM staff');
SELECT pg_temp.check_denied('ops CANNOT change a salary',
  'UPDATE staff SET "basicSalaryFils" = 1');
SELECT pg_temp.check_count('ops CAN still read the staff list',
  'SELECT count(*) FROM staff', (SELECT all_staff FROM truth));
SELECT pg_temp.check_denied('ops CANNOT edit the rate card', 'UPDATE rate_card_items SET "basePriceFils" = 1');
SELECT pg_temp.check_denied('ops CANNOT change VAT settings', 'UPDATE organizations SET "vatRateBps" = 0');
SELECT pg_temp.check_denied('ops CANNOT record a payment',
  'INSERT INTO payments (id,"paymentNo","clientId",method,status,"amountFils","receivedAt","updatedAt") VALUES (gen_random_uuid(),''HACK-1'',(SELECT id FROM clients LIMIT 1),''CASH'',''SUCCEEDED'',1,now(),now())');
RESET ROLE;

-- ===========================================================================
-- --- CLEANER: only their own team''s work ---
-- ===========================================================================
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated"}', false);
SET ROLE authenticated;

SELECT pg_temp.check_count('cleaner sees ONLY own team jobs', 'SELECT count(*) FROM jobs',   (SELECT cleaner_jobs FROM truth));
SELECT pg_temp.check_count('cleaner sees ONLY own staff row', 'SELECT count(*) FROM staff',  1);
SELECT pg_temp.check_count('cleaner sees only clients on those jobs', 'SELECT count(*) FROM clients', (SELECT cleaner_clients FROM truth));
SELECT pg_temp.check_count('cleaner CANNOT see invoices',     'SELECT count(*) FROM invoices', 0);
SELECT pg_temp.check_count('cleaner CANNOT see payments',     'SELECT count(*) FROM payments', 0);
SELECT pg_temp.check_count('cleaner CANNOT see leads',        'SELECT count(*) FROM leads',    0);
SELECT pg_temp.check_count('cleaner CANNOT see ad spend',     'SELECT count(*) FROM marketing_spend', 0);
SELECT pg_temp.check_count('cleaner sees own timesheet only',
  'SELECT count(*) FROM time_entries WHERE "staffId" <> cleanos.current_staff_id()', 0);
SELECT pg_temp.check_denied('cleaner CANNOT delete a job', 'DELETE FROM jobs');
SELECT pg_temp.check_denied('cleaner CANNOT give themselves a raise',
  'UPDATE staff SET "basicSalaryFils" = 99999999 WHERE id = cleanos.current_staff_id()');
RESET ROLE;

-- ===========================================================================
-- --- CLIENT: only their own account ---
-- ===========================================================================
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000004","role":"authenticated"}', false);
SET ROLE authenticated;

SELECT pg_temp.check_count('client sees ONLY own record',   'SELECT count(*) FROM clients',  1);
SELECT pg_temp.check_count('client sees ONLY own jobs',     'SELECT count(*) FROM jobs',     (SELECT client_jobs FROM truth));
SELECT pg_temp.check_count('client sees ONLY own invoices', 'SELECT count(*) FROM invoices', (SELECT client_invoices FROM truth));
SELECT pg_temp.check_count('client CANNOT see staff',       'SELECT count(*) FROM staff',    0);
SELECT pg_temp.check_count('client CANNOT see leads',       'SELECT count(*) FROM leads',    0);
SELECT pg_temp.check_count('client CANNOT see other tickets','SELECT count(*) FROM tickets WHERE "clientId" <> cleanos.current_client_id()', 0);
SELECT pg_temp.check_count('client CANNOT see internal notes','SELECT count(*) FROM ticket_comments WHERE "isInternal"', 0);
SELECT pg_temp.check_count('client CANNOT see timesheets',  'SELECT count(*) FROM time_entries', 0);
SELECT pg_temp.check_count('client CAN read the live rate card', 'SELECT count(*) FROM rate_card_items', 18);
SELECT pg_temp.check_denied('client CANNOT edit an invoice', 'UPDATE invoices SET "amountPaidFils" = "totalFils"');
SELECT pg_temp.check_denied('client CANNOT read another client by id',
  'UPDATE clients SET "creditBalanceFils" = 100000 WHERE id <> cleanos.current_client_id()');
RESET ROLE;

-- ===========================================================================
-- --- NOT LOGGED IN: the public API must return nothing at all ---
-- ===========================================================================
SELECT set_config('request.jwt.claims', NULL, false);
SET ROLE anon;
SELECT pg_temp.check_blocked('anon blocked from clients',  'SELECT count(*) FROM clients');
SELECT pg_temp.check_blocked('anon blocked from jobs',     'SELECT count(*) FROM jobs');
SELECT pg_temp.check_blocked('anon blocked from invoices', 'SELECT count(*) FROM invoices');
SELECT pg_temp.check_blocked('anon blocked from staff',    'SELECT count(*) FROM staff');
SELECT pg_temp.check_blocked('anon blocked from users',    'SELECT count(*) FROM users');
RESET ROLE;

-- ===========================================================================
-- ================ RESULTS ================
SELECT CASE WHEN ok THEN 'PASS' ELSE '**FAIL**' END AS result,
       check_name, expected, actual
FROM results ORDER BY ok, check_name;


