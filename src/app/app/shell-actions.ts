"use server";

import { redirect } from "next/navigation";
import { requireSession } from "@/server/auth/current";
import { setActiveCompany } from "@/server/auth/sessions";
import { resolveTenantContext } from "@/server/authz";
import { flash, str } from "@/server/actions";

/** Wechselt das aktive Unternehmen – nur wenn eine aktive Mitgliedschaft besteht. */
export async function switchCompanyAction(form: FormData) {
  const session = await requireSession();
  const companyId = str(form, "companyId");
  const ctx = await resolveTenantContext(session.user.id, companyId);
  if (ctx) {
    await setActiveCompany(session.id, session.user.id, ctx.companyId);
    await flash(`Gewechselt zu ${ctx.companyName}`);
  }
  redirect("/app");
}
