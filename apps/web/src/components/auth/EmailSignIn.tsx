"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { authApi } from "@ll/shared";
import { browserApi, sessionApi } from "@/lib/api/browser";
import { errorMessage, isApiError } from "@/lib/api/errors";
import { routes } from "@/lib/routes";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { OtpField } from "@/components/ui/OtpField";
import { TextField } from "@/components/ui/TextField";

/** Where staff land after signing in: `next`, else their (first) merchant dashboard, else the rep/admin console. */
export function staffHome(me: { platformRole: string; merchants: { merchantId: string }[] } | null, next?: string | null): string {
  if (next) return next;
  if (me?.platformRole === "admin") return routes.admin;
  if (me?.platformRole === "rep") return routes.rep;
  const first = me?.merchants[0];
  return first ? routes.dashboard(first.merchantId) : routes.signup;
}

/**
 * Merchants, reps and admins: email + password, or a one-time email code, or "Forgot password?" (wave P): the emailed code plus a
 * new password, which signs them in. `initialMode="reset"` opens on the reset (/login?reset=1).
 */
export function EmailSignIn({ next, devAutofill, initialMode = "password" }: { next?: string | null; devAutofill?: boolean; initialMode?: "password" | "reset" }) {
  const router = useRouter();
  const [mode, setMode] = useState<"password" | "code" | "reset">(initialMode);
  const [newPassword, setNewPassword] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function done() {
    let me: authApi.MeResponse | null = null;
    try {
      me = await browserApi.auth.me();
    } catch {
      me = null;
    }
    router.push(staffHome(me, next));
    router.refresh();
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^\S+@\S+\.\S+$/.test(email)) return setError("Enter your email address.");
    setBusy(true);
    try {
      if (mode === "password") {
        if (!password) throw new Error("Enter your password.");
        await sessionApi.login({ email, password });
        await done();
      } else if (mode === "reset" && codeSent) {
        if (code.length < 6) throw new Error("Enter the 6-digit code from your email.");
        if (newPassword.length < 8) throw new Error("Use at least 8 characters for your new password.");
        await sessionApi.resetPassword({ email, code, password: newPassword });
        await done();
      } else if (!codeSent) {
        const r = await browserApi.auth.emailOtpStart(email);
        setCodeSent(true);
        setDevCode(r.devCode ?? null);
        if (devAutofill && r.devCode) setCode(r.devCode);
        setBusy(false);
      } else {
        await sessionApi.verifyEmailOtp({ email, code });
        await done();
      }
    } catch (err) {
      setError(err instanceof Error && !isApiError(err) ? err.message : isApiError(err) && err.status === 401 ? "Email or password is incorrect." : errorMessage(err));
      setBusy(false);
    }
  }

  const switchTo = (m: "password" | "code" | "reset") => {
    setMode(m);
    setCodeSent(false);
    setCode("");
    setError(null);
  };

  if (mode === "reset") {
    return (
      <form onSubmit={submit} noValidate className="flex flex-col gap-4" data-testid="password-reset">
        <div>
          <h2 className="text-headline text-foreground">Reset your password</h2>
          <p className="mt-1 text-meta text-muted-foreground">
            {codeSent ? `We sent a 6-digit code to ${email}. Enter it with a new password.` : "Enter the email you sign in with. We'll email you a code."}
          </p>
        </div>
        {error ? <Banner tone="danger">{error}</Banner> : null}
        {codeSent ? (
          <>
            <OtpField value={code} onChange={setCode} label="Code from your email" />
            {devCode && devAutofill ? <p className="text-meta text-fg-muted">Dev mode: code {devCode} filled in for you.</p> : null}
            <TextField label="New password" type="password" autoComplete="new-password" hint="At least 8 characters." value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          </>
        ) : (
          <TextField label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        )}
        <Button type="submit" size="lg" fullWidth loading={busy}>
          {codeSent ? "Set password and sign in" : "Email me a code"}
        </Button>
        <div className="flex flex-wrap gap-x-4">
          {codeSent ? (
            <Button variant="ghost" size="sm" className="-ms-3" onClick={() => switchTo("reset")}>
              Use a different email
            </Button>
          ) : null}
          <Button variant="ghost" size="sm" className={codeSent ? undefined : "-ms-3"} onClick={() => switchTo("password")}>
            Back to sign in
          </Button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {error ? <Banner tone="danger">{error}</Banner> : null}
      <TextField label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      {mode === "password" ? (
        <div className="flex flex-col gap-1">
          <TextField label="Password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <Button variant="ghost" size="sm" className="self-end -me-3" onClick={() => switchTo("reset")}>
            Forgot password?
          </Button>
        </div>
      ) : codeSent ? (
        <>
          <OtpField value={code} onChange={setCode} label="Code from your email" />
          {devCode && devAutofill ? <p className="text-meta text-fg-muted">Dev mode: code {devCode} filled in for you.</p> : null}
        </>
      ) : null}
      <Button type="submit" size="lg" fullWidth loading={busy}>
        {mode === "password" ? "Sign in" : codeSent ? "Sign in" : "Email me a code"}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="self-start -ms-3"
        onClick={() => switchTo(mode === "password" ? "code" : "password")}
      >
        {mode === "password" ? "Email me a code instead" : "Use my password"}
      </Button>
    </form>
  );
}
