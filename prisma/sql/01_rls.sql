-- ============================================================================
-- CleanOS — Row Level Security
-- ----------------------------------------------------------------------------
-- WHAT THIS FILE IS, IN PLAIN ENGLISH
--
-- These are rules enforced by the database itself, not by the website code.
-- Even if a developer writes a buggy page that asks for "all clients", the
-- database will still only hand back the rows that the logged-in person is
-- allowed to see. It is the seatbelt behind the app's own airbag.
--
-- WHO IS WHO
--   OWNER        — sees and changes everything.
--   OPS_MANAGER  — everything operational; can READ money, cannot CHANGE money.
--   CLEANER      — only their own jobs, their own timesheet, their own profile.
--   CLIENT       — only their own bookings, invoices and photos.
--
-- IMPORTANT: run this file EVERY time you run a migration that adds a table,
-- otherwise the new table will have no rules on it. It is safe to re-run.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. PLUMBING — grant the two Supabase web roles the right level of access.
--    `anon` = a visitor who is not logged in. We give them NOTHING, because
--    every Supabase project exposes its tables on a public API and that is the
--    single most common way Supabase apps leak data.
-- ----------------------------------------------------------------------------

GRANT USAGE ON SCHEMA cleanos TO anon, authenticated, service_role;

REVOKE ALL ON ALL TABLES IN SCHEMA cleanos FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA cleanos FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA cleanos TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA cleanos TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA cleanos TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA cleanos TO service_role;

-- Same treatment for any table a future migration creates.
ALTER DEFAULT PRIVILEGES IN SCHEMA cleanos REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA cleanos GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA cleanos GRANT ALL ON TABLES TO service_role;

-- ----------------------------------------------------------------------------
-- 2. HELPER FUNCTIONS — small questions the rules ask over and over.
--    SECURITY DEFINER means "answer this question with the database owner's
--    eyes", which is required so the rules can look up who you are without
--    tripping over the rules themselves.
-- ----------------------------------------------------------------------------

-- Which of the four roles is the logged-in person?
CREATE OR REPLACE FUNCTION cleanos.app_role()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = cleanos, pg_temp AS $$
  SELECT u.role::text
  FROM cleanos.users u
  WHERE u.id = auth.uid()
    AND u."isActive"
    AND u."deletedAt" IS NULL;
$$;

CREATE OR REPLACE FUNCTION cleanos.is_owner()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = cleanos, pg_temp AS $$
  SELECT cleanos.app_role() = 'OWNER';
$$;

-- "Office staff" = owner or operations manager.
CREATE OR REPLACE FUNCTION cleanos.is_ops()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = cleanos, pg_temp AS $$
  SELECT cleanos.app_role() IN ('OWNER', 'OPS_MANAGER');
$$;

CREATE OR REPLACE FUNCTION cleanos.is_cleaner()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = cleanos, pg_temp AS $$
  SELECT cleanos.app_role() = 'CLEANER';
$$;

CREATE OR REPLACE FUNCTION cleanos.is_client()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = cleanos, pg_temp AS $$
  SELECT cleanos.app_role() = 'CLIENT';
$$;

-- Which employee record belongs to the logged-in person? (NULL if none.)
CREATE OR REPLACE FUNCTION cleanos.current_staff_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = cleanos, pg_temp AS $$
  SELECT s.id FROM cleanos.staff s
  WHERE s."userId" = auth.uid() AND s."deletedAt" IS NULL;
$$;

-- Which client record belongs to the logged-in person? (NULL if none.)
CREATE OR REPLACE FUNCTION cleanos.current_client_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = cleanos, pg_temp AS $$
  SELECT c.id FROM cleanos.clients c
  WHERE c."userId" = auth.uid() AND c."deletedAt" IS NULL;
$$;

-- Is this cleaner on this job — either personally assigned, or in the team
-- that is doing it?
CREATE OR REPLACE FUNCTION cleanos.staff_can_see_job(p_job uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = cleanos, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM cleanos.jobs j
    WHERE j.id = p_job
      AND j."deletedAt" IS NULL
      AND (
        EXISTS (
          SELECT 1 FROM cleanos.job_assignments ja
          WHERE ja."jobId" = j.id AND ja."staffId" = cleanos.current_staff_id()
        )
        OR EXISTS (
          SELECT 1 FROM cleanos.team_members tm
          WHERE tm."teamId" = j."teamId"
            AND tm."staffId" = cleanos.current_staff_id()
            AND tm."leftAt" IS NULL
        )
      )
  );
