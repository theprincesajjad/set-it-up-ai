"use client";
import { useEffect, useState } from "react";
import type { adminApi } from "@ll/shared";
import { Banner } from "@/components/ui/Banner";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { PageHeader } from "@/components/ui/Layout";
import { Select } from "@/components/ui/Select";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { browserApi } from "@/lib/api/browser";
import { errorMessage } from "@/lib/api/errors";
import { formatDate } from "@/lib/format";
import { maskPhone } from "@/lib/dashboard/customers";

/** Users & roles. Lookup only (no browsing members: privacy); role changes are audit-logged. */
export default function UsersPage() {
  const toast = useToast();
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const [rows, setRows] = useState<adminApi.AdminUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (q.trim().length < 3 && !role) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRows([]);
      return;
    }
    const t = setTimeout(() => {
      setLoading(true);
      browserApi.admin.users({ q: q.trim() || undefined, platformRole: role || undefined, limit: 50 }).then((r) => setRows(r.items)).catch((e) => setError(errorMessage(e))).finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(t);
  }, [q, role]);
  const cols: Column<adminApi.AdminUser>[] = [
    { key: "name", header: "Name", mobile: "title", cell: (u) => u.name ?? u.email ?? "No name" },
    { key: "contact", header: "Contact", mobile: "subtitle", cell: (u) => [u.email, u.phone ? maskPhone(u.phone) : null].filter(Boolean).join(" · ") },
    { key: "code", header: "Member code", mobile: "hidden", cell: (u) => <span className="font-mono">{u.memberCode}</span> },
    { key: "shops", header: "Shops", align: "end", mobile: "hidden", cell: (u) => `${u.memberships} member · ${u.staffOf} staff` },
    { key: "joined", header: "Joined", mobile: "hidden", cell: (u) => formatDate(u.createdAt) },
    { key: "role", header: "Platform role", mobile: "trailing", cell: (u) => (
      <div className="w-32" onClick={(e) => e.stopPropagation()}>
        <Select hideLabel label={`Role for ${u.name ?? u.email}`} value={u.platformRole} onChange={async (e) => {
          try {
            const r = await browserApi.admin.setUserRole(u.id, e.target.value as adminApi.AdminUser["platformRole"]);
            setRows((x) => x.map((y) => (y.id === u.id ? { ...y, platformRole: r.platformRole as adminApi.AdminUser["platformRole"] } : y)));
            toast({ message: "Role updated. It applies at their next sign-in.", tone: "success" });
          } catch (err) {
            setError(errorMessage(err));
          }
        }} options={[{ value: "none", label: "None" }, { value: "rep", label: "Rep" }, { value: "admin", label: "Admin" }]} />
      </div>
    ) },
  ];
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Users & roles" description="Look someone up by name, email, phone digits or member code." />
      {error ? <Banner tone="danger">{error}</Banner> : null}
      <DataTable caption="Users" columns={cols} rows={rows} rowKey={(u) => u.id} loading={loading} toolbar={
        <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
          <TextField type="search" label="Search users" hideLabel placeholder="At least 3 characters" value={q} onChange={(e) => setQ(e.target.value)} />
          <Select hideLabel label="Role" value={role} onChange={(e) => setRole(e.target.value)} options={[{ value: "", label: "Any role" }, { value: "rep", label: "Reps" }, { value: "admin", label: "Admins" }]} />
        </div>
      } empty={<p className="p-6 text-center text-body-sm text-fg-muted">Search to find a user. We don&apos;t list everyone, for privacy.</p>} />
    </div>
  );
}
