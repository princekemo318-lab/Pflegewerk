import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePlatformAdmin } from "@/server/auth/current";
import { CONTACT_STATUS_LABELS, getContactRequest, INTEREST_OPTIONS } from "@/server/services/contact";
import { isAppError } from "@/server/errors";
import { ButtonLink, Card, CardHeader, PageHeader } from "@/components/ui/primitives";
import { ContactAssignForm, ContactNoteForm, ContactStatusForm, DeleteContact } from "../../forms";
import { formatDateTime } from "@/lib/dates";

export const metadata: Metadata = { title: "Anfrage" };

const KIND_LABEL = { note: "Notiz", call: "Telefonat", email: "E-Mail", meeting: "Termin", status_change: "Status" } as const;

export default async function ContactRequestPage({ params }: PageProps<"/admin/anfragen/[id]">) {
  const { id } = await params;
  const { ctx } = await requirePlatformAdmin();
  const d = await getContactRequest(ctx, id).catch((e) => {
    if (isAppError(e)) notFound();
    throw e;
  });
  const r = d.request;

  return (
    <>
      <PageHeader
        title={r.companyName}
        description={`Eingang ${formatDateTime(r.createdAt)}`}
        back={{ href: "/admin/anfragen", label: "Anfragen" }}
        actions={
          d.company ? (
            <ButtonLink href={`/admin/unternehmen/${d.company.id}`} variant="secondary">
              Zum Unternehmen
            </ButtonLink>
          ) : (
            <ButtonLink href={`/admin/unternehmen/neu?anfrage=${r.id}`}>Unternehmen anlegen</ButtonLink>
          )
        }
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Anfrage" />
            <dl className="grid gap-4 p-5 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-subtle">Name</dt>
                <dd className="mt-0.5 font-medium">{r.name}</dd>
              </div>
              <div>
                <dt className="text-xs text-subtle">E-Mail</dt>
                <dd className="mt-0.5">
                  <a href={`mailto:${r.email}`} className="underline">
                    {r.email}
                  </a>
                </dd>
              </div>
              <div>
                <dt className="text-xs text-subtle">Mitarbeiter</dt>
                <dd className="mt-0.5">{r.employeeRange ?? "–"}</dd>
              </div>
              <div>
                <dt className="text-xs text-subtle">Standorte</dt>
                <dd className="mt-0.5">{r.locationCount ?? "–"}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs text-subtle">Interesse an</dt>
                <dd className="mt-0.5">
                  {r.interests.length ? r.interests.map((i) => INTEREST_OPTIONS[i as keyof typeof INTEREST_OPTIONS] ?? i).join(", ") : "–"}
                </dd>
              </div>
              {r.message && (
                <div className="sm:col-span-2">
                  <dt className="text-xs text-subtle">Nachricht</dt>
                  <dd className="mt-0.5 whitespace-pre-line">{r.message}</dd>
                </div>
              )}
              <div className="sm:col-span-2">
                <dt className="text-xs text-subtle">Datenschutzhinweise bestätigt</dt>
                <dd className="mt-0.5 text-muted">
                  {formatDateTime(r.privacyAcceptedAt)} · Fassung {r.privacyNoticeVersion}
                </dd>
              </div>
            </dl>
          </Card>
          <Card>
            <CardHeader title="Kontaktverlauf" />
            <div className="space-y-5 p-5">
              <ContactNoteForm id={r.id} />
              {d.notes.length > 0 && (
                <ol className="space-y-4 border-t border-line pt-5">
                  {d.notes.map((n) => (
                    <li key={n.id} className="text-sm">
                      <p className="text-xs text-muted">
                        <span className="font-medium text-fg">{KIND_LABEL[n.kind]}</span> · {formatDateTime(n.createdAt)} · {n.authorName ?? "–"}
                      </p>
                      <p className="mt-1 whitespace-pre-line">{n.body}</p>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </Card>
        </div>
        <div className="space-y-6">
          <Card className="space-y-5 p-5">
            <ContactStatusForm id={r.id} status={r.status} options={Object.entries(CONTACT_STATUS_LABELS)} />
            <ContactAssignForm id={r.id} assigned={r.assignedToUserId} admins={d.admins} />
          </Card>
          <Card className="p-5">
            <h2 className="font-semibold">Datenlöschung</h2>
            <p className="mt-1 mb-3 text-sm text-muted">Wenn die Anfrage abgeschlossen ist oder die Person es wünscht.</p>
            <DeleteContact id={r.id} />
          </Card>
          {d.company && (
            <p className="text-sm text-muted">
              Verknüpft mit{" "}
              <Link href={`/admin/unternehmen/${d.company.id}`} className="underline">
                {d.company.name}
              </Link>
            </p>
          )}
        </div>
      </div>
    </>
  );
}
