import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireTenant } from "@/server/auth/current";
import { getLeaveRequest } from "@/server/services/leave";
import { isAppError } from "@/server/errors";
import { PageHeader } from "@/components/ui/primitives";
import { RequestDetail } from "@/components/leave/request-detail";
import { CancelButton, WithdrawButton } from "@/components/leave/request-actions";

export const metadata: Metadata = { title: "Antrag" };

export default async function MyRequestPage({ params }: PageProps<"/app/antraege/[id]">) {
  const { id } = await params;
  const { ctx } = await requireTenant();
  const detail = await getLeaveRequest(ctx, id).catch((e) => {
    if (isAppError(e)) notFound();
    throw e;
  });
  // Fremde Anträge werden in der Genehmigungsansicht angezeigt.
  if (!detail.permissions.isOwn) redirect(`/app/genehmigungen/${id}`);
  const { canWithdraw, canCancel } = detail.permissions;
  return (
    <>
      <PageHeader title="Dein Antrag" back={{ href: "/app/antraege", label: "Meine Anträge" }} />
      <RequestDetail
        detail={detail}
        actions={
          canWithdraw || canCancel ? (
            <>
              {canWithdraw && <WithdrawButton id={id} />}
              {canCancel && <CancelButton id={id} />}
            </>
          ) : undefined
        }
      />
    </>
  );
}
