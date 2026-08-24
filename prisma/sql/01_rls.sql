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

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- Same treatment for any table a future migration creates.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;

-- ----------------------------------------------------------------------------
-- 2. HELPER FUNCTIONS — small questions the rules ask over and over.
--    SECURITY DEFINER means "answer this question with the database owner's
--    eyes", which is required so the rules can look up who you are without
--    tripping over the rules themselves.
-- ----------------------------------------------------------------------------

-- Which of the four roles is the logged-in person?
CREATE OR REPLACE FUNCTION public.app_role()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT u.role::text
  FROM public.users u
  WHERE u.id = auth.uid()
    AND u."isActive"
    AND u."deletedAt" IS NULL;
$$;

CREATE OR REPLACE FUNCTION public.is_owner()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT public.app_role() = 'OWNER';
$$;

-- "Office staff" = owner or operations manager.
CREATE OR REPLACE FUNCTION public.is_ops()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT public.app_role() IN ('OWNER', 'OPS_MANAGER');
$$;

CREATE OR REPLACE FUNCTION public.is_cleaner()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT public.app_role() = 'CLEANER';
$$;

CREATE OR REPLACE FUNCTION public.is_client()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT public.app_role() = 'CLIENT';
$$;

-- Which employee record belongs to the logged-in person? (NULL if none.)
CREATE OR REPLACE FUNCTION public.current_staff_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT s.id FROM public.staff s
  WHERE s."userId" = auth.uid() AND s."deletedAt" IS NULL;
$$;

-- Which client record belongs to the logged-in person? (NULL if none.)
CREATE OR REPLACE FUNCTION public.current_client_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT c.id FROM public.clients c
  WHERE c."userId" = auth.uid() AND c."deletedAt" IS NULL;
$$;

-- Is this cleaner on this job — either personally assigned, or in the team
-- that is doing it?
CREATE OR REPLACE FUNCTION public.staff_can_see_job(p_job uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.jobs j
    WHERE j.id = p_job
      AND j."deletedAt" IS NULL
      AND (
        EXISTS (
          SELECT 1 FROM public.job_assignments ja
          WHERE ja."jobId" = j.id AND ja."staffId" = public.current_staff_id()
        )
        OR EXISTS (
          SELECT 1 FROM public.team_members tm
          WHERE tm."teamId" = j."teamId"
            AND tm."staffId" = public.current_staff_id()
            AND tm."leftAt" IS NULL
        )
      )
  );
$$;

-- Is this job one of the logged-in client's own bookings?
CREATE OR REPLACE FUNCTION public.client_owns_job(p_job uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.jobs j
    WHERE j.id = p_job AND j."clientId" = public.current_client_id()
  );
$$;

-- Is this invoice one of the logged-in client's own?
CREATE OR REPLACE FUNCTION public.client_owns_invoice(p_invoice uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id = p_invoice AND i."clientId" = public.current_client_id()
  );
$$;

REVOKE ALL ON FUNCTION public.app_role() FROM public;
GRANT EXECUTE ON FUNCTION
  public.app_role(), public.is_owner(), public.is_ops(), public.is_cleaner(),
  public.is_client(), public.current_staff_id(), public.current_client_id(),
  public.staff_can_see_job(uuid), public.client_owns_job(uuid),
  public.client_owns_invoice(uuid)
TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 3. A TINY TOOL so the rules below read as one line each instead of five.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public._rls(
  p_table text, p_name text, p_cmd text, p_using text, p_check text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql AS $fn$
BEGIN
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p_name, p_table);
  IF upper(p_cmd) = 'INSERT' THEN
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (%s)',
      p_name, p_table, coalesce(p_check, p_using));
  ELSIF p_check IS NOT NULL THEN
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR %s TO authenticated USING (%s) WITH CHECK (%s)',
      p_name, p_table, upper(p_cmd), p_using, p_check);
  ELSE
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR %s TO authenticated USING (%s)',
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
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
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
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  LOOP
    PERFORM public._rls(t, 'owner_all', 'ALL', 'public.is_owner()', 'public.is_owner()');
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
    PERFORM public._rls(
      t, 'ops_all', 'ALL',
      'public.app_role() = ''OPS_MANAGER''',
      'public.app_role() = ''OPS_MANAGER''');
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
    PERFORM public._rls(
      t, 'ops_read_only', 'SELECT',
      'public.app_role() = ''OPS_MANAGER''');
  END LOOP;
