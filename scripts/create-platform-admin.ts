/**
 * Legt einen Plattform-Administrator an (oder macht ein bestehendes Konto dazu)
 * und gibt einen einmaligen Link zum Setzen des Passworts aus (24 h gültig).
 *
 *   npm run platform:create-admin -- --email admin@example.com --name "Vorname Nachname"
 */
import { eq } from "drizzle-orm";

try {
  process.loadEnvFile(".env.local");
} catch {}

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const email = arg("email")?.trim().toLowerCase();
  const name = arg("name")?.trim();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    console.error('Bitte --email angeben, z. B. --email admin@example.com --name "Max Muster"');
    process.exit(1);
  }
  const { schema } = await import("../src/server/db");
  const { withSystem } = await import("../src/server/db/tenant");
  const { createPasswordSetupLink } = await import("../src/server/auth/accounts");

  const userId = await withSystem(async (tx) => {
    let [user] = await tx.select().from(schema.users).where(eq(schema.users.email, email));
    if (!user) {
      [user] = await tx.insert(schema.users).values({ email, name: name || email }).returning();
    }
    await tx.insert(schema.platformAdmins).values({ userId: user.id }).onConflictDoNothing();
    await tx.insert(schema.auditLogs).values({
      companyId: null,
      actorUserId: null,
      action: "platform.admin_created",
      entityType: "user",
      entityId: user.id,
      metadata: { via: "cli" },
    });
    return user.id;
  });
  const url = await createPasswordSetupLink(userId);
  console.log(`\nPlattform-Administrator: ${email}\nPasswort festlegen (einmalig, 24 h gültig):\n${url}\n`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
