"use client";
import { useEffect, useState } from "react";
import type { barberApi } from "@ll/shared";
import { Heading, useFmt } from "@/components/restaurant/ui";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { browserApi } from "@/lib/api/browser";
import { errorMessage } from "@/lib/api/errors";
import { cn } from "@/lib/cn";

/** /me/family: first names of the people on this card. Each needs the parent's tick; removing deletes the name. */
export function FamilyManager() {
  const { t } = useFmt();
  const [data, setData] = useState<barberApi.FamilyResponse | null>(null);
  const [name, setName] = useState("");
  const [consent, setConsent] = useState(false);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = () => browserApi.me.family().then(setData).catch((e) => setError(errorMessage(e)));
  useEffect(() => {
    void load();
  }, []);
  const full = !!data && data.items.length >= data.max;
  return (
    <div className="flex flex-col gap-5">
      <Heading plain>{t("fam.title")}</Heading>
      <section aria-label={t("fam.family")} className="flex flex-col gap-3">
        <h2 className="text-meta text-fg-muted">{t("fam.family")}</h2>
        {data && data.items.length === 0 ? <p className="text-body text-fg-muted">{t("fam.none")}</p> : null}
        <ul className="flex flex-col gap-2">
          {(data?.items ?? []).map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-3 rounded-card border border-line px-4 py-3">
              <span className="text-body-strong text-fg">{f.firstName}</span>
              <Button
                variant="secondary"
                size="sm"
                onClick={async () => {
                  await browserApi.me.removeFamily(f.id).catch((e) => setError(errorMessage(e)));
                  await load();
                }}
              >
                {t("fam.remove")}
              </Button>
            </li>
          ))}
        </ul>
      </section>
      {error ? <Banner tone="danger">{error}</Banner> : null}
      {full ? (
        <p className="text-meta text-fg-muted">{t("fam.full", { n: data!.max })}</p>
      ) : (
        <form
          className="flex flex-col gap-4 rounded-card border border-dashed border-line px-4 py-4"
          noValidate
          onSubmit={async (e) => {
            e.preventDefault();
            setTried(true);
            if (!name.trim() || !consent) return;
            setBusy(true);
            setError(null);
            try {
              await browserApi.me.addFamily({ firstName: name.trim(), consent: true });
              setName("");
              setConsent(false);
              setTried(false);
              await load();
            } catch (err) {
              setError(errorMessage(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          <h2 className="text-body-strong text-fg">{t("fam.add")}</h2>
          <TextField label={t("fam.name")} value={name} onChange={(e) => setName(e.target.value)} error={tried && !name.trim() ? t("q.nameRequired") : undefined} autoComplete="off" />
          <label className={cn("flex items-start gap-3 text-meta", tried && !consent ? "text-negative" : "text-fg")}>
            <input type="checkbox" className="mt-0.5 size-5" checked={consent} aria-invalid={tried && !consent ? true : undefined} onChange={(e) => setConsent(e.target.checked)} />
            <span>{t("fam.consent")}</span>
          </label>
          <Button type="submit" loading={busy} className="self-start">{t("fam.save")}</Button>
        </form>
      )}
      <p className="text-meta text-fg-muted">{t("fam.note")}</p>
    </div>
  );
}
