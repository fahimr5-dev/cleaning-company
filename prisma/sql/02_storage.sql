-- ============================================================================
-- CleanOS — Supabase Storage buckets and their access rules
-- ----------------------------------------------------------------------------
-- Files (job photos, visa scans, invoice PDFs) do not live in the database —
-- they live in Supabase Storage. Storage has its own separate set of rules,
-- which is what this file sets up.
--
-- RUN THIS IN THE SUPABASE SQL EDITOR, not against a local database — the
-- `storage` schema only exists inside a real Supabase project.
--
-- FOLDER CONVENTION (the rules below depend on it):
--   job-photos/<jobId>/<filename>       before/after photos
--   staff-documents/<staffId>/<file>    visa, Emirates ID, medical scans
--   invoices/<invoiceId>/<file>.pdf     generated PDFs
--   branding/<file>                     your logo — the only public bucket
-- ============================================================================

-- 1. The buckets. `public = false` means a file cannot be read by guessing its
--    URL; every download must be signed and permission-checked.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('job-photos',      'job-photos',      false, 10485760, ARRAY['image/jpeg','image/png','image/webp','image/heic']),
  ('staff-documents', 'staff-documents', false, 10485760, ARRAY['image/jpeg','image/png','image/webp','application/pdf']),
  ('invoices',        'invoices',        false, 10485760, ARRAY['application/pdf']),
  ('branding',        'branding',        true,   2097152, ARRAY['image/jpeg','image/png','image/webp','image/svg+xml'])
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ----------------------------------------------------------------------------
-- 2. JOB PHOTOS
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "job photos: office full access" ON storage.objects;
CREATE POLICY "job photos: office full access" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'job-photos' AND public.is_ops())
  WITH CHECK (bucket_id = 'job-photos' AND public.is_ops());

-- A cleaner may upload into, and look at, only the folders of jobs they are on.
DROP POLICY IF EXISTS "job photos: cleaner uploads to own jobs" ON storage.objects;
CREATE POLICY "job photos: cleaner uploads to own jobs" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'job-photos'
    AND public.is_cleaner()
    AND public.staff_can_see_job(((storage.foldername(name))[1])::uuid)
  );

DROP POLICY IF EXISTS "job photos: cleaner reads own jobs" ON storage.objects;
CREATE POLICY "job photos: cleaner reads own jobs" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'job-photos'
    AND public.is_cleaner()
    AND public.staff_can_see_job(((storage.foldername(name))[1])::uuid)
  );

-- A client may look at photos of their own home. They cannot upload or delete.
DROP POLICY IF EXISTS "job photos: client reads own jobs" ON storage.objects;
CREATE POLICY "job photos: client reads own jobs" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'job-photos'
    AND public.is_client()
    AND public.client_owns_job(((storage.foldername(name))[1])::uuid)
  );

-- ----------------------------------------------------------------------------
-- 3. STAFF DOCUMENTS — visa and Emirates ID scans. Office only, plus the
--    employee's own file. Never visible to clients.
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "staff docs: office full access" ON storage.objects;
CREATE POLICY "staff docs: office full access" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'staff-documents' AND public.is_ops())
  WITH CHECK (bucket_id = 'staff-documents' AND public.is_ops());

DROP POLICY IF EXISTS "staff docs: employee reads own" ON storage.objects;
CREATE POLICY "staff docs: employee reads own" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'staff-documents'
    AND public.is_cleaner()
    AND ((storage.foldername(name))[1])::uuid = public.current_staff_id()
  );

-- ----------------------------------------------------------------------------
-- 4. INVOICE PDFs — the owner writes them, the client reads their own.
--    An ops manager may read but not change them, matching the database rules.
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "invoices: owner full access" ON storage.objects;
CREATE POLICY "invoices: owner full access" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'invoices' AND public.is_owner())
  WITH CHECK (bucket_id = 'invoices' AND public.is_owner());

DROP POLICY IF EXISTS "invoices: ops read only" ON storage.objects;
CREATE POLICY "invoices: ops read only" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'invoices' AND public.app_role() = 'OPS_MANAGER');

DROP POLICY IF EXISTS "invoices: client reads own" ON storage.objects;
CREATE POLICY "invoices: client reads own" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'invoices'
    AND public.is_client()
    AND public.client_owns_invoice(((storage.foldername(name))[1])::uuid)
  );

-- ----------------------------------------------------------------------------
-- 5. BRANDING — your logo, which must be readable by anyone because it appears
--    on the public website and on emailed invoices.
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "branding: public read" ON storage.objects;
CREATE POLICY "branding: public read" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'branding');

DROP POLICY IF EXISTS "branding: owner writes" ON storage.objects;
CREATE POLICY "branding: owner writes" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'branding' AND public.is_owner())
  WITH CHECK (bucket_id = 'branding' AND public.is_owner());
