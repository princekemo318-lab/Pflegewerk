/**
 * Datenmodell der Plattform.
 *
 * Grundregel der Mandantentrennung: Jede unternehmensbezogene Tabelle besitzt eine
 * NOT NULL `company_id`. Zusätzlich zu den expliziten Filtern im Anwendungscode
 * erzwingt PostgreSQL Row-Level Security (siehe drizzle/0001_rls.sql).
 *
 * Datumswerte ohne Uhrzeit (Urlaubstage, Feiertage) werden als `date` gespeichert und
 * im Code als ISO-String "YYYY-MM-DD" behandelt, um Zeitzonenfehler auszuschließen.
 */
import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();
const isoDate = (name: string) => date(name, { mode: "string" });
const days = (name: string) =>
  numeric(name, { precision: 5, scale: 1, mode: "number" });

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const companyStatus = pgEnum("company_status", ["active", "suspended"]);
export const membershipStatus = pgEnum("membership_status", [
  "active",
  "deactivated",
]);
export const employeeStatus = pgEnum("employee_status", ["active", "inactive"]);
export const leaveStatus = pgEnum("leave_status", [
  "submitted",
  "approved",
  "rejected",
  "withdrawn",
  "cancelled",
]);
export const leaveEventType = pgEnum("leave_event_type", [
  "submitted",
  "recorded",
  "approved",
  "rejected",
  "withdrawn",
  "cancelled",
]);
export const calendarScope = pgEnum("calendar_scope", [
  "none",
  "team",
  "company",
]);
export const contactStatus = pgEnum("contact_status", [
  "new",
  "in_progress",
  "contacted",
  "qualified",
  "won",
  "rejected",
]);
export const contactNoteKind = pgEnum("contact_note_kind", [
  "note",
  "call",
  "email",
  "meeting",
  "status_change",
]);
export const emailStatus = pgEnum("email_status", [
  "sent",
  "failed",
  "not_configured",
]);

// ---------------------------------------------------------------------------
// Plattformweite Tabellen (nur im System-Kontext zugänglich)
// ---------------------------------------------------------------------------

export const users = pgTable(
  "users",
  {
    id: id(),
    /** Immer in Kleinbuchstaben gespeichert. */
    email: text("email").notNull(),
    name: text("name").notNull(),
    /** Argon2id-Hash. NULL, solange noch kein Passwort gesetzt wurde. */
    passwordHash: text("password_hash"),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    /** Plattformweite Sperre eines Kontos. */
    disabledAt: timestamp("disabled_at", { withTimezone: true }),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("users_email_key").on(t.email)],
);

export const sessions = pgTable(
  "sessions",
  {
    /** SHA-256-Hash des Session-Tokens. Das Token selbst wird nie gespeichert. */
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    activeCompanyId: uuid("active_company_id"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    /** SHA-256-Hash des Tokens. */
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("password_reset_tokens_user_idx").on(t.userId)],
);

export const rateLimits = pgTable("rate_limits", {
  /** Enthält nur gehashte Bezeichner (z. B. Hash der IP-Adresse). */
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
});

export const platformAdmins = pgTable("platform_admins", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: createdAt(),
});

