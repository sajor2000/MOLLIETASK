"use client";

import { useClerk } from "@clerk/nextjs";
import { useEffect } from "react";

export default function SignOutPage() {
  const { signOut } = useClerk();

  useEffect(() => {
    signOut({ redirectUrl: "/sign-in" });
  // signOut is a stable reference from useClerk — empty deps is intentional
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-dvh flex items-center justify-center bg-background">
      <p className="text-muted-foreground text-sm">Signing out…</p>
    </div>
  );
}