$$;

-- Is this job one of the logged-in client's own bookings?
CREATE OR REPLACE FUNCTION cleanos.client_owns_job(p_job uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = cleanos, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM cleanos.jobs j
    WHERE j.id = p_job AND j."clientId" = cleanos.current_client_id()
  );
$$;

-- Is this invoice one of the logged-in client's own?
CREATE OR REPLACE FUNCTION cleanos.client_owns_invoice(p_invoice uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = cleanos, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM cleanos.invoices i
    WHERE i.id = p_invoice AND i."clientId" = cleanos.current_client_id()
  );
$$;

REVOKE ALL ON FUNCTION cleanos.app_role() FROM public;
GRANT EXECUTE ON FUNCTION
  cleanos.app_role(), cleanos.is_owner(), cleanos.is_ops(), cleanos.is_cleaner(),
  cleanos.is_client(), cleanos.current_staff_id(), cleanos.current_client_id(),
  cleanos.staff_can_see_job(uuid), cleanos.client_owns_job(uuid),
  cleanos.client_owns_invoice(uuid)
TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 3. A TINY TOOL so the rules below read as one line each instead of five.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION cleanos._rls(
  p_table text, p_name text, p_cmd text, p_using text, p_check text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql AS $fn$
BEGIN
  EXECUTE format('DROP POLICY IF EXISTS %I ON cleanos.%I', p_name, p_table);
  IF upper(p_cmd) = 'INSERT' THEN
    EXECUTE format(
      'CREATE POLICY %I ON cleanos.%I FOR INSERT TO authenticated WITH CHECK (%s)',
      p_name, p_table, coalesce(p_check, p_using));
  ELSIF p_check IS NOT NULL THEN
    EXECUTE format(
      'CREATE POLICY %I ON cleanos.%I FOR %s TO authenticated USING (%s) WITH CHECK (%s)',
      p_name, p_table, upper(p_cmd), p_using, p_check);
  ELSE
    EXECUTE format(
      'CREATE POLICY %I ON cleanos.%I FOR %s TO authenticated USING (%s)',
      p_name, p_table, upper(p_cmd), p_using);
  END IF;
END
$fn$;

-- ----------------------------------------------------------------------------
-- 4. TURN THE RULES ON for every table. A table with RLS enabled and no
--    matching policy returns ZERO rows — deny-by-default, which is what we want.
-- ----------------------------------------------------------------------------

DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'cleanos' AND tablename <> '_prisma_migrations'
  LOOP
    EXECUTE format('ALTER TABLE cleanos.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 5. OWNER — may do anything, on every table.
-- ----------------------------------------------------------------------------

DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'cleanos' AND tablename <> '_prisma_migrations'
  LOOP
    PERFORM cleanos._rls(t, 'owner_all', 'ALL', 'cleanos.is_owner()', 'cleanos.is_owner()');
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 6. OPERATIONS MANAGER
--    6a. Full control of everything operational.
-- ----------------------------------------------------------------------------

DO $$
DECLARE
  t text;
  ops_tables text[] := ARRAY[
    'zones','zone_travel_times','service_types','checklist_templates',
    'checklist_template_items','leads','lead_activities','quotes','quote_lines',
    'clients','client_properties','referrals','staff','staff_documents',
    'compliance_alerts','teams','team_members','leave_requests',
    'recurring_series','jobs','job_lines','job_assignments',
    'job_checklist_items','job_photos','time_entries','tickets',
    'ticket_comments','ticket_attachments','ratings','nps_responses',
    'client_risk_flags','campaigns','campaign_recipients','message_templates',
    'message_logs','inventory_items','stock_movements','job_consumables',
    'equipment','equipment_maintenance'
  ];
BEGIN
  FOREACH t IN ARRAY ops_tables LOOP
    PERFORM cleanos._rls(
      t, 'ops_all', 'ALL',
      'cleanos.app_role() = ''OPS_MANAGER''',
      'cleanos.app_role() = ''OPS_MANAGER''');
  END LOOP;
END $$;

-- 6b. Money: an ops manager may LOOK (they need to know who is overdue before
--     they schedule them) but may not CREATE, EDIT or DELETE anything financial.
DO $$
DECLARE
  t text;
  money_tables text[] := ARRAY[
    'organizations','rate_cards','rate_card_items','frequency_modifiers',
    'invoices','invoice_lines','payments','credit_notes','credit_note_lines',
    'packages','client_packages','package_usages','dunning_events'
  ];
BEGIN
  FOREACH t IN ARRAY money_tables LOOP
    PERFORM cleanos._rls(
      t, 'ops_read_only', 'SELECT',
      'cleanos.app_role() = ''OPS_MANAGER''');
  END LOOP;
END $$;

-- 6c. Deliberately NOT granted to an ops manager at all:
--     marketing_spend (your ad budget) and audit_logs (the tamper trail).

-- ----------------------------------------------------------------------------
-- 6c. SALARY IS COLUMN-LEVEL, NOT ROW-LEVEL.
--
--     PLAIN ENGLISH: an operations manager needs the staff list — who is on
--     which team, whose visa is expiring. They must not see what anyone earns.
--     That is not a question of WHICH ROWS they can see, it is a question of
--     WHICH COLUMNS, and Row Level Security cannot express it.
--
--     So the four payroll columns are taken away from every signed-in web
--     session outright. Nothing reached through a login can read them, whatever
--     the app asks for. Payroll screens run on the server's own connection,
--     which is only reachable from code that has already checked the role.
--
--     This closes the TODO left open in Phase 1.
-- ----------------------------------------------------------------------------

DO $$
DECLARE
  allowed text;
  secret_columns text[] := ARRAY[
    'basicSalaryFils', 'allowancesFils', 'iban', 'wpsLabourCardNo'
  ];
BEGIN
  -- A table-level grant beats any column-level revoke, so the table grant has
  -- to go first and be replaced by an explicit list of the safe columns.
  REVOKE SELECT, UPDATE ON cleanos.staff FROM authenticated;

  SELECT string_agg(quote_ident(column_name), ', ')
  INTO allowed
  FROM information_schema.columns
  WHERE table_schema = 'cleanos'
    AND table_name = 'staff'
    AND NOT (column_name = ANY(secret_columns));

  EXECUTE format('GRANT SELECT (%s) ON cleanos.staff TO authenticated', allowed);
  EXECUTE format('GRANT UPDATE (%s) ON cleanos.staff TO authenticated', allowed);
END $$;

-- ----------------------------------------------------------------------------
-- 7. CLEANER — their own work and nothing else.
-- ----------------------------------------------------------------------------

-- Their own login record.
SELECT cleanos._rls('users', 'cleaner_own_user', 'SELECT',
  'cleanos.is_cleaner() AND id = auth.uid()');

-- Their own employee file and documents (read-only — HR edits these).
SELECT cleanos._rls('staff', 'cleaner_own_staff', 'SELECT',
  'cleanos.is_cleaner() AND id = cleanos.current_staff_id()');
SELECT cleanos._rls('staff_documents', 'cleaner_own_documents', 'SELECT',
  'cleanos.is_cleaner() AND "staffId" = cleanos.current_staff_id()');

-- Their own leave requests: see them, raise them, edit them while pending.
SELECT cleanos._rls('leave_requests', 'cleaner_own_leave_select', 'SELECT',
  'cleanos.is_cleaner() AND "staffId" = cleanos.current_staff_id()');
SELECT cleanos._rls('leave_requests', 'cleaner_own_leave_insert', 'INSERT',
  NULL,
  'cleanos.is_cleaner() AND "staffId" = cleanos.current_staff_id() AND status = ''PENDING''');
SELECT cleanos._rls('leave_requests', 'cleaner_own_leave_update', 'UPDATE',
  'cleanos.is_cleaner() AND "staffId" = cleanos.current_staff_id() AND status = ''PENDING''',
  'cleanos.is_cleaner() AND "staffId" = cleanos.current_staff_id() AND status IN (''PENDING'', ''CANCELLED'')');

-- The team(s) they belong to.
SELECT cleanos._rls('teams', 'cleaner_own_teams', 'SELECT',
  'cleanos.is_cleaner() AND EXISTS (SELECT 1 FROM cleanos.team_members tm WHERE tm."teamId" = teams.id AND tm."staffId" = cleanos.current_staff_id() AND tm."leftAt" IS NULL)');
SELECT cleanos._rls('team_members', 'cleaner_own_team_members', 'SELECT',
  'cleanos.is_cleaner() AND EXISTS (SELECT 1 FROM cleanos.team_members mine WHERE mine."teamId" = team_members."teamId" AND mine."staffId" = cleanos.current_staff_id() AND mine."leftAt" IS NULL)');

-- Jobs they are on. They may update them (status, arrival time) but never
-- create or delete one.
SELECT cleanos._rls('jobs', 'cleaner_assigned_jobs_select', 'SELECT',
  'cleanos.is_cleaner() AND cleanos.staff_can_see_job(id)');
SELECT cleanos._rls('jobs', 'cleaner_assigned_jobs_update', 'UPDATE',
  'cleanos.is_cleaner() AND cleanos.staff_can_see_job(id)',
  'cleanos.is_cleaner() AND cleanos.staff_can_see_job(id)');

SELECT cleanos._rls('job_lines', 'cleaner_job_lines', 'SELECT',
  'cleanos.is_cleaner() AND cleanos.staff_can_see_job("jobId")');
SELECT cleanos._rls('job_assignments', 'cleaner_job_assignments', 'SELECT',
  'cleanos.is_cleaner() AND cleanos.staff_can_see_job("jobId")');

-- The customer and the address for those jobs — name, phone, gate code, pets.
SELECT cleanos._rls('clients', 'cleaner_job_clients', 'SELECT',
  'cleanos.is_cleaner() AND EXISTS (SELECT 1 FROM cleanos.jobs j WHERE j."clientId" = clients.id AND cleanos.staff_can_see_job(j.id))');
SELECT cleanos._rls('client_properties', 'cleaner_job_properties', 'SELECT',
  'cleanos.is_cleaner() AND EXISTS (SELECT 1 FROM cleanos.jobs j WHERE j."propertyId" = client_properties.id AND cleanos.staff_can_see_job(j.id))');

-- The checklist for those jobs — they tick the boxes.
SELECT cleanos._rls('job_checklist_items', 'cleaner_checklist_select', 'SELECT',
  'cleanos.is_cleaner() AND cleanos.staff_can_see_job("jobId")');
SELECT cleanos._rls('job_checklist_items', 'cleaner_checklist_update', 'UPDATE',
  'cleanos.is_cleaner() AND cleanos.staff_can_see_job("jobId")',
  'cleanos.is_cleaner() AND cleanos.staff_can_see_job("jobId")');

-- Before/after photos — they add them, they cannot remove them.
SELECT cleanos._rls('job_photos', 'cleaner_photos_select', 'SELECT',
  'cleanos.is_cleaner() AND cleanos.staff_can_see_job("jobId")');
SELECT cleanos._rls('job_photos', 'cleaner_photos_insert', 'INSERT',
  NULL,
  'cleanos.is_cleaner() AND cleanos.staff_can_see_job("jobId") AND "takenByStaffId" = cleanos.current_staff_id()');

-- Their own timesheet. They clock themselves in, never anybody else.
SELECT cleanos._rls('time_entries', 'cleaner_time_select', 'SELECT',
  'cleanos.is_cleaner() AND "staffId" = cleanos.current_staff_id()');
SELECT cleanos._rls('time_entries', 'cleaner_time_insert', 'INSERT',
  NULL,
  'cleanos.is_cleaner() AND "staffId" = cleanos.current_staff_id()');
SELECT cleanos._rls('time_entries', 'cleaner_time_update', 'UPDATE',
  'cleanos.is_cleaner() AND "staffId" = cleanos.current_staff_id()',
  'cleanos.is_cleaner() AND "staffId" = cleanos.current_staff_id()');

-- Reporting a problem from site.
SELECT cleanos._rls('tickets', 'cleaner_tickets_select', 'SELECT',
  'cleanos.is_cleaner() AND "raisedByStaffId" = cleanos.current_staff_id()');
SELECT cleanos._rls('tickets', 'cleaner_tickets_insert', 'INSERT',
  NULL,
  'cleanos.is_cleaner() AND "raisedByStaffId" = cleanos.current_staff_id()');
SELECT cleanos._rls('ticket_comments', 'cleaner_ticket_comments_select', 'SELECT',
  'cleanos.is_cleaner() AND EXISTS (SELECT 1 FROM cleanos.tickets tk WHERE tk.id = ticket_comments."ticketId" AND tk."raisedByStaffId" = cleanos.current_staff_id())');
SELECT cleanos._rls('ticket_comments', 'cleaner_ticket_comments_insert', 'INSERT',
  NULL,
  'cleanos.is_cleaner() AND EXISTS (SELECT 1 FROM cleanos.tickets tk WHERE tk.id = ticket_comments."ticketId" AND tk."raisedByStaffId" = cleanos.current_staff_id())');
SELECT cleanos._rls('ticket_attachments', 'cleaner_ticket_attachments_select', 'SELECT',
  'cleanos.is_cleaner() AND EXISTS (SELECT 1 FROM cleanos.tickets tk WHERE tk.id = ticket_attachments."ticketId" AND tk."raisedByStaffId" = cleanos.current_staff_id())');
SELECT cleanos._rls('ticket_attachments', 'cleaner_ticket_attachments_insert', 'INSERT',
  NULL,
  'cleanos.is_cleaner() AND EXISTS (SELECT 1 FROM cleanos.tickets tk WHERE tk.id = ticket_attachments."ticketId" AND tk."raisedByStaffId" = cleanos.current_staff_id())');

-- Supplies used on their jobs.
SELECT cleanos._rls('job_consumables', 'cleaner_consumables_select', 'SELECT',
  'cleanos.is_cleaner() AND cleanos.staff_can_see_job("jobId")');
SELECT cleanos._rls('job_consumables', 'cleaner_consumables_insert', 'INSERT',
  NULL,
  'cleanos.is_cleaner() AND cleanos.staff_can_see_job("jobId")');

-- Equipment in their hands or their team's.
SELECT cleanos._rls('equipment', 'cleaner_equipment', 'SELECT',
  'cleanos.is_cleaner() AND ("assignedStaffId" = cleanos.current_staff_id() OR EXISTS (SELECT 1 FROM cleanos.team_members tm WHERE tm."teamId" = equipment."assignedTeamId" AND tm."staffId" = cleanos.current_staff_id() AND tm."leftAt" IS NULL))');

-- Shared reference lists the mobile app needs to render.
SELECT cleanos._rls('service_types', 'cleaner_service_types', 'SELECT',
  'cleanos.is_cleaner() AND "deletedAt" IS NULL');
SELECT cleanos._rls('zones', 'cleaner_zones', 'SELECT', 'cleanos.is_cleaner()');
SELECT cleanos._rls('checklist_templates', 'cleaner_templates', 'SELECT',
  'cleanos.is_cleaner() AND "deletedAt" IS NULL');
SELECT cleanos._rls('checklist_template_items', 'cleaner_template_items', 'SELECT',
  'cleanos.is_cleaner()');
SELECT cleanos._rls('inventory_items', 'cleaner_inventory', 'SELECT',
  'cleanos.is_cleaner() AND "deletedAt" IS NULL AND "isActive"');
SELECT cleanos._rls('organizations', 'cleaner_org_settings', 'SELECT',
  'cleanos.is_cleaner()');

-- ----------------------------------------------------------------------------
-- 8. CLIENT — their own account and nothing about anybody else.
-- ----------------------------------------------------------------------------

SELECT cleanos._rls('users', 'client_own_user', 'SELECT',
  'cleanos.is_client() AND id = auth.uid()');
SELECT cleanos._rls('users', 'client_own_user_update', 'UPDATE',
  'cleanos.is_client() AND id = auth.uid()',
  'cleanos.is_client() AND id = auth.uid()');

SELECT cleanos._rls('clients', 'client_own_record_select', 'SELECT',
  'cleanos.is_client() AND id = cleanos.current_client_id()');
SELECT cleanos._rls('clients', 'client_own_record_update', 'UPDATE',
  'cleanos.is_client() AND id = cleanos.current_client_id()',
  'cleanos.is_client() AND id = cleanos.current_client_id()');

-- Their addresses — they may add and edit them.
SELECT cleanos._rls('client_properties', 'client_own_properties_select', 'SELECT',
  'cleanos.is_client() AND "clientId" = cleanos.current_client_id() AND "deletedAt" IS NULL');
SELECT cleanos._rls('client_properties', 'client_own_properties_insert', 'INSERT',
  NULL, 'cleanos.is_client() AND "clientId" = cleanos.current_client_id()');
SELECT cleanos._rls('client_properties', 'client_own_properties_update', 'UPDATE',
  'cleanos.is_client() AND "clientId" = cleanos.current_client_id()',
  'cleanos.is_client() AND "clientId" = cleanos.current_client_id()');

-- Their bookings: see, create, reschedule. The 24-hour cutoff and any late fee
-- are applied by the app before it writes — this rule only decides ownership.
SELECT cleanos._rls('jobs', 'client_own_jobs_select', 'SELECT',
  'cleanos.is_client() AND "clientId" = cleanos.current_client_id() AND "deletedAt" IS NULL');
SELECT cleanos._rls('jobs', 'client_own_jobs_insert', 'INSERT',
  NULL, 'cleanos.is_client() AND "clientId" = cleanos.current_client_id()');
SELECT cleanos._rls('jobs', 'client_own_jobs_update', 'UPDATE',
  'cleanos.is_client() AND "clientId" = cleanos.current_client_id()',
  'cleanos.is_client() AND "clientId" = cleanos.current_client_id()');

SELECT cleanos._rls('job_lines', 'client_own_job_lines', 'SELECT',
  'cleanos.is_client() AND cleanos.client_owns_job("jobId")');
SELECT cleanos._rls('recurring_series', 'client_own_series', 'SELECT',
  'cleanos.is_client() AND "clientId" = cleanos.current_client_id()');
SELECT cleanos._rls('job_checklist_items', 'client_own_checklists', 'SELECT',
  'cleanos.is_client() AND cleanos.client_owns_job("jobId")');

-- Photos of their own home, and only the ones marked visible to them.
SELECT cleanos._rls('job_photos', 'client_own_photos', 'SELECT',
  'cleanos.is_client() AND cleanos.client_owns_job("jobId") AND "isVisibleToClient" AND "deletedAt" IS NULL');

-- Their paperwork.
SELECT cleanos._rls('invoices', 'client_own_invoices', 'SELECT',
  'cleanos.is_client() AND "clientId" = cleanos.current_client_id() AND "deletedAt" IS NULL');
SELECT cleanos._rls('invoice_lines', 'client_own_invoice_lines', 'SELECT',
  'cleanos.is_client() AND cleanos.client_owns_invoice("invoiceId")');
SELECT cleanos._rls('payments', 'client_own_payments', 'SELECT',
  'cleanos.is_client() AND "clientId" = cleanos.current_client_id() AND "deletedAt" IS NULL');
SELECT cleanos._rls('credit_notes', 'client_own_credit_notes', 'SELECT',
  'cleanos.is_client() AND "clientId" = cleanos.current_client_id() AND "deletedAt" IS NULL');
SELECT cleanos._rls('credit_note_lines', 'client_own_credit_note_lines', 'SELECT',
  'cleanos.is_client() AND EXISTS (SELECT 1 FROM cleanos.credit_notes cn WHERE cn.id = credit_note_lines."creditNoteId" AND cn."clientId" = cleanos.current_client_id())');

-- Their prepaid session balance.
SELECT cleanos._rls('client_packages', 'client_own_packages', 'SELECT',
  'cleanos.is_client() AND "clientId" = cleanos.current_client_id()');
SELECT cleanos._rls('package_usages', 'client_own_package_usage', 'SELECT',
  'cleanos.is_client() AND EXISTS (SELECT 1 FROM cleanos.client_packages cp WHERE cp.id = package_usages."clientPackageId" AND cp."clientId" = cleanos.current_client_id())');

-- Quotes they have been sent — they may accept or decline.
SELECT cleanos._rls('quotes', 'client_own_quotes_select', 'SELECT',
  'cleanos.is_client() AND "clientId" = cleanos.current_client_id() AND "deletedAt" IS NULL');
SELECT cleanos._rls('quotes', 'client_own_quotes_update', 'UPDATE',
  'cleanos.is_client() AND "clientId" = cleanos.current_client_id()',
  'cleanos.is_client() AND "clientId" = cleanos.current_client_id()');
SELECT cleanos._rls('quote_lines', 'client_own_quote_lines', 'SELECT',
  'cleanos.is_client() AND EXISTS (SELECT 1 FROM cleanos.quotes q WHERE q.id = quote_lines."quoteId" AND q."clientId" = cleanos.current_client_id())');

-- Leaving a review, answering NPS.
SELECT cleanos._rls('ratings', 'client_own_ratings_select', 'SELECT',
  'cleanos.is_client() AND "clientId" = cleanos.current_client_id()');
SELECT cleanos._rls('ratings', 'client_own_ratings_insert', 'INSERT',
  NULL, 'cleanos.is_client() AND "clientId" = cleanos.current_client_id() AND cleanos.client_owns_job("jobId")');
SELECT cleanos._rls('ratings', 'client_own_ratings_update', 'UPDATE',
  'cleanos.is_client() AND "clientId" = cleanos.current_client_id()',
  'cleanos.is_client() AND "clientId" = cleanos.current_client_id()');
SELECT cleanos._rls('nps_responses', 'client_own_nps_select', 'SELECT',
  'cleanos.is_client() AND "clientId" = cleanos.current_client_id()');
SELECT cleanos._rls('nps_responses', 'client_own_nps_update', 'UPDATE',
  'cleanos.is_client() AND "clientId" = cleanos.current_client_id()',
  'cleanos.is_client() AND "clientId" = cleanos.current_client_id()');

-- Raising and following a complaint.
SELECT cleanos._rls('tickets', 'client_own_tickets_select', 'SELECT',
  'cleanos.is_client() AND "clientId" = cleanos.current_client_id() AND "deletedAt" IS NULL');
SELECT cleanos._rls('tickets', 'client_own_tickets_insert', 'INSERT',
  NULL, 'cleanos.is_client() AND "clientId" = cleanos.current_client_id()');
-- Internal notes stay internal: the client only ever sees isInternal = false.
SELECT cleanos._rls('ticket_comments', 'client_own_ticket_comments_select', 'SELECT',
  'cleanos.is_client() AND NOT "isInternal" AND EXISTS (SELECT 1 FROM cleanos.tickets tk WHERE tk.id = ticket_comments."ticketId" AND tk."clientId" = cleanos.current_client_id())');
SELECT cleanos._rls('ticket_comments', 'client_own_ticket_comments_insert', 'INSERT',
  NULL,
  'cleanos.is_client() AND NOT "isInternal" AND EXISTS (SELECT 1 FROM cleanos.tickets tk WHERE tk.id = ticket_comments."ticketId" AND tk."clientId" = cleanos.current_client_id())');

-- Their referral record — how many people they introduced and what they earned.
SELECT cleanos._rls('referrals', 'client_own_referrals', 'SELECT',
  'cleanos.is_client() AND "referrerClientId" = cleanos.current_client_id()');

-- Reference data the booking screen and portal calculator need.
SELECT cleanos._rls('service_types', 'client_service_types', 'SELECT',
  'cleanos.is_client() AND "isActive" AND "deletedAt" IS NULL');
SELECT cleanos._rls('zones', 'client_zones', 'SELECT',
  'cleanos.is_client() AND "isActive"');
SELECT cleanos._rls('packages', 'client_packages_catalog', 'SELECT',
  'cleanos.is_client() AND "isActive" AND "deletedAt" IS NULL');
SELECT cleanos._rls('rate_cards', 'client_rate_card', 'SELECT',
  'cleanos.is_client() AND "isActive" AND "deletedAt" IS NULL');
SELECT cleanos._rls('rate_card_items', 'client_rate_card_items', 'SELECT',
  'cleanos.is_client() AND "isActive" AND EXISTS (SELECT 1 FROM cleanos.rate_cards rc WHERE rc.id = rate_card_items."rateCardId" AND rc."isActive")');
SELECT cleanos._rls('frequency_modifiers', 'client_frequency_modifiers', 'SELECT',
  'cleanos.is_client() AND EXISTS (SELECT 1 FROM cleanos.rate_cards rc WHERE rc.id = frequency_modifiers."rateCardId" AND rc."isActive")');
SELECT cleanos._rls('organizations', 'client_org_settings', 'SELECT',
  'cleanos.is_client()');

-- ----------------------------------------------------------------------------
-- 9. AUDIT LOG — nobody may edit or delete history through the API. The owner
--    may read it; the server writes it using the service key.
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS owner_all ON cleanos.audit_logs;
SELECT cleanos._rls('audit_logs', 'owner_read_audit', 'SELECT', 'cleanos.is_owner()');

