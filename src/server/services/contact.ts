/**
 * Kontakt-/Demo-Anfragen von der Marketing-Website und deren Bearbeitung im
 * Plattform-Admin. Spam-Schutz: Honeypot-Feld, Mindestausfüllzeit, Rate Limit pro IP.
 */
import "server-only";
import { and, asc, desc, eq, ilike, or } from "drizzle-orm";
import { z } from "zod";
import { schema } from "../db";
import { withSystem } from "../db/tenant";
import type { PlatformContext } from "../authz";
import { invalid, notFound, assertId } from "../errors";
import { assertNotLimited, RATE_LIMITS } from "../auth/rate-limit";
import { emailSchema } from "../auth/accounts";
import { audit } from "./audit";
import { brand } from "@/config/brand";

export const EMPLOYEE_RANGES = ["1–10", "11–25", "26–50", "51–100", "101–250", "mehr als 250"] as const;
export const LOCATION_COUNTS = ["1", "2–3", "4–10", "mehr als 10"] as const;
export const INTEREST_OPTIONS = {
  leave: "Urlaubsanträge & Genehmigungen",
  calendar: "Abwesenheitskalender",
  employees: "Mitarbeiterverwaltung",
  roles: "Rollen & Berechtigungen",
  locations: "Mehrere Standorte",
  other: "Etwas anderes",
} as const;

export const CONTACT_STATUS_LABELS = {
  new: "Neu",
  in_progress: "In Bearbeitung",
  contacted: "Kontaktiert",
  qualified: "Qualifiziert",
  won: "Unternehmen angelegt",
  rejected: "Abgeschlossen ohne Abschluss",
} as const;

export type ContactStatus = keyof typeof CONTACT_STATUS_LABELS;

const MIN_FILL_TIME_MS = 3000;

export const contactSchema = z.object({
  name: z.string().trim().min(2, "Bitte gib deinen Namen an.").max(120, "Der Name ist zu lang."),
  email: emailSchema,
  companyName: z.string().trim().min(2, "Bitte gib den Namen deines Unternehmens an.").max(160),
  employeeRange: z.enum(EMPLOYEE_RANGES).optional().or(z.literal("").transform(() => undefined)),
  locationCount: z.enum(LOCATION_COUNTS).optional().or(z.literal("").transform(() => undefined)),
  interests: z
    .array(z.string())
    .default([])
    .transform((list) => [...new Set(list.filter((i) => i in INTEREST_OPTIONS))]),
  message: z
    .string()
    .trim()
    .max(3000, "Höchstens 3000 Zeichen.")
    .optional()
    .transform((v) => v || null),
  privacy: z.literal(true, { message: "Bitte bestätige die Datenschutzhinweise." }),
});

export type ContactSubmission = {
  fields: unknown;
  honeypot: string;
  renderedAt: number;
  ip: string;
};

/**
 * Speichert eine Anfrage. Bei erkanntem Spam wird still "Erfolg" gemeldet, damit
 * Bots kein Feedback erhalten – es wird aber nichts gespeichert.
 */
export async function submitContactRequest(input: ContactSubmission): Promise<{ stored: boolean }> {
  const parsed = contactSchema.safeParse(input.fields);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    throw invalid("Bitte prüfe die markierten Felder.", fieldErrors);
  }
  if (input.honeypot.trim() !== "") return { stored: false };
  if (!Number.isFinite(input.renderedAt) || Date.now() - input.renderedAt < MIN_FILL_TIME_MS) {
    return { stored: false };
  }
  await assertNotLimited(RATE_LIMITS.contactByIp, input.ip);

  const data = parsed.data;
  await withSystem((tx) =>
    tx.insert(schema.contactRequests).values({
      name: data.name,
      email: data.email,
      companyName: data.companyName,
      employeeRange: data.employeeRange ?? null,
      locationCount: data.locationCount ?? null,
      interests: data.interests,
      message: data.message,
      privacyAcceptedAt: new Date(),
      privacyNoticeVersion: brand.privacyNoticeVersion,
    }),
  );
  return { stored: true };
}

// ---------------------------------------------------------------------------
// Plattform-Admin
// ---------------------------------------------------------------------------

const PAGE_SIZE = 25;

export async function listContactRequests(
  _ctx: PlatformContext,
  opts: { status?: ContactStatus | "open"; q?: string; page?: number } = {},
) {
  const page = Math.max(1, opts.page ?? 1);
  const q = opts.q?.trim().slice(0, 80).replace(/[%_\\]/g, "");
  return withSystem(async (tx) => {
    const rows = await tx
      .select({
        id: schema.contactRequests.id,
        name: schema.contactRequests.name,
        email: schema.contactRequests.email,
        companyName: schema.contactRequests.companyName,
        employeeRange: schema.contactRequests.employeeRange,
        status: schema.contactRequests.status,
        createdAt: schema.contactRequests.createdAt,
        assignedName: schema.users.name,
      })
      .from(schema.contactRequests)
      .leftJoin(schema.users, eq(schema.users.id, schema.contactRequests.assignedToUserId))
      .where(
        and(
          opts.status === "open"
            ? or(
                eq(schema.contactRequests.status, "new"),
                eq(schema.contactRequests.status, "in_progress"),
                eq(schema.contactRequests.status, "contacted"),
                eq(schema.contactRequests.status, "qualified"),
              )
            : opts.status
              ? eq(schema.contactRequests.status, opts.status)
              : undefined,
          q
            ? or(
                ilike(schema.contactRequests.companyName, `%${q}%`),
                ilike(schema.contactRequests.name, `%${q}%`),
                ilike(schema.contactRequests.email, `%${q}%`),
              )
            : undefined,
        ),
      )
      .orderBy(desc(schema.contactRequests.createdAt))
      .limit(PAGE_SIZE + 1)
      .offset((page - 1) * PAGE_SIZE);
    return { rows: rows.slice(0, PAGE_SIZE), page, hasMore: rows.length > PAGE_SIZE };
  });
}

