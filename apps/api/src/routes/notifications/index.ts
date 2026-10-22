/**
 * Customer notifications: inbox + preferences (docs/engineering/api/notifications.md).
 *   GET  /v1/me/notifications            ?limit=&cursor=&unread=1
 *   POST /v1/me/notifications/:id/read
 *   POST /v1/me/notifications/read-all
 *   GET  /v1/me/notification-prefs
 *   PUT  /v1/me/notification-prefs       { prefs: [{ type, channel, enabled }] }
 * Importing services/notifications.js also registers the ledger listener that
 * sends points / reward / redeem notifications.
 */
import type { FastifyInstance } from "fastify";
import { customerApi } from "@ll/shared";
import type { AppContext } from "../../context.js";
import { requireUser } from "../../lib/auth.js";
import { parse } from "../../lib/validate.js";
import { getNotificationPrefs, listNotifications, markAllRead, markRead, updateNotificationPrefs } from "../../services/notifications.js";

export default async function register(app: FastifyInstance, ctx: AppContext): Promise<void> {
  app.get("/me/notifications", async (req) => listNotifications(ctx, requireUser(req).id, parse(customerApi.notificationsQuery, req.query)));

  app.post("/me/notifications/read-all", async (req) => markAllRead(ctx, requireUser(req).id));

  app.post<{ Params: { id: string } }>("/me/notifications/:id/read", async (req) => markRead(ctx, requireUser(req).id, req.params.id));

  app.get("/me/notification-prefs", async (req) => getNotificationPrefs(ctx, requireUser(req).id));

  app.put("/me/notification-prefs", async (req) => updateNotificationPrefs(ctx, requireUser(req).id, parse(customerApi.updateNotificationPrefsBody, req.body)));
}
