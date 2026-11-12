"use client";
import { UserSearch } from "lucide-react";
import { PageHeader } from "@/components/dashboard/kit";
import { HealthPill, PanelEmpty } from "@/components/dashboard/admin/AdminKit";
import { useEffect, useState } from "react";
import type { adminApi } from "@ll/shared";
import { Banner } from "@/components/ui/Banner";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/dashboard/ConfirmDialog";
import { Select } from "@/components/ui/Select";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { browserApi } from "@/lib/api/browser";
import { errorMessage } from "@/lib/api/errors";
import { formatDate } from "@/lib/format";
import { maskPhone } from "@/lib/dashboard/customers";

const PAGE = 50;
const ROLE_LABEL = { none: "None", rep: "Rep", admin: "Admin" } as const;

/** Users & roles. Lookup only (no browsing members: privacy); role changes are audit-logged. */
export default function UsersPage() {
  const toast = useToast();
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const [rows, setRows] = useState<adminApi.AdminUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const [error, setError] = useState<string | null>(null);
  /** The search itself failed (not a role change): shown by the table as a failure with Try again, never as "Nobody matches". */
  const [searchErr, setSearchErr] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (q.trim().length < 3 && !role) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRows([]);
      return;
    }
    const t = setTimeout(() => {
      setLoading(true);
      browserApi.admin.users({ q: q.trim() || undefined, platformRole: role || undefined, limit }).then((r) => { setRows(r.items); setSearchErr(null); }).catch((e) => { setRows([]); setSearchErr(errorMessage(e)); }).finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(t);
  }, [q, role, limit, tick]);
  const [target, setTarget] = useState<adminApi.AdminUser | null>(null);
  const [next, setNext] = useState<adminApi.AdminUser["platformRole"]>("none");
  const who = target ? (target.name ?? target.email ?? "this person") : "";
  const grantsAdmin = next === "admin" && target?.platformRole !== "admin";
  const dropsAdmin = target?.platformRole === "admin" && next !== "admin";
  const cols: Column<adminApi.AdminUser>[] = [
    { key: "name", header: "Name", mobile: "title", cell: (u) => (
      <span className="flex items-center gap-2">
        <span className="truncate font-medium">{u.name ?? u.email ?? "No name"}</span>
        {u.platformRole !== "none" ? <HealthPill size="sm" tone={u.platformRole === "admin" ? "info" : "neutral"}>{u.platformRole === "admin" ? "Admin" : "Rep"}</HealthPill> : null}
      </span>
    ) },
    { key: "contact", header: "Contact", mobile: "subtitle", cell: (u) => [u.email, u.phone ? maskPhone(u.phone) : null].filter(Boolean).join(" · ") },
    { key: "code", header: "Member code", mobile: "hidden", cell: (u) => <span className="font-mono">{u.memberCode}</span> },
    { key: "shops", header: "Shops", align: "end", mobile: "hidden", cell: (u) => `${u.memberships} member · ${u.staffOf} staff` },
    { key: "joined", header: "Joined", mobile: "hidden", cell: (u) => formatDate(u.createdAt) },
    { key: "role", header: "Platform role", mobile: "trailing", cell: (u) => (
      <Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); setTarget(u); setNext(u.platformRole); }} aria-label={`Change role for ${u.name ?? u.email ?? "this person"}, now ${ROLE_LABEL[u.platformRole]}`}>
        {ROLE_LABEL[u.platformRole]}
      </Button>
    ) },
  ];
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="People and roles" description="Look someone up by name, email, phone digits or member code." />
      {error ? <Banner tone="danger">{error}</Banner> : null}
      <DataTable caption="Users" columns={cols} rows={rows} rowKey={(u) => u.id} loading={loading} error={searchErr} onRetry={() => setTick((n) => n + 1)} toolbar={
        <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
          <TextField type="search" label="Search users" hideLabel placeholder="At least 3 characters" value={q} onChange={(e) => { setQ(e.target.value); setLimit(PAGE); }} />
          <Select hideLabel label="Role" value={role} onChange={(e) => { setRole(e.target.value); setLimit(PAGE); }} options={[{ value: "", label: "Any role" }, { value: "rep", label: "Reps" }, { value: "admin", label: "Admins" }]} />
        </div>
      } empty={<PanelEmpty icon={UserSearch} title={q.trim().length >= 3 || role ? "Nobody matches" : "Search to find someone"} description={q.trim().length >= 3 || role ? "Try a different spelling, the last digits of the phone, or the member code." : "Type at least 3 characters of a name, email, phone or member code. We don't list everyone, for privacy."} />} />
      {rows.length >= limit ? <Button variant="secondary" className="self-start" loading={loading} onClick={() => setLimit((l) => l + PAGE)}>Load {PAGE} more</Button> : null}
      <ConfirmDialog
        open={!!target}
        onClose={() => setTarget(null)}
        title={grantsAdmin ? `Make ${who} an admin?` : dropsAdmin ? `Remove admin access from ${who}?` : `Change the role for ${who}?`}
        body={grantsAdmin ? "They will see every shop, payment and customer record." : dropsAdmin ? "They will lose access to the admin area. It applies at their next sign-in." : "It applies at their next sign-in."}
        confirmLabel={grantsAdmin ? "Make admin" : dropsAdmin ? "Remove admin" : "Change role"}
        danger={grantsAdmin || dropsAdmin}
        disabled={!target || next === target.platformRole}
        onConfirm={async () => {
          if (!target) return;
          const prev = target.platformRole;
          const id = target.id;
          const r = await browserApi.admin.setUserRole(id, next);
          const apply = (role: adminApi.AdminUser["platformRole"]) => setRows((x) => x.map((y) => (y.id === id ? { ...y, platformRole: role } : y)));
          apply(r.platformRole as adminApi.AdminUser["platformRole"]);
          toast({
            message: `${who} is now ${ROLE_LABEL[next].toLowerCase()}. It applies at their next sign-in.`,
            tone: "success",
            action: { label: "Undo", onClick: () => { void browserApi.admin.setUserRole(id, prev).then(() => apply(prev)).catch((e) => setError(errorMessage(e))); } },
          });
        }}
      >
        <Select label="New platform role" value={next} onChange={(e) => setNext(e.target.value as adminApi.AdminUser["platformRole"])} options={[{ value: "none", label: "None" }, { value: "rep", label: "Rep" }, { value: "admin", label: "Admin" }]} />
      </ConfirmDialog>
    </div>
  );
}