END $$;

-- 6c. Deliberately NOT granted to an ops manager at all:
--     marketing_spend (your ad budget) and audit_logs (the tamper trail).

-- ----------------------------------------------------------------------------
-- 7. CLEANER — their own work and nothing else.
-- ----------------------------------------------------------------------------

-- Their own login record.
SELECT public._rls('users', 'cleaner_own_user', 'SELECT',
  'public.is_cleaner() AND id = auth.uid()');

-- Their own employee file and documents (read-only — HR edits these).
SELECT public._rls('staff', 'cleaner_own_staff', 'SELECT',
  'public.is_cleaner() AND id = public.current_staff_id()');
SELECT public._rls('staff_documents', 'cleaner_own_documents', 'SELECT',
  'public.is_cleaner() AND "staffId" = public.current_staff_id()');

-- Their own leave requests: see them, raise them, edit them while pending.
SELECT public._rls('leave_requests', 'cleaner_own_leave_select', 'SELECT',
  'public.is_cleaner() AND "staffId" = public.current_staff_id()');
SELECT public._rls('leave_requests', 'cleaner_own_leave_insert', 'INSERT',
  NULL,
  'public.is_cleaner() AND "staffId" = public.current_staff_id() AND status = ''PENDING''');
SELECT public._rls('leave_requests', 'cleaner_own_leave_update', 'UPDATE',
  'public.is_cleaner() AND "staffId" = public.current_staff_id() AND status = ''PENDING''',
  'public.is_cleaner() AND "staffId" = public.current_staff_id() AND status IN (''PENDING'', ''CANCELLED'')');

-- The team(s) they belong to.
SELECT public._rls('teams', 'cleaner_own_teams', 'SELECT',
  'public.is_cleaner() AND EXISTS (SELECT 1 FROM public.team_members tm WHERE tm."teamId" = teams.id AND tm."staffId" = public.current_staff_id() AND tm."leftAt" IS NULL)');
SELECT public._rls('team_members', 'cleaner_own_team_members', 'SELECT',
  'public.is_cleaner() AND EXISTS (SELECT 1 FROM public.team_members mine WHERE mine."teamId" = team_members."teamId" AND mine."staffId" = public.current_staff_id() AND mine."leftAt" IS NULL)');

-- Jobs they are on. They may update them (status, arrival time) but never
-- create or delete one.
SELECT public._rls('jobs', 'cleaner_assigned_jobs_select', 'SELECT',
  'public.is_cleaner() AND public.staff_can_see_job(id)');
SELECT public._rls('jobs', 'cleaner_assigned_jobs_update', 'UPDATE',
  'public.is_cleaner() AND public.staff_can_see_job(id)',
  'public.is_cleaner() AND public.staff_can_see_job(id)');

SELECT public._rls('job_lines', 'cleaner_job_lines', 'SELECT',
  'public.is_cleaner() AND public.staff_can_see_job("jobId")');
SELECT public._rls('job_assignments', 'cleaner_job_assignments', 'SELECT',
  'public.is_cleaner() AND public.staff_can_see_job("jobId")');

-- The customer and the address for those jobs — name, phone, gate code, pets.
SELECT public._rls('clients', 'cleaner_job_clients', 'SELECT',
  'public.is_cleaner() AND EXISTS (SELECT 1 FROM public.jobs j WHERE j."clientId" = clients.id AND public.staff_can_see_job(j.id))');
SELECT public._rls('client_properties', 'cleaner_job_properties', 'SELECT',
  'public.is_cleaner() AND EXISTS (SELECT 1 FROM public.jobs j WHERE j."propertyId" = client_properties.id AND public.staff_can_see_job(j.id))');

-- The checklist for those jobs — they tick the boxes.
SELECT public._rls('job_checklist_items', 'cleaner_checklist_select', 'SELECT',
  'public.is_cleaner() AND public.staff_can_see_job("jobId")');
SELECT public._rls('job_checklist_items', 'cleaner_checklist_update', 'UPDATE',
  'public.is_cleaner() AND public.staff_can_see_job("jobId")',
  'public.is_cleaner() AND public.staff_can_see_job("jobId")');

-- Before/after photos — they add them, they cannot remove them.
SELECT public._rls('job_photos', 'cleaner_photos_select', 'SELECT',
  'public.is_cleaner() AND public.staff_can_see_job("jobId")');
