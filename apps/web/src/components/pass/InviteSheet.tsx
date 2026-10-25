"use client";
/**
 * Invite a friend to one shop (web pass; the app has the same screen). Job: turn a regular into a recruiter in the way
 * families already talk, so WhatsApp is the big button and the OS share sheet is "more ways". The invite text and link are
 * written by the API in the inviter's language. Only offered when the shop has referrals on and a bonus set.
 */
import { useEffect, useState } from "react";
import type { customerApi } from "@ll/shared";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { browserApi } from "@/lib/api/browser";
import { errorMessage } from "@/lib/api/errors";
import { useLocaleOrEnglish } from "@/lib/i18n/client";
import { unitsText } from "@/lib/units";

/** wa.me link that opens WhatsApp with the invite text typed in. */
export function whatsappUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export function InviteSheet({ open, onClose, membership }: { open: boolean; onClose: () => void; membership: Pick<customerApi.MembershipDto, "id" | "merchant" | "terminology"> }) {
  const { t, locale } = useLocaleOrEnglish();
  const toast = useToast();
  const [ref, setRef] = useState<customerApi.ReferralResponse | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open || ref) return;
    let live = true;
    browserApi.me
      .referral(membership.id)
      .then((r) => live && setRef(r))
      .catch((e) => {
        if (!live) return;
        setFailed(true);
        toast({ message: errorMessage(e), tone: "error" });
      });
    return () => {
      live = false;
    };
  }, [open, ref, membership.id, toast]);

  async function share() {
    if (!ref) return;
    try {
      if (typeof navigator !== "undefined" && typeof navigator.share === "function") await navigator.share({ text: ref.shareText, url: ref.shareUrl });
      else {
        await navigator.clipboard.writeText(ref.shareText);
        toast({ message: ref.code, tone: "success" });
      }
    } catch {
      /* the share sheet was dismissed */
    }
  }

  async function fresh() {
    try {
      setRef(await browserApi.me.newReferral(membership.id));
    } catch (e) {
      toast({ message: errorMessage(e), tone: "error" });
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t("sh.inv.title")} variant="sheet" description={t("sh.inv.sub", { shop: membership.merchant.name })}>
      {!ref ? (
        failed ? null : <Skeleton className="h-40 w-full" />
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-body text-fg-muted">{ref.bonusPoints > 0 ? t("sh.inv.bonus", { bonus: unitsText(locale, ref.bonusPoints, membership.terminology, false) }) : t("sh.inv.noBonus")}</p>
          <div className="flex flex-col items-center gap-1 rounded-card bg-bg-subtle py-4">
            <p className="font-mono text-[26px] font-semibold tracking-[0.08em] text-fg" dir="ltr">{ref.code}</p>
            <p className="text-meta text-fg-muted">{t("sh.inv.oneFriend")}</p>
          </div>
          <Button size="lg" fullWidth href={whatsappUrl(ref.shareText)} formTarget="_blank">
            {t("sh.inv.whatsapp")}
          </Button>
          <Button size="lg" variant="secondary" fullWidth onClick={() => void share()}>
            {t("sh.inv.more")}
          </Button>
          <div className="flex items-center justify-between gap-3 text-meta text-fg-muted">
            <span className="tabular-nums">
              {t("sh.inv.invited", { n: ref.stats.invited })} · <span className="font-semibold text-positive">{t("sh.inv.rewarded", { n: ref.stats.rewarded })}</span>
            </span>
            <Button variant="ghost" size="sm" onClick={() => void fresh()}>
              {t("sh.inv.newCode")}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
