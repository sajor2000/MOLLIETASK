import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  // Validate token format (32 base64url chars: A-Za-z0-9-_)
  if (!/^[A-Za-z0-9_-]{32}$/.test(token)) {
    redirect("/sign-in");
  }

  // Pass the token as a URL parameter rather than a JS-readable cookie.
  // This avoids XSS-exploitable persistent storage — the token lives only in
  // the URL during the redirect and is removed from the address bar by
  // ConsumeInviteToken after successful consumption.
  const { userId } = await auth();
  if (userId) {
    // Already authenticated — land on the app and let ConsumeInviteToken handle it
    redirect(`/?token=${token}`);
  }

  // Not authenticated — Clerk will redirect to /?token=... after sign-up
  redirect(`/sign-up?redirect_url=${encodeURIComponent(`/?token=${token}`)}`);
}