SELECT public._rls('job_photos', 'cleaner_photos_insert', 'INSERT',
  NULL,
  'public.is_cleaner() AND public.staff_can_see_job("jobId") AND "takenByStaffId" = public.current_staff_id()');

-- Their own timesheet. They clock themselves in, never anybody else.
SELECT public._rls('time_entries', 'cleaner_time_select', 'SELECT',
  'public.is_cleaner() AND "staffId" = public.current_staff_id()');
SELECT public._rls('time_entries', 'cleaner_time_insert', 'INSERT',
  NULL,
  'public.is_cleaner() AND "staffId" = public.current_staff_id()');
SELECT public._rls('time_entries', 'cleaner_time_update', 'UPDATE',
  'public.is_cleaner() AND "staffId" = public.current_staff_id()',
  'public.is_cleaner() AND "staffId" = public.current_staff_id()');

-- Reporting a problem from site.
SELECT public._rls('tickets', 'cleaner_tickets_select', 'SELECT',
  'public.is_cleaner() AND "raisedByStaffId" = public.current_staff_id()');
SELECT public._rls('tickets', 'cleaner_tickets_insert', 'INSERT',
  NULL,
  'public.is_cleaner() AND "raisedByStaffId" = public.current_staff_id()');
SELECT public._rls('ticket_comments', 'cleaner_ticket_comments_select', 'SELECT',
  'public.is_cleaner() AND EXISTS (SELECT 1 FROM public.tickets tk WHERE tk.id = ticket_comments."ticketId" AND tk."raisedByStaffId" = public.current_staff_id())');
SELECT public._rls('ticket_comments', 'cleaner_ticket_comments_insert', 'INSERT',
  NULL,
  'public.is_cleaner() AND EXISTS (SELECT 1 FROM public.tickets tk WHERE tk.id = ticket_comments."ticketId" AND tk."raisedByStaffId" = public.current_staff_id())');
SELECT public._rls('ticket_attachments', 'cleaner_ticket_attachments_select', 'SELECT',
  'public.is_cleaner() AND EXISTS (SELECT 1 FROM public.tickets tk WHERE tk.id = ticket_attachments."ticketId" AND tk."raisedByStaffId" = public.current_staff_id())');
SELECT public._rls('ticket_attachments', 'cleaner_ticket_attachments_insert', 'INSERT',
  NULL,
  'public.is_cleaner() AND EXISTS (SELECT 1 FROM public.tickets tk WHERE tk.id = ticket_attachments."ticketId" AND tk."raisedByStaffId" = public.current_staff_id())');

-- Supplies used on their jobs.
SELECT public._rls('job_consumables', 'cleaner_consumables_select', 'SELECT',
  'public.is_cleaner() AND public.staff_can_see_job("jobId")');
SELECT public._rls('job_consumables', 'cleaner_consumables_insert', 'INSERT',
  NULL,
  'public.is_cleaner() AND public.staff_can_see_job("jobId")');

-- Equipment in their hands or their team's.
SELECT public._rls('equipment', 'cleaner_equipment', 'SELECT',
  'public.is_cleaner() AND ("assignedStaffId" = public.current_staff_id() OR EXISTS (SELECT 1 FROM public.team_members tm WHERE tm."teamId" = equipment."assignedTeamId" AND tm."staffId" = public.current_staff_id() AND tm."leftAt" IS NULL))');

-- Shared reference lists the mobile app needs to render.
SELECT public._rls('service_types', 'cleaner_service_types', 'SELECT',
  'public.is_cleaner() AND "deletedAt" IS NULL');
SELECT public._rls('zones', 'cleaner_zones', 'SELECT', 'public.is_cleaner()');
SELECT public._rls('checklist_templates', 'cleaner_templates', 'SELECT',
  'public.is_cleaner() AND "deletedAt" IS NULL');
SELECT public._rls('checklist_template_items', 'cleaner_template_items', 'SELECT',
  'public.is_cleaner()');
SELECT public._rls('inventory_items', 'cleaner_inventory', 'SELECT',
  'public.is_cleaner() AND "deletedAt" IS NULL AND "isActive"');
SELECT public._rls('organizations', 'cleaner_org_settings', 'SELECT',
  'public.is_cleaner()');

-- ----------------------------------------------------------------------------
-- 8. CLIENT — their own account and nothing about anybody else.
-- ----------------------------------------------------------------------------

