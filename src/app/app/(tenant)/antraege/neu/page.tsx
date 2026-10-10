import type { Metadata } from "next";
import { requireTenant } from "@/server/auth/current";
import { listRequestableTypes } from "@/server/services/leave";
import { Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { LeaveForm } from "@/components/leave/leave-form";
import { submitLeaveAction } from "../actions";
import { todayIso } from "@/lib/dates";

export const metadata: Metadata = { title: "Neuer Antrag" };

export default async function NewRequestPage() {
  const { ctx } = await requireTenant();
  const types = await listRequestableTypes(ctx);
  return (
    <>
      <PageHeader
        title="Neuer Antrag"
        description="Wochenenden, freie Tage laut Arbeitszeitmodell und Feiertage an deinem Standort werden automatisch abgezogen."
        back={{ href: "/app/antraege", label: "Meine Anträge" }}
      />
      <Card className="p-5 sm:p-6">
        {types.length === 0 ? (
          <EmptyState title="Keine Abwesenheitsarten verfügbar" description="Deine Verwaltung hat noch keine Abwesenheitsarten freigegeben." />
        ) : (
          <LeaveForm action={submitLeaveAction} types={types} today={todayIso()} />
        )}
      </Card>
    </>
  );
}