export const contactRequests = pgTable(
  "contact_requests",
  {
    id: id(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    companyName: text("company_name").notNull(),
    employeeRange: text("employee_range"),
    locationCount: text("location_count"),
    interests: text("interests")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    message: text("message"),
    /** Zeitpunkt, zu dem die Datenschutzhinweise bestätigt wurden. */
    privacyAcceptedAt: timestamp("privacy_accepted_at", {
      withTimezone: true,
    }).notNull(),
    privacyNoticeVersion: text("privacy_notice_version").notNull(),
    status: contactStatus("status").notNull().default("new"),
    assignedToUserId: uuid("assigned_to_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    companyId: uuid("company_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("contact_requests_status_idx").on(t.status, t.createdAt),
  ],
);

export const contactRequestNotes = pgTable(
  "contact_request_notes",
  {
    id: id(),
    contactRequestId: uuid("contact_request_id")
      .notNull()
      .references(() => contactRequests.id, { onDelete: "cascade" }),
    authorUserId: uuid("author_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    kind: contactNoteKind("kind").notNull().default("note"),
    body: text("body").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("contact_request_notes_request_idx").on(t.contactRequestId)],
);

/**
 * Protokoll des E-Mail-Versands. Der Nachrichtentext wird bewusst NICHT gespeichert,
 * weil er Einladungs- oder Reset-Links enthalten kann.
 */
export const emailDeliveries = pgTable(
  "email_deliveries",
  {
    id: id(),
    companyId: uuid("company_id"),
    toEmail: text("to_email").notNull(),
    template: text("template").notNull(),
    subject: text("subject").notNull(),
    status: emailStatus("status").notNull(),
    error: text("error"),
    createdAt: createdAt(),
  },
  (t) => [index("email_deliveries_created_idx").on(t.createdAt)],
);

// ---------------------------------------------------------------------------
// Mandanten
// ---------------------------------------------------------------------------

export const companies = pgTable(
  "companies",
  {
    id: id(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    status: companyStatus("status").notNull().default("active"),
    suspendedAt: timestamp("suspended_at", { withTimezone: true }),
    suspendedReason: text("suspended_reason"),
    /** Bundesland-Kürzel (z. B. "NW") als Standard für Mitarbeiter ohne Standort. */
    defaultState: text("default_state").notNull().default("NW"),
    /** Wochenarbeitstage als Bitmaske: Mo=1, Di=2, Mi=4, Do=8, Fr=16, Sa=32, So=64. */
    defaultWorkWeek: smallint("default_work_week").notNull().default(31),
    defaultAnnualLeaveDays: days("default_annual_leave_days")
      .notNull()
      .default(30),
    /** Welche Abwesenheiten normale Mitarbeiter im Kalender sehen. */
    employeeCalendarScope: calendarScope("employee_calendar_scope")
      .notNull()
      .default("team"),
    allowNegativeBalance: boolean("allow_negative_balance")
      .notNull()
      .default(false),
    reminderAfterDays: smallint("reminder_after_days").notNull().default(3),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("companies_slug_key").on(t.slug)],
);

export const locations = pgTable(
  "locations",
  {
    id: id(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    city: text("city"),
    /** Bundesland-Kürzel für die Feiertagsberechnung. */
    state: text("state").notNull(),
    /** Aktivierte regionale Feiertage, die nicht landesweit gelten (z. B. "BY_ASSUMPTION"). */
    optionalHolidays: text("optional_holidays")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("locations_company_idx").on(t.companyId)],
);

export const teams = pgTable(
  "teams",
  {
    id: id(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    locationId: uuid("location_id").references(() => locations.id, {
      onDelete: "set null",
    }),
    leadEmployeeId: uuid("lead_employee_id").references(
      (): AnyPgColumn => employees.id,
      { onDelete: "set null" },
    ),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("teams_company_idx").on(t.companyId)],
);

export const roles = pgTable(
  "roles",
  {
    id: id(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    permissions: text("permissions")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    /** Inhaber-Rolle: besitzt alle Rechte, kann nicht gelöscht werden. */
    isOwner: boolean("is_owner").notNull().default(false),
    /** Vorauswahl für neue Einladungen. */
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("roles_company_name_key").on(t.companyId, t.name),
    index("roles_company_idx").on(t.companyId),
  ],
);

export const employees = pgTable(
  "employees",
  {
    id: id(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    email: text("email"),
    personnelNumber: text("personnel_number"),
    jobTitle: text("job_title"),
    teamId: uuid("team_id").references(() => teams.id, {
      onDelete: "set null",
    }),
    locationId: uuid("location_id").references(() => locations.id, {
      onDelete: "set null",
    }),
    managerId: uuid("manager_id").references((): AnyPgColumn => employees.id, {
      onDelete: "set null",
    }),
    status: employeeStatus("status").notNull().default("active"),
    entryDate: isoDate("entry_date"),
    exitDate: isoDate("exit_date"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("employees_company_idx").on(t.companyId, t.status),
    index("employees_team_idx").on(t.teamId),
    index("employees_manager_idx").on(t.managerId),
  ],
);

export const memberships = pgTable(
  "memberships",
  {
    id: id(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "restrict" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "restrict" }),
    status: membershipStatus("status").notNull().default("active"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("memberships_company_user_key").on(t.companyId, t.userId),
    uniqueIndex("memberships_employee_key").on(t.employeeId),
    index("memberships_user_idx").on(t.userId),
    index("memberships_role_idx").on(t.roleId),
  ],
);

export const invitations = pgTable(
  "invitations",
  {
    id: id(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    /** SHA-256-Hash des Einladungstokens. */
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    invitedByUserId: uuid("invited_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("invitations_token_key").on(t.tokenHash),
    index("invitations_company_idx").on(t.companyId),
    index("invitations_employee_idx").on(t.employeeId),
  ],
);

// ---------------------------------------------------------------------------
// Arbeitszeit, Feiertage, Urlaubsanspruch
// ---------------------------------------------------------------------------

export const workSchedules = pgTable(
  "work_schedules",
  {
    id: id(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    validFrom: isoDate("valid_from").notNull(),
    /** Bitmaske der Arbeitstage (siehe companies.defaultWorkWeek). */
    weekdays: smallint("weekdays").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("work_schedules_employee_from_key").on(
      t.employeeId,
      t.validFrom,
    ),
    index("work_schedules_company_idx").on(t.companyId),
  ],
);

export const companyHolidays = pgTable(
  "company_holidays",
  {
    id: id(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    /** NULL = gilt für alle Standorte. */
    locationId: uuid("location_id").references(() => locations.id, {
      onDelete: "cascade",
    }),
    date: isoDate("date").notNull(),
    name: text("name").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("company_holidays_company_date_idx").on(t.companyId, t.date)],
);

export const leaveEntitlements = pgTable(
  "leave_entitlements",
  {
    id: id(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    year: integer("year").notNull(),
    days: days("days").notNull(),
    carryoverDays: days("carryover_days").notNull().default(0),
    note: text("note"),
    updatedByUserId: uuid("updated_by_user_id"),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("leave_entitlements_employee_year_key").on(
      t.employeeId,
      t.year,
    ),
    index("leave_entitlements_company_idx").on(t.companyId, t.year),
  ],
);

// ---------------------------------------------------------------------------
// Abwesenheiten und Urlaubsanträge
// ---------------------------------------------------------------------------

export const absenceTypes = pgTable(
  "absence_types",
  {
    id: id(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    /** Stabiler Schlüssel der Standardtypen (z. B. "vacation"), NULL bei eigenen Typen. */
    key: text("key"),
    name: text("name").notNull(),
    /** Farbe aus der Design-Palette (z. B. "teal"). */
    color: text("color").notNull().default("teal"),
    deductsLeave: boolean("deducts_leave").notNull().default(false),
    requiresApproval: boolean("requires_approval").notNull().default(true),
    /** Darf von Mitarbeitern selbst beantragt werden. */
    employeeCanRequest: boolean("employee_can_request")
      .notNull()
      .default(true),
    /**
     * Sensible Art (z. B. Gesundheitsdaten): Die Art sehen nur die betroffene Person und
     * Personen mit leave.view_all bzw. leave.manage. Wird nur von der Verwaltung erfasst.
     */
    isSensitive: boolean("is_sensitive").notNull().default(false),
    sortOrder: smallint("sort_order").notNull().default(0),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index("absence_types_company_idx").on(t.companyId),
    uniqueIndex("absence_types_company_key_key").on(t.companyId, t.key),
  ],
);

export const leaveRequests = pgTable(
  "leave_requests",
  {
    id: id(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    absenceTypeId: uuid("absence_type_id")
      .notNull()
      .references(() => absenceTypes.id, { onDelete: "restrict" }),
    startDate: isoDate("start_date").notNull(),
    endDate: isoDate("end_date").notNull(),
    status: leaveStatus("status").notNull().default("submitted"),
    /** Snapshot der berechneten Arbeitstage zum Zeitpunkt der Einreichung. */
    workingDays: days("working_days").notNull(),
    employeeNote: text("employee_note"),
    decisionNote: text("decision_note"),
    createdByUserId: uuid("created_by_user_id").notNull(),
    decidedByUserId: uuid("decided_by_user_id"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("leave_requests_company_status_idx").on(t.companyId, t.status),
    index("leave_requests_employee_idx").on(t.employeeId, t.startDate),
    index("leave_requests_company_range_idx").on(
      t.companyId,
      t.startDate,
      t.endDate,
    ),
  ],
);

/**
 * Einzelne gezählte Arbeitstage eines aktiven (eingereichten oder genehmigten) Antrags.
 * Der eindeutige Index (employee_id, date) verhindert doppelte Belegung auf Datenbankebene.
 * Bei Ablehnung, Rückzug oder Stornierung werden die Tage entfernt.
 */
export const leaveRequestDays = pgTable(
  "leave_request_days",
  {
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    requestId: uuid("request_id")
      .notNull()
      .references(() => leaveRequests.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    date: isoDate("date").notNull(),
    amount: numeric("amount", { precision: 2, scale: 1, mode: "number" })
      .notNull()
      .default(1),
  },
  (t) => [
    primaryKey({ columns: [t.requestId, t.date] }),
    uniqueIndex("leave_request_days_employee_date_key").on(
      t.employeeId,
      t.date,
    ),
    index("leave_request_days_company_date_idx").on(t.companyId, t.date),
  ],
);

/** Unveränderlicher Verlauf eines Antrags (Einreichung, Entscheidungen, Rückzug). */
export const leaveRequestEvents = pgTable(
  "leave_request_events",
  {
    id: id(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    requestId: uuid("request_id")
      .notNull()
      .references(() => leaveRequests.id, { onDelete: "cascade" }),
    type: leaveEventType("type").notNull(),
    actorUserId: uuid("actor_user_id"),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [index("leave_request_events_request_idx").on(t.requestId)],
);

// ---------------------------------------------------------------------------
// Benachrichtigungen und Audit
// ---------------------------------------------------------------------------

export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    link: text("link"),
    /** Verhindert doppelte Benachrichtigungen bei wiederholten Requests. */
    dedupeKey: text("dedupe_key").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("notifications_dedupe_key").on(t.dedupeKey),
    index("notifications_user_idx").on(t.companyId, t.userId, t.createdAt),
  ],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: id(),
    /** NULL bei plattformweiten Aktionen. */
    companyId: uuid("company_id"),
    actorUserId: uuid("actor_user_id"),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    /** Nur notwendige, nicht-sensible Zusatzinformationen. */
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [
    index("audit_logs_company_created_idx").on(t.companyId, t.createdAt),
    index("audit_logs_created_idx").on(t.createdAt),
  ],
);
