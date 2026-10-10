ALTER TABLE "absence_types" ADD COLUMN "is_sensitive" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Bestehende Standardart "Arbeitsunfähigkeit" als sensibel markieren (Gesundheitsdaten, Art. 9 DSGVO).
UPDATE "absence_types" SET "is_sensitive" = true, "employee_can_request" = false, "requires_approval" = false WHERE "key" = 'sick';
--> statement-breakpoint
-- Sensible Arten werden ausschließlich von der Verwaltung erfasst.
ALTER TABLE "absence_types" ADD CONSTRAINT "absence_types_sensitive_recorded_only"
  CHECK (NOT "is_sensitive" OR (NOT "employee_can_request" AND NOT "requires_approval"));
