-- ===========================================================================
-- Mandantentrennung auf Datenbankebene
--
-- 1. Kontext-Funktionen lesen transaktionslokale Einstellungen, die der
--    Anwendungscode zu Beginn jeder Transaktion setzt (siehe src/server/db/tenant.ts).
-- 2. Row-Level Security (FORCE) auf allen Tabellen. Ohne gesetzten Kontext
--    liefern unternehmensbezogene Tabellen KEINE Zeilen ("fail closed").
-- 3. Zusammengesetzte Fremdschlüssel verhindern Verweise über Mandantengrenzen.
-- 4. Audit-Logs und Antragsverlauf sind nur anhängbar (append-only).
-- ===========================================================================

CREATE SCHEMA IF NOT EXISTS app;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app.company_id() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('app.company_id', true), '')::uuid $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app.user_id() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('app.user_id', true), '')::uuid $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app.is_system() RETURNS boolean
  LANGUAGE sql STABLE
  AS $$ SELECT coalesce(current_setting('app.system', true), '') = 'on' $$;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Unternehmensbezogene Tabellen: Zugriff nur im passenden Mandantenkontext
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'locations', 'teams', 'roles', 'employees', 'memberships', 'invitations',
    'work_schedules', 'company_holidays', 'leave_entitlements', 'absence_types',
    'leave_requests', 'leave_request_days', 'leave_request_events', 'notifications'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (company_id = (SELECT app.company_id()) OR (SELECT app.is_system())) WITH CHECK (company_id = (SELECT app.company_id()) OR (SELECT app.is_system()))',
      t
    );
  END LOOP;
END $$;
--> statement-breakpoint

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE companies FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON companies
  USING (id = (SELECT app.company_id()) OR (SELECT app.is_system()))
  WITH CHECK (id = (SELECT app.company_id()) OR (SELECT app.is_system()));
--> statement-breakpoint

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON audit_logs
  USING (company_id = (SELECT app.company_id()) OR (SELECT app.is_system()))
  WITH CHECK (company_id = (SELECT app.company_id()) OR (SELECT app.is_system()));
--> statement-breakpoint

-- Benutzer: im Mandantenkontext nur Mitglieder des aktuellen Unternehmens lesbar,
-- ändern darf man ausschließlich das eigene Konto.
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE users FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY users_select ON users FOR SELECT
  USING (
    (SELECT app.is_system())
    OR id = (SELECT app.user_id())
    OR EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.user_id = users.id AND m.company_id = (SELECT app.company_id())
    )
  );
--> statement-breakpoint
CREATE POLICY users_insert ON users FOR INSERT
  WITH CHECK ((SELECT app.is_system()));
--> statement-breakpoint
CREATE POLICY users_update ON users FOR UPDATE
  USING ((SELECT app.is_system()) OR id = (SELECT app.user_id()))
  WITH CHECK ((SELECT app.is_system()) OR id = (SELECT app.user_id()));
--> statement-breakpoint
CREATE POLICY users_delete ON users FOR DELETE
  USING ((SELECT app.is_system()));
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Plattformtabellen: ausschließlich im System-Kontext
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'sessions', 'password_reset_tokens', 'rate_limits', 'platform_admins',
    'contact_requests', 'contact_request_notes', 'email_deliveries'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY system_only ON %I USING ((SELECT app.is_system())) WITH CHECK ((SELECT app.is_system()))',
      t
    );
  END LOOP;
END $$;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Zusammengesetzte Fremdschlüssel: Verweise müssen im selben Unternehmen liegen
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX locations_company_id_id_key ON locations (company_id, id);
--> statement-breakpoint
CREATE UNIQUE INDEX teams_company_id_id_key ON teams (company_id, id);
--> statement-breakpoint
CREATE UNIQUE INDEX employees_company_id_id_key ON employees (company_id, id);
--> statement-breakpoint
CREATE UNIQUE INDEX roles_company_id_id_key ON roles (company_id, id);
--> statement-breakpoint
CREATE UNIQUE INDEX absence_types_company_id_id_key ON absence_types (company_id, id);
--> statement-breakpoint
CREATE UNIQUE INDEX leave_requests_company_id_id_key ON leave_requests (company_id, id);
--> statement-breakpoint
ALTER TABLE employees ADD CONSTRAINT employees_team_same_company
  FOREIGN KEY (company_id, team_id) REFERENCES teams (company_id, id) ON DELETE SET NULL (team_id);
--> statement-breakpoint
ALTER TABLE employees ADD CONSTRAINT employees_location_same_company
  FOREIGN KEY (company_id, location_id) REFERENCES locations (company_id, id) ON DELETE SET NULL (location_id);
--> statement-breakpoint
ALTER TABLE employees ADD CONSTRAINT employees_manager_same_company
  FOREIGN KEY (company_id, manager_id) REFERENCES employees (company_id, id) ON DELETE SET NULL (manager_id);
