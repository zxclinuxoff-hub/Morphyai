import { timingSafeEqual } from "node:crypto";
import { getPool } from "@/lib/pool";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const token = process.env.ADMIN_TOKEN;
  if (!token || token.length < 16) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const auth = req.headers.get("authorization") ?? "";
  const given = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const a = Buffer.from(given);
  const b = Buffer.from(token);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // snapshot() не содержит самих ключей, только маски и счётчики.
  return Response.json({ keys: getPool().snapshot() }, { headers: { "Cache-Control": "no-store" } });
}
