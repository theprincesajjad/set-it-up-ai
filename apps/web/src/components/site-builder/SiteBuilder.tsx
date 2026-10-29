"use client";
/**
 * The website builder (workstream G): pick a preset, draft the words (AI, capped) or keep the starter words, edit any line
 * with the live preview beside it, order the sections, add a .ca, publish. Monthly and Free shops build and preview; the plan
 * line says publishing comes with the annual plan. Works fully with no AI key (presets and starter words).
 * Docs: docs/engineering/site-builder.md.
 */
import { ExternalLink, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { normalizeOrder, setCopyField, type SiteContent, type SiteCopyField, type SitePreset, type siteApi } from "@ll/shared";
import { ConfirmDialog } from "@/components/dashboard/ConfirmDialog";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { SiteRenderer } from "@/components/site/presets/SiteRenderer";
import { Badge } from "@/components/ui/Badge";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { CardHead, PageTitle, SurfaceCard } from "@/components/ui/ClearKit";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { copy } from "@/copy/en-CA";
import { browserClient } from "@/lib/api/browser";
import { errorMessage } from "@/lib/api/errors";
import { cn } from "@/lib/cn";
import { formatDateYear } from "@/lib/format";
import { CopyEditor } from "./CopyEditor";
import { DomainPanel } from "./DomainPanel";
import { PresetPicker } from "./PresetPicker";
import { SectionsEditor } from "./SectionsEditor";
import { siteEndpoints } from "./siteApi";

const c = copy.siteBuilder;

export function SiteBuilder({ siteUrl }: { siteUrl: string }) {
  const { merchantId, base, role } = useMerchant();
  const api = useMemo(() => siteEndpoints(browserClient, merchantId), [merchantId]);
  const toast = useToast();
  const [b, setB] = useState<siteApi.SiteBuilderResponse | null>(null);
  const [live, setLive] = useState<siteApi.PublicSiteResponse | null>(null);
  const [content, setContent] = useState<SiteContent | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [active, setActive] = useState<SiteCopyField | null>(null);
  const [tab, setTab] = useState<"edit" | "preview">("edit");
  const [device, setDevice] = useState<"desktop" | "phone">("desktop");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [drafting, setDrafting] = useState(false);
  const [brief, setBrief] = useState("");
  const [rewriting, setRewriting] = useState<SiteCopyField | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [confirm, setConfirm] = useState<"reset" | "unpublish" | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "info"; text: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<SiteContent | null>(null);
  const version = useRef(0);

  const [reloadKey, setReloadKey] = useState(0);
  const load = useCallback(() => {
    setLoadError(null);
    setReloadKey((k) => k + 1);
  }, []);
  useEffect(() => {
    let off = false;
    Promise.all([api.get(), api.preview()])
      .then(([bb, pv]) => {
        if (off) return;
        setB(bb);
        setLive(pv);
        setContent(bb.site.draft);
      })
      .catch((e) => {
        if (!off) setLoadError(errorMessage(e));
      });
    return () => {
      off = true;
    };
  }, [api, reloadKey]);

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const next = pending.current;
    if (!next) return;
    pending.current = null;
    const v = version.current;
    setSaveState("saving");
    try {
      const r = await api.save({ preset: next.preset, order: next.order, hidden: next.hidden, copy: next.copy as unknown as Record<string, Record<string, string>> });
      setB(r);
      // Keep what the owner typed since this save left.
      if (version.current === v) setContent(r.site.draft);
      setSaveState("saved");
    } catch (e) {
      setSaveState("idle");
      toast({ message: errorMessage(e), tone: "error" });
    }
  }, [api, toast]);

  const update = useCallback(
    (next: SiteContent) => {
      version.current += 1;
      setContent(next);
      pending.current = next;
      setSaveState("saving");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), 600);
    },
    [flush],
  );
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  if (role !== "owner" && role !== "manager") return <Banner tone="neutral">{c.noAccess}</Banner>;
  if (loadError)
    return (
      <Banner tone="danger" action={<Button variant="secondary" size="sm" onClick={load}>{copy.action.tryAgain}</Button>}>
        {loadError}
      </Banner>
    );
  if (!b || !content || !live) return <div aria-busy="true" className="h-96 animate-pulse rounded-r6 bg-muted" />;

  const isOwner = role === "owner";
  const status = b.site.status;
  const liveUrl = `${siteUrl.replace(/^https?:\/\//, "")}${b.site.path}`;
  const changes = status === "published" && (b.site.unpublishedChanges || saveState === "saving");
  const preview: siteApi.PublicSiteResponse = { ...live, content, mode: "preview", lapseBannerUntil: null };
  const draftsLeft = b.usage.drafts.limit - b.usage.drafts.used;
  const editsLeft = b.usage.edits.limit - b.usage.edits.used;
  const resetsOn = formatDateYear(b.usage.periodEnd);

  async function draftAi() {
    await flush();
    setDrafting(true);
    setNotice(null);
    try {
      const r = await api.draft({ preset: content!.preset, ...(brief.trim() ? { brief: brief.trim() } : {}) });
      version.current += 1;
      setB(r);
      setContent(r.site.draft);
      setNotice({ tone: r.outcome === "ai" ? "success" : "info", text: r.outcome === "ai" ? c.aiDone : (r.message ?? c.aiDone) });
    } catch (e) {
      toast({ message: errorMessage(e), tone: "error" });
      load();
    } finally {
      setDrafting(false);
    }
  }

  async function rewrite(f: SiteCopyField) {
    await flush();
    setRewriting(f);
    try {
      const r = await api.rewrite({ field: f });
      version.current += 1;
      setContent((cur) => (cur ? { ...cur, copy: setCopyField(cur.copy, f, r.text) } : cur));
      setB((cur) => (cur ? { ...cur, usage: r.usage } : cur));
      if (r.message) toast({ message: r.message });
    } catch (e) {
      toast({ message: errorMessage(e), tone: "error" });
    } finally {
      setRewriting(null);
    }
  }

  async function publish() {
    await flush();
    setPublishing(true);
    try {
      const r = await api.publish();
      setB(r);
      toast({ message: c.published, tone: "success" });
    } catch (e) {
      toast({ message: errorMessage(e), tone: "error" });
    } finally {
      setPublishing(false);
    }
  }

  const statusLine = status === "published" ? c.statusLive(liveUrl) : status === "unpublished" ? c.statusUnpublished : c.statusDraft;

  const editor = (
    <div className="flex flex-col gap-4">
      <SurfaceCard as="section" aria-labelledby="sb-look">
        <CardHead id="sb-look" title={c.lookTitle} />
        <p className="-mt-2 px-4 pb-3 text-body text-muted-foreground">{c.lookHint}</p>
        <PresetPicker value={content.preset} onChange={(p: SitePreset) => update({ ...content, preset: p, order: normalizeOrder(p, null), hidden: [] })} />
      </SurfaceCard>

      <SurfaceCard as="section" aria-labelledby="sb-words">
        <CardHead id="sb-words" title={c.wordsTitle} action={<span className="text-meta text-muted-foreground" aria-live="polite">{saveState === "saving" ? c.saving : saveState === "saved" ? c.saved : null}</span>} />
        <div className="flex flex-col gap-3 px-4 pb-4">
          <p className="text-body text-muted-foreground">{c.wordsHint}</p>
          {b.aiAvailable ? (
            <>
              <TextField label={c.aiBrief} hint={c.aiBriefHint} value={brief} maxLength={400} onChange={(e) => setBrief(e.target.value)} />
              <div className="flex flex-wrap items-center gap-3">
                <Button iconStart={Sparkles} loading={drafting} disabled={drafting || draftsLeft <= 0} onClick={() => void draftAi()}>
                  {drafting ? c.aiWorking : b.usage.drafts.used ? c.aiDraftAgain : c.aiDraft}
                </Button>
                <span className="text-meta text-muted-foreground" data-testid="site-usage">
                  {c.draftsUsage(b.usage.drafts.used, b.usage.drafts.limit)} · {c.editsUsage(b.usage.edits.used, b.usage.edits.limit)}
                  {draftsLeft <= 0 ? ` · ${c.resets(resetsOn)}` : ""}
                </span>
              </div>
            </>
          ) : (
            <p className="text-body text-foreground">{c.aiOff}</p>
          )}
          {notice ? (
            <p role="status" className={cn("text-body", notice.tone === "success" ? "text-success-text" : "text-foreground")}>
              {notice.text}
            </p>
          ) : null}
          <div>
            <Button variant="ghost" size="sm" onClick={() => setConfirm("reset")}>
              {c.reset}
            </Button>
          </div>
        </div>
        <CopyEditor
          content={content}
          activeField={active}
          onFocusField={setActive}
          onChange={(f, v) => update({ ...content, copy: setCopyField(content.copy, f, v) })}
          aiAvailable={b.aiAvailable}
          rewriting={rewriting}
          onRewrite={(f) => void rewrite(f)}
          editsLeft={editsLeft}
        />
      </SurfaceCard>

      <SurfaceCard as="section" aria-labelledby="sb-sections">
        <CardHead id="sb-sections" title={c.sectionsTitle} />
        <p className="-mt-2 px-4 pb-2 text-body text-muted-foreground">{c.sectionsHint}</p>
        <SectionsEditor content={content} onChange={(n) => update({ ...content, ...n })} />
      </SurfaceCard>

      {isOwner ? (
        <SurfaceCard as="section" aria-labelledby="sb-domain">
          <CardHead id="sb-domain" title={c.domainTitle} />
          <DomainPanel api={api} b={b} siteUrl={siteUrl} onChange={setB} />
        </SurfaceCard>
      ) : null}
    </div>
  );

  const previewPane = (
    <SurfaceCard as="section" aria-labelledby="sb-preview" className="md:sticky md:top-22">
      <CardHead
        id="sb-preview"
        title={c.previewLabel}
        action={<SegmentedControl size="sm" label={c.device} value={device} onChange={setDevice} options={[{ value: "desktop", label: c.desktop }, { value: "phone", label: c.phone }]} />}
      />
      <div className="bg-background p-3 md:p-4">
        <div className={cn("mx-auto max-h-[80dvh] overflow-y-auto rounded-r5 bg-background hairline-inset", device === "phone" ? "max-w-97.5 px-4 py-2" : "px-4 py-2 md:px-6")} data-trade-scope>
          <SiteRenderer data={preview} links={{ base: "" }} onPick={(f) => { setActive(f); setTab("edit"); }} activeField={active} compact={device === "phone"} />
        </div>
      </div>
    </SurfaceCard>
  );

  return (
    <div className="flex flex-col">
      <PageTitle
        title={c.title}
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-2">
            {statusLine}
            {changes ? <Badge tone="warning">{c.changes}</Badge> : null}
          </span>
        }
        actions={
          <>
            {status === "published" ? (
              <Button variant="secondary" href={b.site.path} iconEnd={ExternalLink}>
                {c.viewSite}
              </Button>
            ) : null}
            {isOwner && status === "published" ? (
              <Button variant="ghost" onClick={() => setConfirm("unpublish")}>
                {c.unpublish}
              </Button>
            ) : null}
            {isOwner && b.entitlement.entitled ? (
              <Button onClick={() => void publish()} loading={publishing} disabled={publishing || (status === "published" && !changes)} data-testid="site-publish">
                {status === "published" ? c.publishChanges : c.publish}
              </Button>
            ) : null}
          </>
        }
      />
      <p className="-mt-4 mb-6 max-w-180 text-body text-muted-foreground">{c.subtitle}</p>

      {!b.entitlement.entitled && !b.entitlement.lapsed ? (
        <div className="mb-6">
          <Banner tone="info" title={c.planLineTitle} action={isOwner ? <Button variant="secondary" size="sm" href={`${base}/billing`}>{c.planLineCta}</Button> : undefined}>
            {c.planLineBody}
          </Banner>
        </div>
      ) : null}
      {b.entitlement.lapsed ? (
        <div className="mb-6">
          <Banner tone="warning" title={c.lapsedTitle} action={isOwner ? <Button variant="secondary" size="sm" href={`${base}/billing`}>{c.planLineCta}</Button> : undefined}>
            {c.lapsedBody(formatDateYear(b.entitlement.lapsed.graceEndsAt))}
          </Banner>
        </div>
      ) : null}

      <div className="mb-4 md:hidden">
        <SegmentedControl label={c.previewLabel} value={tab} onChange={setTab} options={[{ value: "edit", label: c.editTab }, { value: "preview", label: c.previewTab }]} />
      </div>
      <div className="grid items-start gap-4 md:grid-cols-8">
        <div className={cn("md:col-span-3", tab !== "edit" && "max-md:hidden")}>{editor}</div>
        <div className={cn("md:col-span-5", tab !== "preview" && "max-md:hidden")}>{previewPane}</div>
      </div>

      <ConfirmDialog
        open={confirm === "reset"}
        onClose={() => setConfirm(null)}
        title={c.reset}
        body={c.resetConfirm}
        confirmLabel={c.reset}
        onConfirm={async () => {
          if (timer.current) clearTimeout(timer.current);
          pending.current = null;
          const r = await api.reset(content.preset);
          version.current += 1;
          setB(r);
          setContent(r.site.draft);
          setConfirm(null);
          toast({ message: c.resetDone });
        }}
      />
      <ConfirmDialog
        open={confirm === "unpublish"}
        onClose={() => setConfirm(null)}
        title={c.unpublish}
        body={c.unpublishConfirm}
        confirmLabel={c.unpublish}
        danger
        onConfirm={async () => {
          const r = await api.unpublish();
          setB(r);
          setConfirm(null);
          toast({ message: c.unpublished });
        }}
      />
    </div>
  );
}
