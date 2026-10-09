"use server";

import { clientIp } from "@/server/auth/current";
import { submitContactRequest } from "@/server/services/contact";
import { bool, list, runAction, str, type ActionState } from "@/server/actions";

export async function contactAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const ip = await clientIp();
  return runAction(async () => {
    await submitContactRequest({
      fields: {
        name: str(form, "name"),
        email: str(form, "email"),
        companyName: str(form, "companyName"),
        employeeRange: str(form, "employeeRange"),
        locationCount: str(form, "locationCount"),
        interests: list(form, "interests"),
        message: str(form, "message"),
        privacy: bool(form, "privacy"),
      },
      honeypot: str(form, "website"),
      renderedAt: Number(str(form, "renderedAt")),
      ip,
    });
  });
}
