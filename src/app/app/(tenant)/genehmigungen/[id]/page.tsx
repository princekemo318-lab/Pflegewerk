import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireTenant } from "@/server/auth/current";
import { getLeaveRequest } from "@/server/services/leave";
import { isAppError } from "@/server/errors";
import { Notice, PageHeader } from "@/components/ui/primitives";
import { RequestDetail } from "@/components/leave/request-detail";
import { CancelButton, DecisionForm } from "@/components/leave/request-actions";

export const metadata: Metadata = { title: "Antrag entscheiden" };

export default async function ApprovalPage({ params }: PageProps<"/app/genehmigungen/[id]">) {
  const { id } = await params;
  const { ctx } = await requireTenant();
  const detail = await getLeaveRequest(ctx, id).catch((e) => {
    if (isAppError(e)) notFound();
    throw e;
  });
  const { canDecide, canCancel, isOwn } = detail.permissions;
  const r = detail.request;
  return (
    <>
      <PageHeader
        title={`Antrag von ${r.firstName} ${r.lastName}`}
        back={{ href: "/app/genehmigungen", label: "Genehmigungen" }}
      />
      {isOwn && r.status === "submitted" && (
        <Notice tone="info" className="mb-6" title="Das ist dein eigener Antrag">
          Eigene Anträge entscheidet eine andere berechtigte Person.
        </Notice>
      )}
      <RequestDetail
        detail={detail}
        showEmployee
        actions={canDecide ? <DecisionForm id={id} /> : canCancel ? <CancelButton id={id} /> : undefined}
      />
    </>
  );
}