--> statement-breakpoint
ALTER TABLE teams ADD CONSTRAINT teams_location_same_company
  FOREIGN KEY (company_id, location_id) REFERENCES locations (company_id, id) ON DELETE SET NULL (location_id);
--> statement-breakpoint
ALTER TABLE teams ADD CONSTRAINT teams_lead_same_company
  FOREIGN KEY (company_id, lead_employee_id) REFERENCES employees (company_id, id) ON DELETE SET NULL (lead_employee_id);
--> statement-breakpoint
ALTER TABLE memberships ADD CONSTRAINT memberships_employee_same_company
  FOREIGN KEY (company_id, employee_id) REFERENCES employees (company_id, id);
--> statement-breakpoint
ALTER TABLE memberships ADD CONSTRAINT memberships_role_same_company
  FOREIGN KEY (company_id, role_id) REFERENCES roles (company_id, id);
--> statement-breakpoint
ALTER TABLE invitations ADD CONSTRAINT invitations_employee_same_company
  FOREIGN KEY (company_id, employee_id) REFERENCES employees (company_id, id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE invitations ADD CONSTRAINT invitations_role_same_company
  FOREIGN KEY (company_id, role_id) REFERENCES roles (company_id, id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE work_schedules ADD CONSTRAINT work_schedules_employee_same_company
  FOREIGN KEY (company_id, employee_id) REFERENCES employees (company_id, id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE leave_entitlements ADD CONSTRAINT leave_entitlements_employee_same_company
  FOREIGN KEY (company_id, employee_id) REFERENCES employees (company_id, id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE company_holidays ADD CONSTRAINT company_holidays_location_same_company
  FOREIGN KEY (company_id, location_id) REFERENCES locations (company_id, id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE leave_requests ADD CONSTRAINT leave_requests_employee_same_company
  FOREIGN KEY (company_id, employee_id) REFERENCES employees (company_id, id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE leave_requests ADD CONSTRAINT leave_requests_type_same_company
  FOREIGN KEY (company_id, absence_type_id) REFERENCES absence_types (company_id, id);
--> statement-breakpoint
ALTER TABLE leave_request_days ADD CONSTRAINT leave_request_days_request_same_company
  FOREIGN KEY (company_id, request_id) REFERENCES leave_requests (company_id, id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE leave_request_events ADD CONSTRAINT leave_request_events_request_same_company
  FOREIGN KEY (company_id, request_id) REFERENCES leave_requests (company_id, id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE leave_requests ADD CONSTRAINT leave_requests_date_order CHECK (end_date >= start_date);
--> statement-breakpoint
ALTER TABLE work_schedules ADD CONSTRAINT work_schedules_weekdays_range CHECK (weekdays BETWEEN 1 AND 127);
--> statement-breakpoint
ALTER TABLE companies ADD CONSTRAINT companies_work_week_range CHECK (default_work_week BETWEEN 1 AND 127);
--> statement-breakpoint
ALTER TABLE users ADD CONSTRAINT users_email_lowercase CHECK (email = lower(email));
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Append-only: Audit-Logs und Antragsverlauf
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.prevent_mutation() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  IF TG_OP = 'DELETE' AND coalesce(current_setting('app.audit_purge', true), '') = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION '% ist nur anhängbar (append-only)', TG_TABLE_NAME;
END $$;
--> statement-breakpoint
CREATE TRIGGER audit_logs_append_only
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION app.prevent_mutation();
--> statement-breakpoint
CREATE TRIGGER leave_request_events_no_update
  BEFORE UPDATE ON leave_request_events
  FOR EACH ROW EXECUTE FUNCTION app.prevent_mutation();
--> statement-breakpoint

-- Löscht Audit-Einträge, die älter als die Aufbewahrungsfrist sind.
-- Läuft mit den Rechten des Owners; die Anwendungsrolle darf audit_logs selbst nicht löschen.
CREATE OR REPLACE FUNCTION app.purge_audit_logs(retention_days integer) RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
DECLARE
  deleted integer;
  previous_system text := coalesce(current_setting('app.system', true), '');
BEGIN
  IF retention_days IS NULL OR retention_days < 90 THEN
    RAISE EXCEPTION 'Aufbewahrungsfrist muss mindestens 90 Tage betragen';
  END IF;
  PERFORM set_config('app.system', 'on', true);
  PERFORM set_config('app.audit_purge', 'on', true);
  DELETE FROM audit_logs WHERE created_at < now() - make_interval(days => retention_days);
  GET DIAGNOSTICS deleted = ROW_COUNT;
  PERFORM set_config('app.audit_purge', '', true);
  PERFORM set_config('app.system', previous_system, true);
  RETURN deleted;
END $$;