SELECT public._rls('users', 'client_own_user', 'SELECT',
  'public.is_client() AND id = auth.uid()');
SELECT public._rls('users', 'client_own_user_update', 'UPDATE',
  'public.is_client() AND id = auth.uid()',
  'public.is_client() AND id = auth.uid()');

SELECT public._rls('clients', 'client_own_record_select', 'SELECT',
  'public.is_client() AND id = public.current_client_id()');
SELECT public._rls('clients', 'client_own_record_update', 'UPDATE',
  'public.is_client() AND id = public.current_client_id()',
  'public.is_client() AND id = public.current_client_id()');

-- Their addresses — they may add and edit them.
SELECT public._rls('client_properties', 'client_own_properties_select', 'SELECT',
  'public.is_client() AND "clientId" = public.current_client_id() AND "deletedAt" IS NULL');
SELECT public._rls('client_properties', 'client_own_properties_insert', 'INSERT',
  NULL, 'public.is_client() AND "clientId" = public.current_client_id()');
SELECT public._rls('client_properties', 'client_own_properties_update', 'UPDATE',
  'public.is_client() AND "clientId" = public.current_client_id()',
  'public.is_client() AND "clientId" = public.current_client_id()');

-- Their bookings: see, create, reschedule. The 24-hour cutoff and any late fee
-- are applied by the app before it writes — this rule only decides ownership.
SELECT public._rls('jobs', 'client_own_jobs_select', 'SELECT',
  'public.is_client() AND "clientId" = public.current_client_id() AND "deletedAt" IS NULL');
SELECT public._rls('jobs', 'client_own_jobs_insert', 'INSERT',
  NULL, 'public.is_client() AND "clientId" = public.current_client_id()');
SELECT public._rls('jobs', 'client_own_jobs_update', 'UPDATE',
  'public.is_client() AND "clientId" = public.current_client_id()',
  'public.is_client() AND "clientId" = public.current_client_id()');

SELECT public._rls('job_lines', 'client_own_job_lines', 'SELECT',
  'public.is_client() AND public.client_owns_job("jobId")');
SELECT public._rls('recurring_series', 'client_own_series', 'SELECT',
  'public.is_client() AND "clientId" = public.current_client_id()');
SELECT public._rls('job_checklist_items', 'client_own_checklists', 'SELECT',
  'public.is_client() AND public.client_owns_job("jobId")');

-- Photos of their own home, and only the ones marked visible to them.
SELECT public._rls('job_photos', 'client_own_photos', 'SELECT',
  'public.is_client() AND public.client_owns_job("jobId") AND "isVisibleToClient" AND "deletedAt" IS NULL');

-- Their paperwork.
SELECT public._rls('invoices', 'client_own_invoices', 'SELECT',
  'public.is_client() AND "clientId" = public.current_client_id() AND "deletedAt" IS NULL');
SELECT public._rls('invoice_lines', 'client_own_invoice_lines', 'SELECT',
  'public.is_client() AND public.client_owns_invoice("invoiceId")');
SELECT public._rls('payments', 'client_own_payments', 'SELECT',
  'public.is_client() AND "clientId" = public.current_client_id() AND "deletedAt" IS NULL');
SELECT public._rls('credit_notes', 'client_own_credit_notes', 'SELECT',
  'public.is_client() AND "clientId" = public.current_client_id() AND "deletedAt" IS NULL');
SELECT public._rls('credit_note_lines', 'client_own_credit_note_lines', 'SELECT',
  'public.is_client() AND EXISTS (SELECT 1 FROM public.credit_notes cn WHERE cn.id = credit_note_lines."creditNoteId" AND cn."clientId" = public.current_client_id())');

-- Their prepaid session balance.
SELECT public._rls('client_packages', 'client_own_packages', 'SELECT',
  'public.is_client() AND "clientId" = public.current_client_id()');
SELECT public._rls('package_usages', 'client_own_package_usage', 'SELECT',
  'public.is_client() AND EXISTS (SELECT 1 FROM public.client_packages cp WHERE cp.id = package_usages."clientPackageId" AND cp."clientId" = public.current_client_id())');

-- Quotes they have been sent — they may accept or decline.
SELECT public._rls('quotes', 'client_own_quotes_select', 'SELECT',
  'public.is_client() AND "clientId" = public.current_client_id() AND "deletedAt" IS NULL');
