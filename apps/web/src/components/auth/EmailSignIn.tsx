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

/** Merchants, reps and admins: email + password, or a one-time email code. */
export function EmailSignIn({ next, devAutofill }: { next?: string | null; devAutofill?: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<"password" | "code">("password");
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

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {error ? <Banner tone="danger">{error}</Banner> : null}
      <TextField label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      {mode === "password" ? (
        <TextField label="Password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
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
        onClick={() => {
          setMode(mode === "password" ? "code" : "password");
          setCodeSent(false);
          setError(null);
        }}
      >
        {mode === "password" ? "Email me a code instead" : "Use my password"}
      </Button>
    </form>
  );
}
