import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireTenant } from "@/server/auth/current";
import { can } from "@/server/authz";
import { getEmployee } from "@/server/services/employees";
import { listRequestableTypes } from "@/server/services/leave";
import { isAppError } from "@/server/errors";
import { Card, PageHeader } from "@/components/ui/primitives";
import { LeaveForm } from "@/components/leave/leave-form";
import { recordAbsenceAction } from "@/app/app/(tenant)/antraege/actions";
import { todayIso } from "@/lib/dates";

export const metadata: Metadata = { title: "Abwesenheit eintragen" };

export default async function RecordAbsencePage({ params }: PageProps<"/app/mitarbeiter/[id]/abwesenheit">) {
  const { id } = await params;
  const { ctx } = await requireTenant();
  if (!can(ctx, "leave.manage")) notFound();
  const { employee } = await getEmployee(ctx, id).catch((e) => {
    if (isAppError(e)) notFound();
    throw e;
  });
  const types = await listRequestableTypes(ctx, { forRecording: true });
  return (
    <>
      <PageHeader
        title="Abwesenheit eintragen"
        description={`Für ${employee.firstName} ${employee.lastName}. Die Abwesenheit gilt sofort als genehmigt; die Person wird benachrichtigt.`}
        back={{ href: `/app/mitarbeiter/${id}`, label: `${employee.firstName} ${employee.lastName}` }}
      />
      <Card className="p-5 sm:p-6">
        <LeaveForm action={recordAbsenceAction} types={types} employeeId={id} today={todayIso()} submitLabel="Abwesenheit eintragen" />
      </Card>
    </>
  );
}
