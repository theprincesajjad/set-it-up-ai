"use client";
import { useState } from "react";
import type { whatsappApi } from "@ll/shared";
import { Panel } from "@/components/dashboard";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { formatPhone } from "@/components/dashboard/restaurant/shared";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { useAction } from "@/lib/dashboard/useApi";

const SOURCES = [
  { value: "in_store", label: "Told us in person" },
  { value: "form", label: "Paper or web form" },
  { value: "checkout", label: "Ticked the box at checkout" },
  { value: "import", label: "From a list the customer gave us" },
];
const LANGS = [
  { value: "", label: "No preference" },
  { value: "en", label: "English" },
  { value: "hi", label: "हिन्दी (Hindi)" },
  { value: "ur", label: "اردو (Urdu)" },
  { value: "pa", label: "ਪੰਜਾਬੀ (Punjabi)" },
];

export function Consent({ onDone }: { onDone: () => void }) {
  const { api } = useMerchant();
  const toast = useToast();
  const act = useAction();
  const [phone, setPhone] = useState("");
  const [source, setSource] = useState("in_store");
  const [language, setLanguage] = useState("");
  const [touched, setTouched] = useState(false);
  const bad = touched && phone.replace(/\D/g, "").length < 7 ? "Enter the customer's full phone number." : null;
  const record = async (kind: "in" | "out") => {
    setTouched(true);
    if (phone.replace(/\D/g, "").length < 7) return;
    const r = await act.run(() => (kind === "in" ? api.whatsapp.optIn({ phone: phone.trim(), source: source as whatsappApi.OptInBody["source"], ...(language ? { language: language as whatsappApi.WaLanguage } : {}) }) : api.whatsapp.optOut(phone.trim())));
    if (r) {
      toast({ message: kind === "in" ? `${formatPhone(r.phone)} can now get WhatsApp messages from you` : `${formatPhone(r.phone)} won't get WhatsApp messages from you`, tone: "success" });
      setPhone("");
      setTouched(false);
      onDone();
    }
  };
  return (
    <Panel title="Record opt-in or opt-out" description="Only record what the customer told you: they said yes at the counter, ticked a box, or replied START. If they ask you to stop, record an opt-out right away.">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <TextField id="wa-optin-phone" label="Customer's phone" type="tel" inputMode="tel" autoComplete="off" placeholder="(416) 555-0123" value={phone} onChange={(e) => setPhone(e.target.value)} error={bad} />
        <Select label="How they agreed" value={source} onChange={(e) => setSource(e.target.value)} options={SOURCES} />
        <Select label="Preferred language" value={language} onChange={(e) => setLanguage(e.target.value)} options={LANGS} />
      </div>
      {act.error ? <p role="alert" className="mt-3 text-meta text-negative">{act.error}</p> : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" loading={act.busy} onClick={() => void record("in")}>
          Record opt-in
        </Button>
        <Button variant="ghost" size="sm" disabled={act.busy} onClick={() => void record("out")}>
          Record opt-out
        </Button>
      </div>
    </Panel>
  );
}