export async function getContactRequest(_ctx: PlatformContext, id: string) {
  assertId(id);
  return withSystem(async (tx) => {
    const [request] = await tx.select().from(schema.contactRequests).where(eq(schema.contactRequests.id, id)).limit(1);
    if (!request) throw notFound("Anfrage");
    const notes = await tx
      .select({
        id: schema.contactRequestNotes.id,
        kind: schema.contactRequestNotes.kind,
        body: schema.contactRequestNotes.body,
        createdAt: schema.contactRequestNotes.createdAt,
        authorName: schema.users.name,
      })
      .from(schema.contactRequestNotes)
      .leftJoin(schema.users, eq(schema.users.id, schema.contactRequestNotes.authorUserId))
      .where(eq(schema.contactRequestNotes.contactRequestId, id))
      .orderBy(desc(schema.contactRequestNotes.createdAt));
    const admins = await tx
      .select({ id: schema.users.id, name: schema.users.name })
      .from(schema.platformAdmins)
      .innerJoin(schema.users, eq(schema.users.id, schema.platformAdmins.userId))
      .orderBy(asc(schema.users.name));
    const company = request.companyId
      ? (await tx.select({ id: schema.companies.id, name: schema.companies.name }).from(schema.companies).where(eq(schema.companies.id, request.companyId)))[0] ?? null
      : null;
    return { request, notes, admins, company };
  });
}

export async function updateContactStatus(ctx: PlatformContext, id: string, status: ContactStatus) {
  assertId(id);
  if (!(status in CONTACT_STATUS_LABELS)) throw invalid("Ungültiger Status.");
  return withSystem(
    async (tx) => {
      const [before] = await tx
        .select({ status: schema.contactRequests.status })
        .from(schema.contactRequests)
        .where(eq(schema.contactRequests.id, id));
      if (!before) throw notFound("Anfrage");
      if (before.status === status) return;
      await tx
        .update(schema.contactRequests)
        .set({ status, updatedAt: new Date() })
        .where(eq(schema.contactRequests.id, id));
      await tx.insert(schema.contactRequestNotes).values({
        contactRequestId: id,
        authorUserId: ctx.userId,
        kind: "status_change",
        body: `Status: ${CONTACT_STATUS_LABELS[before.status]} → ${CONTACT_STATUS_LABELS[status]}`,
      });
      await audit(tx, {
        companyId: null,
        actorUserId: ctx.userId,
        action: "contact.status_changed",
        entityType: "contact_request",
        entityId: id,
        metadata: { from: before.status, to: status },
      });
    },
    { userId: ctx.userId },
  );
}

export async function assignContactRequest(ctx: PlatformContext, id: string, userId: string | null) {
  assertId(id);
  if (userId !== null) assertId(userId);
  return withSystem(
    async (tx) => {
      if (userId) {
        const [admin] = await tx
          .select({ userId: schema.platformAdmins.userId })
          .from(schema.platformAdmins)
          .where(eq(schema.platformAdmins.userId, userId));
        if (!admin) throw invalid("Nur Plattform-Administratoren können zugewiesen werden.");
      }
      const [updated] = await tx
        .update(schema.contactRequests)
        .set({ assignedToUserId: userId, updatedAt: new Date() })
        .where(eq(schema.contactRequests.id, id))
        .returning({ id: schema.contactRequests.id });
      if (!updated) throw notFound("Anfrage");
      await audit(tx, {
        companyId: null,
        actorUserId: ctx.userId,
        action: "contact.assigned",
        entityType: "contact_request",
        entityId: id,
        metadata: { assignedTo: userId },
      });
    },
    { userId: ctx.userId },
  );
}

const noteSchema = z.object({
  kind: z.enum(["note", "call", "email", "meeting"]),
  body: z.string().trim().min(1, "Bitte einen Text eingeben.").max(3000),
});

export async function addContactNote(ctx: PlatformContext, id: string, raw: unknown) {
  assertId(id);
  const input = noteSchema.safeParse(raw);
  if (!input.success) throw invalid(input.error.issues[0].message, { body: input.error.issues[0].message });
  return withSystem(
    async (tx) => {
      const [exists] = await tx.select({ id: schema.contactRequests.id }).from(schema.contactRequests).where(eq(schema.contactRequests.id, id));
      if (!exists) throw notFound("Anfrage");
      await tx.insert(schema.contactRequestNotes).values({
        contactRequestId: id,
        authorUserId: ctx.userId,
        kind: input.data.kind,
        body: input.data.body,
      });
      await tx
        .update(schema.contactRequests)
        .set({ updatedAt: new Date() })
        .where(eq(schema.contactRequests.id, id));
    },
    { userId: ctx.userId },
  );
}

/** Endgültiges Löschen (z. B. auf Wunsch der anfragenden Person). */
export async function deleteContactRequest(ctx: PlatformContext, id: string) {
  assertId(id);
  return withSystem(
    async (tx) => {
      const [deleted] = await tx
        .delete(schema.contactRequests)
        .where(eq(schema.contactRequests.id, id))
        .returning({ id: schema.contactRequests.id });
      if (!deleted) throw notFound("Anfrage");
      // Protokolliert wird nur die Tatsache der Löschung, keine personenbezogenen Daten.
      await audit(tx, {
        companyId: null,
        actorUserId: ctx.userId,
        action: "contact.deleted",
        entityType: "contact_request",
        entityId: id,
      });
    },
    { userId: ctx.userId },
  );
}
