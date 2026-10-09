-- Wird nur beim ersten Start des Containers ausgeführt.
-- Die Anwendung verbindet sich mit einer Rolle OHNE Superuser- und BYPASSRLS-Rechte,
-- damit Row-Level Security tatsächlich greift. Migrationen laufen über die Owner-Rolle.
CREATE ROLE pflegewerk_app LOGIN PASSWORD 'pflegewerk_app_dev'
  NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;

CREATE DATABASE pflegewerk_test OWNER pflegewerk_owner;
