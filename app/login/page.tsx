"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Step =
  | { kind: "auth"; flow: "signIn" | "signUp" }
  | { kind: "forgot" }
  | { kind: "reset-code"; email: string };

export default function LoginPage() {
  const { signIn } = useAuthActions();
  const [step, setStep] = useState<Step>({ kind: "auth", flow: "signIn" });
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleAuth(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    if (step.kind !== "auth") return;

    const formData = new FormData(e.currentTarget);
    formData.set("flow", step.flow);

    try {
      await signIn("password", formData);
      router.push("/");
      router.refresh();
    } catch {
      setError(
        step.flow === "signUp"
          ? "Could not create account. Email may already be in use."
          : "Invalid email or password",
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleForgot(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const email = formData.get("email") as string;
    formData.set("flow", "reset");

    try {
      await signIn("password", formData);
      setStep({ kind: "reset-code", email });
      setInfo("Check your email for a reset code.");
    } catch {
      setError("Could not send reset code. Check your email address.");
    } finally {
      setLoading(false);
    }
  }

  async function handleResetCode(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setInfo("");
    setLoading(true);

    if (step.kind !== "reset-code") return;

    const formData = new FormData(e.currentTarget);
    formData.set("email", step.email);
    formData.set("flow", "reset-verification");

    try {
      await signIn("password", formData);
      router.push("/");
      router.refresh();
    } catch {
      setError("Invalid code or password. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const inputClass =
    "w-full bg-surface border border-border/15 rounded-[4px] px-4 py-3 text-[14px] text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors duration-200";
  const btnClass =
    "w-full bg-accent text-bg-base py-3 rounded-[4px] text-[14px] font-medium hover:opacity-90 transition-opacity duration-200 disabled:opacity-50";
  const linkClass = "text-accent hover:opacity-80 transition-opacity";

  // Sign in / Sign up
  if (step.kind === "auth") {
    return (
      <div className="flex items-center justify-center min-h-dvh px-6">
        <form onSubmit={handleAuth} className="w-full max-w-[320px]">
          <div className="mb-8">
            <h1 className="text-[15px] font-medium text-accent tracking-tight">
              Dental Task OS
            </h1>
            <p className="text-[13px] text-text-muted mt-1">
              {step.flow === "signIn" ? "Sign in to continue" : "Create your account"}
            </p>
          </div>

          <div className="space-y-4">
            <input name="email" type="email" placeholder="Email" autoFocus required className={inputClass} />
            <input name="password" type="password" placeholder="Password" required minLength={8} className={inputClass} />

            {error && <p className="text-[13px] text-destructive">{error}</p>}

            <button type="submit" disabled={loading} className={btnClass}>
              {loading ? "Please wait..." : step.flow === "signIn" ? "Sign in" : "Create account"}
            </button>
          </div>

          <div className="mt-6 space-y-2 text-center text-[13px] text-text-muted">
            <p>
              {step.flow === "signIn" ? "No account? " : "Already have one? "}
              <button
                type="button"
                onClick={() => { setStep({ kind: "auth", flow: step.flow === "signIn" ? "signUp" : "signIn" }); setError(""); }}
                className={linkClass}
              >
                {step.flow === "signIn" ? "Sign up" : "Sign in"}
              </button>
            </p>
            {step.flow === "signIn" && (
              <p>
                <button
                  type="button"
                  onClick={() => { setStep({ kind: "forgot" }); setError(""); }}
                  className={linkClass}
                >
                  Forgot password?
                </button>
              </p>
            )}
          </div>
        </form>
      </div>
    );
  }

  // Forgot password — enter email
  if (step.kind === "forgot") {
    return (
      <div className="flex items-center justify-center min-h-dvh px-6">
        <form onSubmit={handleForgot} className="w-full max-w-[320px]">
          <div className="mb-8">
            <h1 className="text-[15px] font-medium text-accent tracking-tight">
              Reset Password
            </h1>
            <p className="text-[13px] text-text-muted mt-1">
              Enter your email and we&apos;ll send you a reset code.
            </p>
          </div>

          <div className="space-y-4">
            <input name="email" type="email" placeholder="Email" autoFocus required className={inputClass} />

            {error && <p className="text-[13px] text-destructive">{error}</p>}

            <button type="submit" disabled={loading} className={btnClass}>
              {loading ? "Sending..." : "Send reset code"}
            </button>
          </div>

          <p className="text-center text-[13px] text-text-muted mt-6">
            <button
              type="button"
              onClick={() => { setStep({ kind: "auth", flow: "signIn" }); setError(""); }}
              className={linkClass}
            >
              Back to sign in
            </button>
          </p>
        </form>
      </div>
    );
  }

  // Reset code + new password
  return (
    <div className="flex items-center justify-center min-h-dvh px-6">
      <form onSubmit={handleResetCode} className="w-full max-w-[320px]">
        <div className="mb-8">
          <h1 className="text-[15px] font-medium text-accent tracking-tight">
            Enter Reset Code
          </h1>
          <p className="text-[13px] text-text-muted mt-1">
            We sent a code to {step.email}
          </p>
        </div>

        <div className="space-y-4">
          <input
            name="code"
            type="text"
            placeholder="8-digit code"
            autoFocus
            required
            inputMode="numeric"
            pattern="[0-9]{8}"
            maxLength={8}
            className={inputClass}
          />
          <input name="newPassword" type="password" placeholder="New password" required minLength={8} className={inputClass} />

          {info && <p className="text-[13px] text-success">{info}</p>}
          {error && <p className="text-[13px] text-destructive">{error}</p>}

          <button type="submit" disabled={loading} className={btnClass}>
            {loading ? "Resetting..." : "Reset password"}
          </button>
        </div>

        <p className="text-center text-[13px] text-text-muted mt-6">
          <button
            type="button"
            onClick={() => { setStep({ kind: "forgot" }); setError(""); setInfo(""); }}
            className={linkClass}
          >
            Resend code
          </button>
          {" · "}
          <button
            type="button"
            onClick={() => { setStep({ kind: "auth", flow: "signIn" }); setError(""); setInfo(""); }}
            className={linkClass}
          >
            Back to sign in
          </button>
        </p>
      </form>
    </div>
  );
}
