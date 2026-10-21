import { auditLogs, type DbOrTx } from "@ll/db";

export interface AuditEntry {
  actorUserId: string | null;
  merchantId?: string | null;
  action: string;
  entity?: string | null;
  entityId?: string | null;
  data?: unknown;
  ip?: string | null;
}

/** Append-only audit trail (viewed in the admin console). */
export async function writeAudit(db: DbOrTx, e: AuditEntry): Promise<void> {
  await db.insert(auditLogs).values({
    actorUserId: e.actorUserId,
    merchantId: e.merchantId ?? null,
    action: e.action,
    entity: e.entity ?? null,
    entityId: e.entityId ?? null,
    data: (e.data ?? null) as never,
    ip: e.ip ?? null,
  });
}
