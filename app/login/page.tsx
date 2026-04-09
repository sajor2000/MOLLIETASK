"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const { signIn } = useAuthActions();
  const [flow, setFlow] = useState<"signIn" | "signUp">("signIn");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    formData.set("flow", flow);

    try {
      await signIn("password", formData);
      router.push("/");
      router.refresh();
    } catch {
      setError(
        flow === "signIn"
          ? "Invalid email or password"
          : "Could not create account",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center justify-center min-h-dvh px-6">
      <form onSubmit={handleSubmit} className="w-full max-w-[320px]">
        <div className="mb-8">
          <h1 className="text-[15px] font-medium text-accent tracking-tight">
            Dental Task OS
          </h1>
          <p className="text-[13px] text-text-muted mt-1">
            {flow === "signIn"
              ? "Sign in to continue"
              : "Create your account"}
          </p>
        </div>

        <div className="space-y-4">
          <input
            name="email"
            type="email"
            placeholder="Email"
            autoFocus
            required
            className="w-full bg-surface border border-border/15 rounded-[4px] px-4 py-3 text-[14px] text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors duration-200"
          />

          <input
            name="password"
            type="password"
            placeholder="Password"
            required
            minLength={8}
            className="w-full bg-surface border border-border/15 rounded-[4px] px-4 py-3 text-[14px] text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors duration-200"
          />

          {error && (
            <p className="text-[13px] text-destructive">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-accent text-bg-base py-3 rounded-[4px] text-[14px] font-medium hover:opacity-90 transition-opacity duration-200 disabled:opacity-50"
          >
            {loading
              ? "Please wait..."
              : flow === "signIn"
                ? "Sign in"
                : "Sign up"}
          </button>

          <button
            type="button"
            onClick={() => setFlow(flow === "signIn" ? "signUp" : "signIn")}
            className="w-full text-[13px] text-text-muted hover:text-text-secondary transition-colors duration-200"
          >
            {flow === "signIn"
              ? "Need an account? Sign up"
              : "Already have an account? Sign in"}
          </button>
        </div>
      </form>
    </div>
  );
}
