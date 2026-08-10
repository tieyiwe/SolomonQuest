-- SolomonQuest schema additions — run this in your Supabase SQL Editor

-- ─── Video sessions ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS video_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid REFERENCES courses,
  started_by uuid REFERENCES profiles,
  provider text DEFAULT 'jitsi' CHECK (provider IN ('jitsi', 'zoom')),
  room_name text,
  join_url text,
  start_url text,
  zoom_meeting_id text,
  ended_at timestamptz,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE video_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "video_sessions_all" ON video_sessions;
CREATE POLICY "video_sessions_all" ON video_sessions FOR ALL USING (true);
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'video_sessions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE video_sessions;
  END IF;
END $$;

-- ─── School uniqueness ────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS schools_name_unique ON schools (LOWER(name));

-- ─── School branding columns ──────────────────────────────────────────────────
ALTER TABLE schools ADD COLUMN IF NOT EXISTS logo_url text;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS primary_color text DEFAULT '#4f46e5';
ALTER TABLE schools ADD COLUMN IF NOT EXISTS secondary_color text DEFAULT '#7c3aed';
ALTER TABLE schools ADD COLUMN IF NOT EXISTS heading_font text DEFAULT 'Inter';
ALTER TABLE schools ADD COLUMN IF NOT EXISTS heading_color text DEFAULT '#1e1b4b';
ALTER TABLE schools ADD COLUMN IF NOT EXISTS tagline text;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS banner_url text;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS banner_slides jsonb DEFAULT '[]'::jsonb;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS hero_animation text DEFAULT 'fade'
  CHECK (hero_animation IN ('fade', 'slide', 'zoom', 'bounce', 'none'));
ALTER TABLE schools ADD COLUMN IF NOT EXISTS accent_color text DEFAULT '#f59e0b';
ALTER TABLE schools ADD COLUMN IF NOT EXISTS body_font text DEFAULT 'Inter';
ALTER TABLE schools ADD COLUMN IF NOT EXISTS border_radius text DEFAULT 'rounded'
  CHECK (border_radius IN ('sharp', 'rounded', 'pill'));
ALTER TABLE schools ADD COLUMN IF NOT EXISTS stats_visible boolean DEFAULT true;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS stats jsonb DEFAULT '[]'::jsonb;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS features_section jsonb DEFAULT '[]'::jsonb;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS testimonials jsonb DEFAULT '[]'::jsonb;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS social_links jsonb DEFAULT '{}'::jsonb;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS announcement_banner text;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS announcement_color text DEFAULT '#4f46e5';
ALTER TABLE schools ADD COLUMN IF NOT EXISTS show_announcement boolean DEFAULT false;

-- ─── Profile columns ──────────────────────────────────────────────────────────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS internal_email text UNIQUE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS unique_student_id text UNIQUE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS notification_prefs jsonb DEFAULT '{}'::jsonb;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS online_at timestamptz;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bio text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone text;

-- ─── Internal email generation ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.generate_internal_email(
  p_first_name text,
  p_last_name text
) RETURNS text AS $$
DECLARE
  v_base text;
  v_candidate text;
  v_counter int := 1;
BEGIN
  v_base := LOWER(REGEXP_REPLACE(COALESCE(p_first_name, 'user'), '[^a-z]', '', 'g'))
    || LOWER(LEFT(REGEXP_REPLACE(COALESCE(p_last_name, ''), '[^a-zA-Z]', '', 'g'), 1));
  IF v_base = '' OR v_base IS NULL THEN v_base := 'user'; END IF;
  v_candidate := v_base || '@solomonquest.com';
  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE internal_email = v_candidate) LOOP
    v_counter := v_counter + 1;
    v_candidate := v_base || v_counter::text || '@solomonquest.com';
  END LOOP;
  RETURN v_candidate;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── New user trigger ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  v_first_name text;
  v_last_name  text;
  v_unique_id  text;
  v_school_initials text;
