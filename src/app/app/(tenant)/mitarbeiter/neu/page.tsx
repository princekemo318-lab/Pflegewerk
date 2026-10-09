import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireTenant } from "@/server/auth/current";
import { can } from "@/server/authz";
import { getEmployeeFormOptions } from "@/server/services/employees";
import { Card, PageHeader } from "@/components/ui/primitives";
import { CreateEmployeeForm } from "@/components/employees/employee-form";
import { createEmployeeAction } from "../actions";
import { todayIso, yearOf } from "@/lib/dates";

export const metadata: Metadata = { title: "Mitarbeiter hinzufügen" };

export default async function NewEmployeePage() {
  const { ctx } = await requireTenant();
  if (!can(ctx, "employees.manage")) notFound();
  const options = await getEmployeeFormOptions(ctx);
  // Ohne Rollenverwaltung nur die Standardrolle anbieten (wird serverseitig ebenfalls erzwungen).
  const roles = can(ctx, "roles.manage") ? options.assignableRoles : options.assignableRoles.filter((r) => r.isDefault);
  return (
    <>
      <PageHeader title="Mitarbeiter hinzufügen" back={{ href: "/app/mitarbeiter", label: "Mitarbeiter" }} />
      <Card className="p-5 sm:p-6">
        <CreateEmployeeForm
          action={createEmployeeAction}
          teams={options.teams}
          locations={options.locations}
          managers={options.managers}
          roles={roles}
          defaults={{ weekdays: options.company.defaultWorkWeek, annualLeaveDays: options.company.defaultAnnualLeaveDays, year: yearOf(todayIso()) }}
        />
      </Card>
    </>
  );
}
