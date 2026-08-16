import { NextResponse, type NextRequest } from "next/server";
import { logAudit } from "@/lib/audit";
import { encryptBackup, gatherBackup } from "@/lib/backup";
import { getCurrentUser } from "@/lib/auth";
import { todaySql } from "@/lib/dates";

/**
 * Route handlers are NOT wrapped by layouts, so the authentication check in
 * `(protected)/layout.tsx` does not apply here. This endpoint hands out every
 * client record in the practice — it must check the session itself.
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const formData = await request.formData();
  const passphrase = String(formData.get("passphrase") ?? "");
  const confirm = String(formData.get("confirmPassphrase") ?? "");

  if (passphrase.length < 12) {
    return NextResponse.redirect(
      new URL("/admin/settings?backup=short", request.url),
      { status: 303 },
    );
  }
  if (passphrase !== confirm) {
    return NextResponse.redirect(
      new URL("/admin/settings?backup=mismatch", request.url),
      { status: 303 },
    );
  }

  const file = encryptBackup(gatherBackup(), passphrase);
  await logAudit("backup.exported", { userId: user.id });

  const filename = `practice-backup-${todaySql()}.json`;

  return new NextResponse(new Uint8Array(file), {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(file.length),
      "Cache-Control": "no-store",
    },
  });
}