BEGIN
  v_first_name := COALESCE(new.raw_user_meta_data->>'first_name', '');
  v_last_name  := COALESCE(new.raw_user_meta_data->>'last_name', '');
  SELECT UPPER(LEFT(name, 2)) INTO v_school_initials FROM public.schools LIMIT 1;
  v_unique_id := COALESCE(v_school_initials, 'SQ') || '-'
    || LPAD((EXTRACT(EPOCH FROM now())::bigint % 100000000)::text, 8, '0');
  INSERT INTO public.profiles (id, first_name, last_name, unique_student_id, internal_email)
  VALUES (
    new.id, v_first_name, v_last_name, v_unique_id,
    public.generate_internal_email(v_first_name, v_last_name)
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Backfill internal_email for existing profiles
UPDATE public.profiles
SET internal_email = public.generate_internal_email(first_name, last_name)
WHERE internal_email IS NULL;

-- ─── Role-based unique ID prefix ─────────────────────────────────────────────
-- When a user's role changes, their unique ID gets the correct prefix:
--   teacher → T-SQ-XXXXXXXX   staff → S-SQ-XXXXXXXX   student → SQ-XXXXXXXX
CREATE OR REPLACE FUNCTION handle_role_change_id() RETURNS TRIGGER AS $$
DECLARE
  v_initials TEXT := 'SQ';
  v_num_part TEXT;
BEGIN
  IF OLD.role IS DISTINCT FROM NEW.role AND NEW.unique_student_id IS NOT NULL THEN
    SELECT UPPER(LEFT(REGEXP_REPLACE(name, '[^A-Za-z ]', '', 'g'), 2))
    INTO v_initials FROM schools WHERE id = NEW.school_id;
    IF v_initials IS NULL OR v_initials = '' THEN v_initials := 'SQ'; END IF;
    v_num_part := REGEXP_REPLACE(NEW.unique_student_id, '^([TS]-)?[A-Z]+-', '');
    IF NEW.role = 'teacher' THEN
      NEW.unique_student_id := 'T-' || v_initials || '-' || v_num_part;
    ELSIF NEW.role = 'staff' THEN
      NEW.unique_student_id := 'S-' || v_initials || '-' || v_num_part;
    ELSE
      NEW.unique_student_id := v_initials || '-' || v_num_part;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_role_change_update_id ON profiles;
CREATE TRIGGER on_role_change_update_id
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION handle_role_change_id();

-- ─── Reminders ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid REFERENCES schools,
  created_by uuid REFERENCES profiles,
  target_user_id uuid REFERENCES profiles,
  target_role text,
  course_id uuid REFERENCES courses,
  message text NOT NULL,
  send_at timestamptz NOT NULL,
  sent boolean DEFAULT false,
  type text CHECK (type IN ('admin_to_teacher', 'teacher_to_student')) DEFAULT 'admin_to_teacher',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "reminders_all" ON reminders;
CREATE POLICY "reminders_all" ON reminders FOR ALL USING (true);

-- ─── Internal messaging (in-platform email) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS internal_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid REFERENCES schools,
  from_user_id uuid REFERENCES profiles NOT NULL,
  to_user_id uuid REFERENCES profiles NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  is_read boolean DEFAULT false,
  read_at timestamptz,
  parent_id uuid REFERENCES internal_messages,
  thread_id uuid,
  deleted_by jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE internal_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "messages_rls" ON internal_messages;
CREATE POLICY "messages_rls" ON internal_messages FOR ALL USING (
  auth.uid() = from_user_id OR auth.uid() = to_user_id
);
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'internal_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE internal_messages;
  END IF;
END $$;

-- ─── Super Admin Platform Tables ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS platform_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES profiles,
  actor_email text,
  action text NOT NULL,
  target_type text,
  target_id text,
  target_name text,
  details jsonb,
  ip_address text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE platform_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "audit_log_superadmin" ON platform_audit_log;
CREATE POLICY "audit_log_superadmin" ON platform_audit_log FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

CREATE TABLE IF NOT EXISTS school_deletion_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid REFERENCES schools NOT NULL,
  school_name text NOT NULL,
  requested_by uuid REFERENCES profiles NOT NULL,
  reason text,
  status text DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','completed')),
  reviewed_by uuid REFERENCES profiles,
  reviewed_at timestamptz,
  review_notes text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE school_deletion_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "deletion_requests_policy" ON school_deletion_requests;
CREATE POLICY "deletion_requests_policy" ON school_deletion_requests FOR ALL USING (true);

CREATE TABLE IF NOT EXISTS school_archive (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  school_data jsonb NOT NULL,
  stats_snapshot jsonb,
  deleted_by uuid REFERENCES profiles,
  deletion_request_id uuid REFERENCES school_deletion_requests,
  restore_deadline timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  restored_at timestamptz,
  permanently_deleted_at timestamptz,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE school_archive ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "archive_superadmin" ON school_archive;
CREATE POLICY "archive_superadmin" ON school_archive FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

CREATE TABLE IF NOT EXISTS platform_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_by uuid REFERENCES profiles,
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "platform_settings_superadmin" ON platform_settings;
CREATE POLICY "platform_settings_superadmin" ON platform_settings FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

INSERT INTO platform_settings (key, value) VALUES
  ('max_schools_per_admin', '1'::jsonb),
  ('max_students_per_school', '10000'::jsonb),
  ('max_courses_per_school', '500'::jsonb),
  ('allow_school_registration', 'true'::jsonb),
  ('maintenance_mode', 'false'::jsonb),
  ('maintenance_message', '"Platform is under maintenance. Please check back later."'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Forum topic cover image
ALTER TABLE forum_topics ADD COLUMN IF NOT EXISTS cover_image text;

-- Branding extended columns
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS custom_css text;
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS branding jsonb DEFAULT '{}'::jsonb;

-- ─── Invitations status column ─────────────────────────────────────────────────
-- supabase-schema.sql's invitations table was created without a `status` column,
-- but the API reads/writes it on every request, so invites failed silently.
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending';
ALTER TABLE public.invitations DROP CONSTRAINT IF EXISTS invitations_status_check;
ALTER TABLE public.invitations ADD CONSTRAINT invitations_status_check
  CHECK (status IN ('pending','accepted','expired'));
UPDATE public.invitations SET status = 'accepted' WHERE accepted_at IS NOT NULL AND status = 'pending';
UPDATE public.invitations SET status = 'expired' WHERE accepted_at IS NULL AND expires_at < now() AND status = 'pending';

-- ─── Course resources publish workflow ─────────────────────────────────────────
-- Resources previously showed to students the instant a teacher added them.
-- Add a draft/publish gate matching assignments and quizzes.
ALTER TABLE public.course_resources ADD COLUMN IF NOT EXISTS is_published boolean NOT NULL DEFAULT false;
-- Existing resources were already visible to students; keep that behavior on upgrade.
UPDATE public.course_resources SET is_published = true WHERE is_published IS NOT true;

-- ─── Structured course semester/term dates ─────────────────────────────────────
-- courses.term stays a free-text label (e.g. "Spring 2026" or a custom name),
-- but admins can now also pin down real start/end dates for that term so the
-- transcript can show accurate semester dates regardless of which label was
-- picked (standard or custom).
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS term_start_date date;
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS term_end_date date;

-- Defensive: the "transcripts" table is referenced by the grading routes but
-- had no tracked migration in this repo. Create it if it doesn't already
-- exist so fresh environments don't 500 on every grade/transcript call.
CREATE TABLE IF NOT EXISTS public.transcripts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  school_id      uuid REFERENCES public.schools(id) ON DELETE CASCADE,
  course_id      uuid REFERENCES public.courses(id) ON DELETE SET NULL,
  assignment_id  uuid REFERENCES public.assignments(id) ON DELETE SET NULL,
  submission_id  uuid UNIQUE,
  grade          text,
  feedback       text,
  graded_at      timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.transcripts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on transcripts" ON public.transcripts;
CREATE POLICY "Allow all on transcripts" ON public.transcripts FOR ALL USING (true) WITH CHECK (true);

-- ─── Backfill chat_channels columns ────────────────────────────────────────────
-- On some environments chat_channels was created before this table's full
-- definition existed, so CREATE TABLE IF NOT EXISTS in schema-extended.sql
-- silently skipped it and it's missing columns the app requires (seen as
-- "Could not find the 'type' column of 'chat_channels' in the schema cache").
--
-- Some of those environments also used a legacy column name, channel_type,
-- that is NOT NULL with no default — simply adding a separate `type` column
-- (as an earlier version of this migration did) left channel_type's NOT NULL
-- requirement in place, so every insert (which only sets `type`) then failed
-- with "null value in column channel_type violates not-null constraint".
-- Migrate off channel_type onto `type` wholesale if it's present.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'chat_channels' AND column_name = 'channel_type'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'chat_channels' AND column_name = 'type'
    ) THEN
      ALTER TABLE public.chat_channels ADD COLUMN type text;
    END IF;
    -- The legacy channel_type column used 'dm' where the new `type` column
    -- (and the rest of the app) uses 'direct' — translate it, don't copy it
    -- verbatim, or these rows will fail the type check constraint below.
    UPDATE public.chat_channels SET type = (CASE WHEN channel_type = 'dm' THEN 'direct' ELSE channel_type END) WHERE type IS NULL;
    ALTER TABLE public.chat_channels ALTER COLUMN channel_type DROP NOT NULL;
  END IF;
END $$;

ALTER TABLE public.chat_channels ADD COLUMN IF NOT EXISTS course_id uuid REFERENCES public.courses(id) ON DELETE SET NULL;
ALTER TABLE public.chat_channels ADD COLUMN IF NOT EXISTS type text;
-- Catch any other stray/legacy value (including a still-unmigrated 'dm')
-- that isn't one of the types the rest of this script allows.
UPDATE public.chat_channels SET type = 'direct' WHERE type = 'dm';
UPDATE public.chat_channels SET type = 'private' WHERE type IS NULL;
ALTER TABLE public.chat_channels ALTER COLUMN type SET NOT NULL;
-- (type check constraint is (re)created further down, once, with the full
-- allowed list — recreating it here with a narrower list first would fail
-- on any database that already has rows using a type only the later,
-- wider constraint permits, e.g. 'program'.)
ALTER TABLE public.chat_channels ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.profiles(id);
ALTER TABLE public.chat_channels ADD COLUMN IF NOT EXISTS is_private boolean NOT NULL DEFAULT false;

-- ─── chat_calls table ───────────────────────────────────────────────────────────
-- Referenced by the chat video-call routes but had no tracked migration.
CREATE TABLE IF NOT EXISTS public.chat_calls (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id  uuid NOT NULL REFERENCES public.chat_channels(id) ON DELETE CASCADE,
  jitsi_room  text NOT NULL,
  status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended')),
  started_at  timestamptz NOT NULL DEFAULT now(),
  ended_at    timestamptz
);
ALTER TABLE public.chat_calls ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on chat_calls" ON public.chat_calls;
CREATE POLICY "Allow all on chat_calls" ON public.chat_calls FOR ALL USING (true) WITH CHECK (true);

-- ─── Backfill chat_messages columns ────────────────────────────────────────────
-- Same story as chat_channels: this environment's chat_messages table predates
-- its full column set, so it was missing thread_parent_id (seen as "Could not
-- find the 'thread_parent_id' column of 'chat_messages' in the schema cache").
ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS thread_parent_id uuid REFERENCES public.chat_messages(id) ON DELETE SET NULL;
ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS is_edited boolean NOT NULL DEFAULT false;
ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS edited_at timestamptz;

-- ─── Channel archiving ──────────────────────────────────────────────────────────
ALTER TABLE public.chat_channels ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;

-- ─── In-app ringing calls ───────────────────────────────────────────────────────
-- Who started a call, so other members' clients know to ring (and the
-- initiator's own client knows not to ring itself), plus realtime delivery
-- of new calls / call-ended so the incoming-call UI and the caller's view
-- both update live.
ALTER TABLE public.chat_calls ADD COLUMN IF NOT EXISTS started_by uuid REFERENCES public.profiles(id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'chat_calls'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_calls;
  END IF;
END $$;

-- ─── Chat attachments ───────────────────────────────────────────────────────────
-- Files pass through the API server (multer) so they can be scanned before
-- ever being stored or shown to anyone — see POST /chat/channels/:id/attachments.
ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS attachment_url text;
ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS attachment_name text;
ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS attachment_type text;
ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS attachment_size bigint;

-- ─── Program-wide chat channel ──────────────────────────────────────────────────
-- Enrolling in any course of a program auto-enrolls the student in every other
-- course in that program, and all students enrolled anywhere in the program
-- share one 'program'-typed chat channel. Widen the type check constraint
-- (previously school/course/direct/private) to allow it.
ALTER TABLE public.chat_channels ADD COLUMN IF NOT EXISTS program_id uuid REFERENCES public.programs(id) ON DELETE CASCADE;
-- Defensive catch-all: coerce any row whose type isn't one of the values
-- this constraint is about to allow (e.g. a legacy value this script
-- doesn't otherwise know to translate) so the ADD CONSTRAINT below never
-- fails on unexpected pre-existing data.
UPDATE public.chat_channels SET type = 'private' WHERE type NOT IN ('school','course','direct','private','program','public');
ALTER TABLE public.chat_channels DROP CONSTRAINT IF EXISTS chat_channels_type_check;
ALTER TABLE public.chat_channels ADD CONSTRAINT chat_channels_type_check CHECK (type IN ('school','course','direct','private','program','public'));

-- A program should only ever have one auto-managed chat channel.
CREATE UNIQUE INDEX IF NOT EXISTS chat_channels_one_per_program
  ON public.chat_channels (program_id) WHERE type = 'program';

-- ─── Invitations archived flag ─────────────────────────────────────────────────
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;

-- ─── School AI Agent ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.school_agents (
  school_id   uuid PRIMARY KEY REFERENCES public.schools(id) ON DELETE CASCADE,
  name        text NOT NULL DEFAULT 'Solomon',
  updated_by  uuid REFERENCES public.profiles(id),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.school_agents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "school_agents_all" ON public.school_agents;
CREATE POLICY "school_agents_all" ON public.school_agents FOR ALL USING (true);

CREATE TABLE IF NOT EXISTS public.agent_conversations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role        text NOT NULL CHECK (role IN ('user','assistant')),
  content     text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.agent_conversations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "agent_conversations_own" ON public.agent_conversations;
CREATE POLICY "agent_conversations_own" ON public.agent_conversations FOR ALL USING (
  auth.uid() = user_id
);
CREATE INDEX IF NOT EXISTS agent_conversations_user_idx
  ON public.agent_conversations (school_id, user_id, created_at);

-- ─── Notes (with sharing + sticky-note mode) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  owner_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title       text,
  content     text NOT NULL DEFAULT '',
  color       text NOT NULL DEFAULT '#fef08a',
  is_sticky   boolean NOT NULL DEFAULT false,
  pos_x       integer NOT NULL DEFAULT 80,
  pos_y       integer NOT NULL DEFAULT 80,
  width       integer NOT NULL DEFAULT 240,
  height      integer NOT NULL DEFAULT 220,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "notes_all" ON public.notes;
CREATE POLICY "notes_all" ON public.notes FOR ALL USING (true);
CREATE INDEX IF NOT EXISTS notes_owner_idx ON public.notes (owner_id);

CREATE TABLE IF NOT EXISTS public.note_shares (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id     uuid NOT NULL REFERENCES public.notes(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  permission  text NOT NULL DEFAULT 'view' CHECK (permission IN ('view','edit')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (note_id, user_id)
);
ALTER TABLE public.note_shares ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "note_shares_all" ON public.note_shares;
CREATE POLICY "note_shares_all" ON public.note_shares FOR ALL USING (true);
CREATE INDEX IF NOT EXISTS note_shares_user_idx ON public.note_shares (user_id);

-- ─── Notification delivery (email fallback for offline users) ──────────────────
-- notifications.type/metadata are already written by several routes
-- (messages.ts, chat notifications below) but had no tracked migration.
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS type text;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

-- profiles.email is read by several routes (applications.ts, messages.ts) to
-- send email notifications, but had no tracked migration either.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email text;

-- ─── Custom domains ──────────────────────────────────────────────────────────
-- A school can point their own domain (e.g. school.edu) at their public page
-- instead of using the shared solomonquest.com/schools/:slug URL.
-- Verification is done via a DNS TXT record proving domain ownership before
-- the domain is trusted, same approach used by Vercel/Netlify/etc.
-- Flow: unset -> requested (school admin submitted, waiting on platform
-- super-admin) -> approved (super-admin added it in the hosting provider's
-- domain settings and generated DNS records) -> verified (TXT record found)
-- or failed (verification attempt didn't find the TXT record yet).
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS custom_domain text;
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS custom_domain_status text NOT NULL DEFAULT 'unset';
ALTER TABLE public.schools DROP CONSTRAINT IF EXISTS schools_custom_domain_status_check;
ALTER TABLE public.schools ADD CONSTRAINT schools_custom_domain_status_check
  CHECK (custom_domain_status IN ('unset', 'requested', 'approved', 'verified', 'failed'));
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS custom_domain_token text;
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS custom_domain_requested_at timestamptz;

-- ─── Subscriptions / plans (super-admin managed) ─────────────────────────────
-- No payment processor wired up yet — this is manually managed by the
-- platform super-admin (Super Admin -> Subscriptions) as the sales/billing
-- source of truth until a real payment provider is integrated.
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'free';
ALTER TABLE public.schools DROP CONSTRAINT IF EXISTS schools_plan_check;
ALTER TABLE public.schools ADD CONSTRAINT schools_plan_check CHECK (plan IN ('free', 'basic', 'pro', 'enterprise'));
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS subscription_status text NOT NULL DEFAULT 'active';
ALTER TABLE public.schools DROP CONSTRAINT IF EXISTS schools_subscription_status_check;
ALTER TABLE public.schools ADD CONSTRAINT schools_subscription_status_check
  CHECK (subscription_status IN ('trialing', 'active', 'past_due', 'canceled'));
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS billing_amount_cents integer NOT NULL DEFAULT 0;
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz;

-- ─── Per-school feature flags ────────────────────────────────────────────────
-- Lets the platform super-admin turn specific modules off for a school (e.g.
-- while a plan doesn't include them, or during a support issue) without
-- touching code. Enforced today by the AI agent route; other modules read
-- this the same way as they're extended to respect it.
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS enabled_features jsonb NOT NULL DEFAULT
  '{"chat": true, "video_calls": true, "forum": true, "ai_agent": true, "custom_domain": true, "notes": true}'::jsonb;
CREATE UNIQUE INDEX IF NOT EXISTS schools_custom_domain_unique ON public.schools (LOWER(custom_domain))
  WHERE custom_domain IS NOT NULL;

-- ─── Tuition & student payments ──────────────────────────────────────────────
-- Schools set a tuition amount per course or per program, choosing whether
-- students can pay in full, in installments, or both. No payment processor
-- is wired up yet (details/provider choice pending) -- payments are recorded
-- and can be marked paid manually / via the "simulate payment" test endpoint
-- so the whole flow can be built and tested end-to-end first. Deliberately
-- NOT enforced anywhere yet (e.g. doesn't block enrollment or applications) --
-- that gate gets turned on later once real payment processing is wired up.
CREATE TABLE IF NOT EXISTS public.tuition_plans (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id           uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  course_id           uuid REFERENCES public.courses(id) ON DELETE CASCADE,
  program_id          uuid REFERENCES public.programs(id) ON DELETE CASCADE,
  amount_cents        integer NOT NULL CHECK (amount_cents >= 0),
  currency            text NOT NULL DEFAULT 'usd',
  allow_full_payment  boolean NOT NULL DEFAULT true,
  allow_installments  boolean NOT NULL DEFAULT false,
  installment_count   integer NOT NULL DEFAULT 1 CHECK (installment_count >= 1),
  created_by          uuid REFERENCES public.profiles(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (course_id IS NOT NULL AND program_id IS NULL) OR
    (course_id IS NULL AND program_id IS NOT NULL)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS tuition_plans_one_per_course ON public.tuition_plans (course_id) WHERE course_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS tuition_plans_one_per_program ON public.tuition_plans (program_id) WHERE program_id IS NOT NULL;
ALTER TABLE public.tuition_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tuition_plans_all" ON public.tuition_plans;
CREATE POLICY "tuition_plans_all" ON public.tuition_plans FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.tuition_payments (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id          uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id         uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tuition_plan_id    uuid NOT NULL REFERENCES public.tuition_plans(id) ON DELETE CASCADE,
  course_id          uuid REFERENCES public.courses(id) ON DELETE SET NULL,
  program_id         uuid REFERENCES public.programs(id) ON DELETE SET NULL,
  amount_cents       integer NOT NULL,
  currency           text NOT NULL DEFAULT 'usd',
  payment_method     text NOT NULL CHECK (payment_method IN ('full', 'installments')),
  installment_count  integer NOT NULL DEFAULT 1,
  status             text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'partial', 'paid', 'failed')),
  provider           text NOT NULL DEFAULT 'manual',
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.tuition_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tuition_payments_all" ON public.tuition_payments;
CREATE POLICY "tuition_payments_all" ON public.tuition_payments FOR ALL USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS tuition_payments_student_idx ON public.tuition_payments (student_id);
CREATE INDEX IF NOT EXISTS tuition_payments_school_idx ON public.tuition_payments (school_id);

CREATE TABLE IF NOT EXISTS public.tuition_installments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id          uuid NOT NULL REFERENCES public.tuition_payments(id) ON DELETE CASCADE,
  installment_number  integer NOT NULL,
  amount_cents        integer NOT NULL,
  due_date            date NOT NULL,
  status              text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed')),
  paid_at             timestamptz,
  UNIQUE (payment_id, installment_number)
);
ALTER TABLE public.tuition_installments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tuition_installments_all" ON public.tuition_installments;
CREATE POLICY "tuition_installments_all" ON public.tuition_installments FOR ALL USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS tuition_installments_payment_idx ON public.tuition_installments (payment_id);

-- ─── Invite a transferring student straight into a program ─────────────────────
-- When inviting an existing (non-applicant) student, an admin can pick a
-- program up front so accepting the invite auto-enrolls them in every
-- course in that program, same as the normal program cascade-enroll.
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS program_id uuid REFERENCES public.programs(id) ON DELETE SET NULL;

-- ─── Student detail view (admin/teacher) ─────────────────────────────────────
-- profiles had no created_at, needed to show "enrolled since" on the new
-- expandable student detail card. Existing rows backfill to now() since the
-- real join date wasn't tracked before -- not perfectly accurate historically,
-- but every row going forward is correct.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

-- course_enrollments had no timestamp at all, so "enrolled since" on the
-- student detail card was falling back to the account's created_at (when
-- they signed up) rather than when they actually enrolled in a course --
-- wrong for e.g. a student invited to a program well after their account
-- existed, or enrolled in a second course much later. Existing rows
-- backfill to now() since the real enrollment date wasn't tracked before;
-- every enrollment going forward is accurate.
ALTER TABLE public.course_enrollments ADD COLUMN IF NOT EXISTS enrolled_at timestamptz NOT NULL DEFAULT now();

-- ─── Chat read receipts ───────────────────────────────────────────────────────
-- Per-member "I've read up to here" marker so a DM can show a double-check
-- (seen) indicator once the other person has read a message, and so the
-- unread badge introduced earlier can eventually persist across reloads.
ALTER TABLE public.chat_channel_members ADD COLUMN IF NOT EXISTS last_read_at timestamptz;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'chat_channel_members'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_channel_members;
  END IF;
END $$;

-- ─── Chat message reactions ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.chat_message_reactions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id  uuid NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  emoji       text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id, emoji)
);
ALTER TABLE public.chat_message_reactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "chat_message_reactions_all" ON public.chat_message_reactions;
CREATE POLICY "chat_message_reactions_all" ON public.chat_message_reactions FOR ALL USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS chat_message_reactions_message_idx ON public.chat_message_reactions (message_id);
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'chat_message_reactions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_message_reactions;
  END IF;
END $$;

-- ─── Activity log columns (teacher activity ranking + login history) ──────────
-- POST /activity-log (lib/activityLogger.ts, called on every login/logout from
-- the client, and by the teacher-activity ranking below) has always written
-- `performed_by` and `metadata`, but platform_audit_log was only ever defined
-- with `actor_id` and `details` — every one of those inserts, including every
-- login/logout event, has been silently failing with a schema-cache error the
-- client's fire-and-forget logActivity() swallows. Add the columns the code
-- actually uses instead of rewriting every call site.
ALTER TABLE public.platform_audit_log ADD COLUMN IF NOT EXISTS performed_by uuid REFERENCES public.profiles(id);
ALTER TABLE public.platform_audit_log ADD COLUMN IF NOT EXISTS metadata jsonb;
CREATE INDEX IF NOT EXISTS platform_audit_log_performed_by_idx ON public.platform_audit_log (performed_by, action, created_at);

-- ─── Chat message edit history ─────────────────────────────────────────────────
-- Messages can be edited after sending, but the previous content is kept —
-- one row per edit, storing what the content WAS right before that edit.
CREATE TABLE IF NOT EXISTS public.chat_message_edits (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id       uuid NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  previous_content text NOT NULL,
  edited_by        uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  edited_at        timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.chat_message_edits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "chat_message_edits_all" ON public.chat_message_edits;
CREATE POLICY "chat_message_edits_all" ON public.chat_message_edits FOR ALL USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS chat_message_edits_message_idx ON public.chat_message_edits (message_id, edited_at);

-- ─── Test Mode ──────────────────────────────────────────────────────────────
-- An admin can grant a specific user (e.g. someone on the team doing pre-
-- launch testing) the ability to self-switch into any teacher/staff/student
-- account in the school without needing an admin to do it for them each
-- time — reuses the same "View As" magic-link impersonation flow admins get,
-- just gated by this flag instead of by role.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS test_mode_enabled boolean NOT NULL DEFAULT false;

-- Force PostgREST to pick up the columns above immediately instead of
-- waiting for its schema cache to refresh on its own.
NOTIFY pgrst, 'reload schema';