SELECT public._rls('quotes', 'client_own_quotes_update', 'UPDATE',
  'public.is_client() AND "clientId" = public.current_client_id()',
  'public.is_client() AND "clientId" = public.current_client_id()');
SELECT public._rls('quote_lines', 'client_own_quote_lines', 'SELECT',
  'public.is_client() AND EXISTS (SELECT 1 FROM public.quotes q WHERE q.id = quote_lines."quoteId" AND q."clientId" = public.current_client_id())');

-- Leaving a review, answering NPS.
SELECT public._rls('ratings', 'client_own_ratings_select', 'SELECT',
  'public.is_client() AND "clientId" = public.current_client_id()');
SELECT public._rls('ratings', 'client_own_ratings_insert', 'INSERT',
  NULL, 'public.is_client() AND "clientId" = public.current_client_id() AND public.client_owns_job("jobId")');
SELECT public._rls('ratings', 'client_own_ratings_update', 'UPDATE',
  'public.is_client() AND "clientId" = public.current_client_id()',
  'public.is_client() AND "clientId" = public.current_client_id()');
SELECT public._rls('nps_responses', 'client_own_nps_select', 'SELECT',
  'public.is_client() AND "clientId" = public.current_client_id()');
SELECT public._rls('nps_responses', 'client_own_nps_update', 'UPDATE',
  'public.is_client() AND "clientId" = public.current_client_id()',
  'public.is_client() AND "clientId" = public.current_client_id()');

-- Raising and following a complaint.
SELECT public._rls('tickets', 'client_own_tickets_select', 'SELECT',
  'public.is_client() AND "clientId" = public.current_client_id() AND "deletedAt" IS NULL');
SELECT public._rls('tickets', 'client_own_tickets_insert', 'INSERT',
  NULL, 'public.is_client() AND "clientId" = public.current_client_id()');
-- Internal notes stay internal: the client only ever sees isInternal = false.
SELECT public._rls('ticket_comments', 'client_own_ticket_comments_select', 'SELECT',
  'public.is_client() AND NOT "isInternal" AND EXISTS (SELECT 1 FROM public.tickets tk WHERE tk.id = ticket_comments."ticketId" AND tk."clientId" = public.current_client_id())');
SELECT public._rls('ticket_comments', 'client_own_ticket_comments_insert', 'INSERT',
  NULL,
  'public.is_client() AND NOT "isInternal" AND EXISTS (SELECT 1 FROM public.tickets tk WHERE tk.id = ticket_comments."ticketId" AND tk."clientId" = public.current_client_id())');

-- Their referral record — how many people they introduced and what they earned.
SELECT public._rls('referrals', 'client_own_referrals', 'SELECT',
  'public.is_client() AND "referrerClientId" = public.current_client_id()');

-- Reference data the booking screen and portal calculator need.
SELECT public._rls('service_types', 'client_service_types', 'SELECT',
  'public.is_client() AND "isActive" AND "deletedAt" IS NULL');
SELECT public._rls('zones', 'client_zones', 'SELECT',
  'public.is_client() AND "isActive"');
SELECT public._rls('packages', 'client_packages_catalog', 'SELECT',
  'public.is_client() AND "isActive" AND "deletedAt" IS NULL');
SELECT public._rls('rate_cards', 'client_rate_card', 'SELECT',
  'public.is_client() AND "isActive" AND "deletedAt" IS NULL');
SELECT public._rls('rate_card_items', 'client_rate_card_items', 'SELECT',
  'public.is_client() AND "isActive" AND EXISTS (SELECT 1 FROM public.rate_cards rc WHERE rc.id = rate_card_items."rateCardId" AND rc."isActive")');
SELECT public._rls('frequency_modifiers', 'client_frequency_modifiers', 'SELECT',
  'public.is_client() AND EXISTS (SELECT 1 FROM public.rate_cards rc WHERE rc.id = frequency_modifiers."rateCardId" AND rc."isActive")');
SELECT public._rls('organizations', 'client_org_settings', 'SELECT',
  'public.is_client()');

-- ----------------------------------------------------------------------------
-- 9. AUDIT LOG — nobody may edit or delete history through the API. The owner
--    may read it; the server writes it using the service key.
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS owner_all ON public.audit_logs;
SELECT public._rls('audit_logs', 'owner_read_audit', 'SELECT', 'public.is_owner()');

