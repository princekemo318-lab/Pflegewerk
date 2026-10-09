/** Datenexport der eigenen Daten (Art. 15/20 DSGVO) als JSON-Datei. */
import { requireTenant } from "@/server/auth/current";
import { exportOwnData } from "@/server/services/privacy";

export async function GET() {
  const { ctx } = await requireTenant();
  const data = await exportOwnData(ctx);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="meine-daten-${data.exportedAt.slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
