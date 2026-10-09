/** Datenexport zu einer Person für Auskunftsersuchen an das Unternehmen (nur Personalverwaltung). */
import { requireTenant } from "@/server/auth/current";
import { exportEmployeeData } from "@/server/services/privacy";
import { isAppError } from "@/server/errors";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx } = await requireTenant();
  try {
    const data = await exportEmployeeData(ctx, id);
    return new Response(JSON.stringify(data, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="datenauskunft-${data.exportedAt.slice(0, 10)}.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (isAppError(error)) {
      return Response.json({ error: error.message }, { status: error.code === "forbidden" ? 403 : 404 });
    }
    throw error;
  }
}
