"use client";

import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div className="min-h-dvh flex items-center justify-center bg-background">
      <SignIn />
    </div>
  );
}
