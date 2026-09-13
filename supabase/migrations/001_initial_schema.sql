-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- Custom ENUM types
CREATE TYPE user_role AS ENUM ('citizen', 'authority', 'admin');
CREATE TYPE issue_severity AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE issue_status AS ENUM ('potential', 'verified', 'in_progress', 'resolved', 'rejected');
CREATE TYPE verification_action AS ENUM ('verified', 'rejected', 'merged');
CREATE TYPE source_type AS ENUM ('citizen', 'weather', 'osm', 'public_data', 'other');
CREATE TYPE source_run_status AS ENUM ('pending', 'running', 'completed', 'failed');

-- 1. Departments Table
CREATE TABLE departments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    contact JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Profiles Table (Linked to auth.users)
CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    role user_role NOT NULL DEFAULT 'citizen',
    name TEXT,
    email TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Data Sources Table
CREATE TABLE data_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    type source_type NOT NULL DEFAULT 'other',
    url TEXT,
    reliability_score NUMERIC(3, 2) NOT NULL DEFAULT 1.00 CHECK (reliability_score >= 0.00 AND reliability_score <= 1.00),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Source Runs Table
CREATE TABLE source_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id UUID NOT NULL REFERENCES data_sources(id) ON DELETE CASCADE,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at TIMESTAMPTZ,
    status source_run_status NOT NULL DEFAULT 'pending',
    records_fetched INTEGER NOT NULL DEFAULT 0 CHECK (records_fetched >= 0)
);

-- 5. Observations Table
CREATE TABLE observations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source TEXT NOT NULL,
    source_record_id TEXT,
    category TEXT NOT NULL,
    description TEXT,
    lat DOUBLE PRECISION NOT NULL CHECK (lat >= -90.0 AND lat <= 90.0),
    lng DOUBLE PRECISION NOT NULL CHECK (lng >= -180.0 AND lng <= 180.0),
    timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
    severity issue_severity NOT NULL DEFAULT 'medium',
    confidence NUMERIC(3, 2) NOT NULL DEFAULT 1.00 CHECK (confidence >= 0.00 AND confidence <= 1.00),
    evidence JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Issues Table
CREATE TABLE issues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category TEXT NOT NULL,
    description TEXT,
    lat DOUBLE PRECISION NOT NULL CHECK (lat >= -90.0 AND lat <= 90.0),
    lng DOUBLE PRECISION NOT NULL CHECK (lng >= -180.0 AND lng <= 180.0),
    severity issue_severity NOT NULL DEFAULT 'medium',
    confidence NUMERIC(3, 2) NOT NULL DEFAULT 0.00 CHECK (confidence >= 0.00 AND confidence <= 1.00),
    status issue_status NOT NULL DEFAULT 'potential',
    department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. Issue Observations Table (Many-to-many junction table)
CREATE TABLE issue_observations (
    issue_id UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    observation_id UUID NOT NULL REFERENCES observations(id) ON DELETE CASCADE,
    PRIMARY KEY (issue_id, observation_id)
);

-- 8. Verification Events Table
CREATE TABLE verification_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    issue_id UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    actor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    action verification_action NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 9. Issue History Table
CREATE TABLE issue_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    issue_id UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    status_change issue_status NOT NULL,
    actor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 10. Notifications Table
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    issue_id UUID REFERENCES issues(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 11. Road Segments Table
CREATE TABLE road_segments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    osm_id TEXT,
    geometry GEOMETRY(Geometry, 4326),
    condition TEXT,
    last_maintenance TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Helper function to check current user role
CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS user_role AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- Trigger to prevent self-privilege escalation on profiles.role
CREATE OR REPLACE FUNCTION public.prevent_profile_role_escalation()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role AND public.get_current_user_role() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Users cannot modify their own role';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER check_profile_role_update
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_profile_role_escalation();

-- Enable Row Level Security (RLS) on all tables
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE source_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE issue_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE verification_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE issue_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE road_segments ENABLE ROW LEVEL SECURITY;

-- ==================== RLS POLICIES ====================

-- 1. Departments Policies
CREATE POLICY "Departments are viewable by all authenticated users and anon"
    ON departments FOR SELECT
    USING (true);

CREATE POLICY "Departments managed by admin only"
    ON departments FOR ALL
    USING (public.get_current_user_role() = 'admin');

-- 2. Profiles Policies
CREATE POLICY "Profiles viewable by authenticated users"
    ON profiles FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Users can insert their own profile"
    ON profiles FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update their own profile basic info"
    ON profiles FOR UPDATE
    TO authenticated
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- 3. Data Sources Policies
CREATE POLICY "Data sources viewable by authenticated users"
    ON data_sources FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Data sources managed by admin only"
    ON data_sources FOR ALL
    USING (public.get_current_user_role() = 'admin');

-- 4. Source Runs Policies
CREATE POLICY "Source runs viewable by authority and admin"
    ON source_runs FOR SELECT
    TO authenticated
    USING (public.get_current_user_role() IN ('authority', 'admin'));

CREATE POLICY "Source runs managed by admin only"
    ON source_runs FOR ALL
    USING (public.get_current_user_role() = 'admin');

-- 5. Observations Policies
CREATE POLICY "Observations viewable by authenticated users and anon"
    ON observations FOR SELECT
    USING (true);

CREATE POLICY "Citizens and service role can insert observations"
    ON observations FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Observations modified by authority and admin only"
    ON observations FOR UPDATE
    USING (public.get_current_user_role() IN ('authority', 'admin'));

-- 6. Issues Policies
CREATE POLICY "Issues viewable by all users"
    ON issues FOR SELECT
    USING (true);

CREATE POLICY "Issues inserted by system or authority/admin"
    ON issues FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Authority and Admin can update authority fields on issues"
    ON issues FOR UPDATE
    USING (public.get_current_user_role() IN ('authority', 'admin'))
    WITH CHECK (public.get_current_user_role() IN ('authority', 'admin'));

-- Citizens explicitly cannot update or delete issues (enforced by lack of citizen UPDATE/DELETE policies)

-- 7. Issue Observations Policies
CREATE POLICY "Issue observations viewable by all users"
    ON issue_observations FOR SELECT
    USING (true);

CREATE POLICY "Issue observations managed by authority and admin"
    ON issue_observations FOR ALL
    USING (public.get_current_user_role() IN ('authority', 'admin'));

-- 8. Verification Events Policies
CREATE POLICY "Verification events viewable by authenticated users"
    ON verification_events FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Verification events created by authority and admin only"
    ON verification_events FOR INSERT
    TO authenticated
    WITH CHECK (public.get_current_user_role() IN ('authority', 'admin'));

-- 9. Issue History Policies
CREATE POLICY "Issue history viewable by authenticated users"
    ON issue_history FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Issue history created by authority and admin only"
    ON issue_history FOR INSERT
    TO authenticated
    WITH CHECK (public.get_current_user_role() IN ('authority', 'admin'));

-- 10. Notifications Policies
CREATE POLICY "Users can view their own notifications"
    ON notifications FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own notification read status"
    ON notifications FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- 11. Road Segments Policies
CREATE POLICY "Road segments viewable by all users"
    ON road_segments FOR SELECT
    USING (true);

CREATE POLICY "Road segments managed by authority and admin"
    ON road_segments FOR ALL
    USING (public.get_current_user_role() IN ('authority', 'admin'));
