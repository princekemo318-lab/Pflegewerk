import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireTenant } from "@/server/auth/current";
import { can } from "@/server/authz";
import { listRoles } from "@/server/services/roles";
import { Badge, Card, PageHeader } from "@/components/ui/primitives";
import { DeleteRole, PermissionBadges, RoleDialog } from "@/components/organization/forms";
import { ALL_PERMISSIONS } from "@/lib/permissions";

export const metadata: Metadata = { title: "Rollen & Rechte" };

export default async function RolesPage() {
  const { ctx } = await requireTenant();
  if (!can(ctx, "roles.manage")) notFound();
  const roles = await listRoles(ctx);
  const grantable = ALL_PERMISSIONS.filter((p) => ctx.permissions.has(p));

  return (
    <>
      <PageHeader
        title="Rollen & Rechte"
        description="Rollen bündeln Rechte. Alle Prüfungen erfolgen serverseitig; niemand kann sich selbst höhere Rechte geben."
        actions={<RoleDialog grantable={grantable} />}
      />
      <div className="grid gap-4 md:grid-cols-2">
        {roles.map((r) => (
          <Card key={r.id} className="flex flex-col p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="flex flex-wrap items-center gap-2 font-semibold">
                  {r.name}
                  {r.isOwner && <Badge tone="primary">Inhaber</Badge>}
                  {r.isDefault && <Badge tone="info">Standard für neue Mitarbeiter</Badge>}
                </h2>
                {r.description && <p className="mt-1 text-sm text-muted">{r.description}</p>}
              </div>
              <span className="shrink-0 text-sm text-muted tabular">
                {r.memberCount} {r.memberCount === 1 ? "Person" : "Personen"}
              </span>
            </div>
            <div className="mt-4 flex-1">
              <PermissionBadges permissions={r.permissions} isOwner={r.isOwner} />
            </div>
            {(!r.isOwner || ctx.isOwner) && (
              <div className="mt-4 flex gap-1 border-t border-line pt-3">
                <RoleDialog role={r} grantable={grantable} />
                {!r.isOwner && !r.isDefault && r.memberCount === 0 && <DeleteRole id={r.id} name={r.name} />}
              </div>
            )}
          </Card>
        ))}
      </div>
    </>
  );
}
