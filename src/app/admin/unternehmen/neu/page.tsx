import type { Metadata } from "next";
import { requirePlatformAdmin } from "@/server/auth/current";
import { listUnlinkedContactRequests } from "@/server/services/platform";
import { getContactRequest } from "@/server/services/contact";
import { Card, PageHeader } from "@/components/ui/primitives";
import { CreateCompanyForm } from "../../forms";

export const metadata: Metadata = { title: "Unternehmen anlegen" };

export default async function NewCompanyPage({ searchParams }: PageProps<"/admin/unternehmen/neu">) {
  const { ctx } = await requirePlatformAdmin();
  const { anfrage } = await searchParams;
  const requests = await listUnlinkedContactRequests(ctx);
  let preselect = null;
  if (typeof anfrage === "string" && /^[0-9a-f-]{36}$/.test(anfrage)) {
    const r = await getContactRequest(ctx, anfrage).catch(() => null);
    if (r && !r.request.companyId) {
      preselect = { id: r.request.id, companyName: r.request.companyName, name: r.request.name, email: r.request.email };
    }
  }
  return (
    <>
      <PageHeader
        title="Unternehmen anlegen"
        description="Standardrollen und Abwesenheitsarten werden automatisch angelegt und können danach angepasst werden."
        back={{ href: "/admin/unternehmen", label: "Unternehmen" }}
      />
      <Card className="max-w-3xl p-5 sm:p-6">
        <CreateCompanyForm requests={requests} preselect={preselect} />
      </Card>
    </>
  );
}
