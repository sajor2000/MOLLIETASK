import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { withAuth } from "@workos-inc/authkit-nextjs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  // Validate token format (32 alphanumeric chars)
  if (!/^[A-Za-z0-9]{32}$/.test(token)) {
    redirect("/sign-in");
  }

  // Store token in cookie for consumption after auth
  const cookieStore = await cookies();
  cookieStore.set("invite_token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 3600, // 1 hour
    path: "/",
  });

  // If already authenticated, go straight to app (it will consume the invite)
  const { user } = await withAuth();
  if (user) {
    redirect("/");
  }

  // Not authenticated — send to sign-up
  redirect("/sign-up");
}
