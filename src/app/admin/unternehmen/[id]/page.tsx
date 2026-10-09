import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePlatformAdmin } from "@/server/auth/current";
import { getCompanyDetail } from "@/server/services/platform";
import { AUDIT_ACTION_LABELS } from "@/server/services/audit";
import { isAppError } from "@/server/errors";
import { Badge, Card, CardHeader, EmptyState, Notice, PageHeader, Table, Td, Th } from "@/components/ui/primitives";
import { AssignAdminForm, CompanyStatusControl, InviteAdminForm } from "../../forms";
import { formatDateTime } from "@/lib/dates";

export const metadata: Metadata = { title: "Unternehmen" };

export default async function CompanyDetailPage({ params }: PageProps<"/admin/unternehmen/[id]">) {
  const { id } = await params;
  const { ctx } = await requirePlatformAdmin();
  const d = await getCompanyDetail(ctx, id).catch((e) => {
    if (isAppError(e)) notFound();
    throw e;
  });
  const c = d.company;

  return (
    <>
      <PageHeader
        title={c.name}
        description={`${c.slug} · ${d.stateName} · angelegt ${formatDateTime(c.createdAt)}`}
        back={{ href: "/admin/unternehmen", label: "Unternehmen" }}
        actions={<CompanyStatusControl id={c.id} status={c.status} name={c.name} />}
      />
      {c.status === "suspended" && (
        <Notice tone="danger" className="mb-6" title={`Gesperrt seit ${c.suspendedAt ? formatDateTime(c.suspendedAt) : "–"}`}>
          {c.suspendedReason ?? "Kein Grund angegeben."} Alle Daten sind erhalten.
        </Notice>
      )}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Mitglieder" description={`${d.members.length} Zugänge · ${d.activeEmployees} aktive Mitarbeiterprofile`} />
            {d.members.length === 0 ? (
              <EmptyState title="Noch keine Mitglieder" description="Die verantwortliche Person hat die Einladung noch nicht angenommen." />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Name</Th>
                    <Th className="hidden sm:table-cell">E-Mail</Th>
                    <Th>Rolle</Th>
                  </tr>
                </thead>
                <tbody>
                  {d.members.map((m) => (
                    <tr key={m.membershipId}>
                      <Td className="font-medium">
                        {m.userName}
                        {m.status !== "active" && <Badge className="ml-2">deaktiviert</Badge>}
                      </Td>
                      <Td className="hidden text-muted sm:table-cell">{m.email}</Td>
                      <Td>{m.isOwner ? <Badge tone="primary">{m.roleName}</Badge> : m.roleName}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
          <Card>
            <CardHeader title="Administratoren" />
            <div className="space-y-6 p-5">
              <AssignAdminForm
                id={c.id}
                members={d.members.filter((m) => !m.isOwner && m.status === "active").map((m) => ({ membershipId: m.membershipId, label: `${m.userName} (${m.email})` }))}
              />
              <div className="border-t border-line pt-5">
                <InviteAdminForm id={c.id} />
              </div>
            </div>
          </Card>
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Offene Einladungen" />
            {d.invitations.length === 0 ? (
              <p className="px-5 py-4 text-sm text-muted">Keine.</p>
            ) : (
              <ul className="divide-y divide-line">
                {d.invitations.map((i) => (
                  <li key={i.id} className="px-5 py-3 text-sm">
                    <p className="font-medium">{i.email}</p>
                    <p className="text-xs text-muted">
                      {i.roleName} · gültig bis {formatDateTime(i.expiresAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <CardHeader title="Verlauf" />
            <ul className="divide-y divide-line">
              {d.history.map((h) => (
                <li key={h.id} className="px-5 py-3 text-sm">
                  <p className="font-medium">{AUDIT_ACTION_LABELS[h.action] ?? h.action}</p>
                  <p className="text-xs text-muted">
                    {formatDateTime(h.createdAt)} · {h.actorName ?? "System"}
                  </p>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
