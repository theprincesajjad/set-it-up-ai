/**
 * Commerce (Plus): catalog, order-ahead, pickup/drop-off slots and bookings.
 * Docs: docs/engineering/api/commerce.md. Contract: @ll/shared commerceApi.
 */
import type { FastifyInstance, FastifyRequest } from "fastify";
import { commerceApi, paginationQuery, type FeatureKey } from "@ll/shared";
import type { AppContext } from "../../context.js";
import { requireStaff, requireUser, type StaffRole } from "../../lib/auth.js";
import { featureLocked } from "../../lib/errors.js";
import { parse } from "../../lib/validate.js";
import * as bookingsSvc from "../../services/bookings.js";
import * as catalog from "../../services/catalog.js";
import * as dropoffSvc from "../../services/dropoff.js";
import { requirePermission, type StaffPermission } from "../../services/commerceShared.js";
import { getMerchantFeatures, requireFeature } from "../../services/features.js";
import * as ordersSvc from "../../services/orders.js";

type MerchantParams = { merchantId: string };

export default async function register(app: FastifyInstance, ctx: AppContext): Promise<void> {
  /** requireStaff + feature gate(s) + optional granular permission. */
  async function staffFor(req: FastifyRequest, minRole: StaffRole, features: FeatureKey[], perm?: StaffPermission) {
    const { merchantId } = req.params as MerchantParams;
    const staff = await requireStaff(ctx, req, merchantId, minRole);
    for (const f of features) await requireFeature(ctx.db, staff.merchant, f);
    if (perm) await requirePermission(ctx, staff, perm);
    return staff;
  }

  /** Either slot feature unlocks the shared slot/booking lists. */
  async function staffForSlots(req: FastifyRequest, minRole: StaffRole, kind?: string, perm?: StaffPermission) {
    if (kind) return staffFor(req, minRole, [bookingsSvc.slotFeature(kind)], perm);
    const { merchantId } = req.params as MerchantParams;
    const staff = await requireStaff(ctx, req, merchantId, minRole);
    const f = await getMerchantFeatures(ctx.db, staff.merchant);
    if (!f["booking.pickup_slots"].enabled && !f["booking.dropoff_scheduling"].enabled) {
      const pickup = f["booking.pickup_slots"];
      throw featureLocked("Pickup slots", pickup.lockedReason ?? "plan");
    }
    if (perm) await requirePermission(ctx, staff, perm);
    return staff;
  }

  // ---------------------------------------------------------------- catalog
  app.get<{ Params: MerchantParams }>("/merchants/:merchantId/catalog", async (req) => {
    const staff = await staffFor(req, "staff", ["orders.order_ahead"]);
    return catalog.getCatalog(ctx.db, staff.merchant.id);
  });

  app.post<{ Params: MerchantParams }>("/merchants/:merchantId/catalog/items", async (req, reply) => {
    const staff = await staffFor(req, "manager", ["orders.order_ahead"], "catalog.manage");
    const body = parse(commerceApi.createCatalogItemBody, req.body);
    return reply.status(201).send(await catalog.createItem(ctx.db, staff.merchant.id, body));
  });

  app.patch<{ Params: MerchantParams & { itemId: string } }>("/merchants/:merchantId/catalog/items/:itemId", async (req) => {
    const staff = await staffFor(req, "manager", ["orders.order_ahead"], "catalog.manage");
    const body = parse(commerceApi.updateCatalogItemBody, req.body);
    return catalog.updateItem(ctx.db, staff.merchant.id, req.params.itemId, body);
  });

  app.delete<{ Params: MerchantParams & { itemId: string } }>("/merchants/:merchantId/catalog/items/:itemId", async (req) => {
    const staff = await staffFor(req, "manager", ["orders.order_ahead"], "catalog.manage");
    return catalog.archiveItem(ctx.db, staff.merchant.id, req.params.itemId);
  });

  app.post<{ Params: MerchantParams }>("/merchants/:merchantId/catalog/categories", async (req, reply) => {
    const staff = await staffFor(req, "manager", ["orders.order_ahead"], "catalog.manage");
    const body = parse(commerceApi.createCategoryBody, req.body);
    return reply.status(201).send(await catalog.createCategory(ctx.db, staff.merchant.id, body));
  });

  app.patch<{ Params: MerchantParams & { categoryId: string } }>("/merchants/:merchantId/catalog/categories/:categoryId", async (req) => {
    const staff = await staffFor(req, "manager", ["orders.order_ahead"], "catalog.manage");
    const body = parse(commerceApi.updateCategoryBody, req.body);
    return catalog.updateCategory(ctx.db, staff.merchant.id, req.params.categoryId, body);
  });

  // ---------------------------------------------------------------- merchant orders
  app.get<{ Params: MerchantParams }>("/merchants/:merchantId/orders", async (req) => {
    const staff = await staffFor(req, "staff", ["orders.order_ahead"]);
    const q = parse(commerceApi.listOrdersQuery, req.query);
    return ordersSvc.listMerchantOrders(ctx.db, staff.merchant, q);
  });

  app.get<{ Params: MerchantParams & { orderId: string } }>("/merchants/:merchantId/orders/:orderId", async (req) => {
    const staff = await staffFor(req, "staff", ["orders.order_ahead"]);
    const order = await ordersSvc.getMerchantOrder(ctx.db, staff.merchant.id, req.params.orderId);
    return ordersSvc.loadOrderDto(ctx.db, order, true);
  });

  app.post<{ Params: MerchantParams & { orderId: string } }>("/merchants/:merchantId/orders/:orderId/status", async (req) => {
    const staff = await staffFor(req, "staff", ["orders.order_ahead"], "orders.manage");
    const body = parse(commerceApi.updateOrderStatusBody, req.body);
    return ordersSvc.updateOrderStatus(ctx, staff, req.params.orderId, body);
  });

  app.post<{ Params: MerchantParams & { orderId: string } }>("/merchants/:merchantId/orders/:orderId/refund", async (req) => {
    const staff = await staffFor(req, "manager", ["orders.order_ahead"], "orders.refund");
    const body = parse(commerceApi.refundOrderBody, req.body);
    return ordersSvc.refundOrder(ctx, staff, req.params.orderId, body.reason);
  });

  // ---------------------------------------------------------------- slots & bookings (merchant)
  app.post<{ Params: MerchantParams }>("/merchants/:merchantId/slots/generate", async (req, reply) => {
    const body = parse(commerceApi.generateSlotsBody, req.body);
    const staff = await staffForSlots(req, "manager", body.kind, "bookings.manage");
    return reply.status(201).send(await bookingsSvc.generateSlots(ctx, staff.merchant, body));
  });

  app.get<{ Params: MerchantParams }>("/merchants/:merchantId/slots", async (req) => {
    const q = parse(commerceApi.listSlotsQuery, req.query);
    const staff = await staffForSlots(req, "staff", q.kind);
    const items = await bookingsSvc.listSlots(ctx.db, staff.merchant.id, {
      kind: q.kind,
      locationId: q.locationId,
      from: q.from ? new Date(q.from) : ctx.now(),
      to: q.to ? new Date(q.to) : undefined,
    });
    return { items, nextCursor: null };
  });

  app.delete<{ Params: MerchantParams & { slotId: string } }>("/merchants/:merchantId/slots/:slotId", async (req, reply) => {
    const staff = await staffForSlots(req, "manager", undefined, "bookings.manage");
    await bookingsSvc.deleteSlot(ctx.db, staff.merchant.id, req.params.slotId);
    return reply.status(204).send();
  });

  app.get<{ Params: MerchantParams }>("/merchants/:merchantId/bookings", async (req) => {
    const q = parse(commerceApi.listSlotsQuery, req.query);
    const staff = await staffForSlots(req, "staff", q.kind);
    const items = await bookingsSvc.listMerchantBookings(ctx.db, staff.merchant, {
      kind: q.kind,
      from: q.from ? new Date(q.from) : new Date(ctx.now().getTime() - 86_400_000),
      to: q.to ? new Date(q.to) : undefined,
    });
    return { items, nextCursor: null };
  });

  app.patch<{ Params: MerchantParams & { bookingId: string } }>("/merchants/:merchantId/bookings/:bookingId", async (req) => {
    const staff = await staffForSlots(req, "staff", undefined, "bookings.manage");
    const body = parse(commerceApi.updateBookingBody, req.body);
    await bookingsSvc.setBookingStatus(ctx.db, staff.merchant, req.params.bookingId, body.status);
    return bookingsSvc.getBookingDto(ctx.db, { bookingId: req.params.bookingId, merchantId: staff.merchant.id });
  });

  // ---------------------------------------------------------------- rolling drop-off slots (settings; slots follow Locations hours)
  app.get<{ Params: MerchantParams }>("/merchants/:merchantId/dropoff-settings", async (req) => {
    const staff = await staffFor(req, "staff", ["booking.dropoff_scheduling"]);
    return dropoffSvc.dropoffSettings(staff.merchant);
  });

  app.put<{ Params: MerchantParams }>("/merchants/:merchantId/dropoff-settings", async (req) => {
    const staff = await staffFor(req, "manager", ["booking.dropoff_scheduling"], "bookings.manage");
    const body = parse(commerceApi.updateDropoffSettingsBody, req.body ?? {});
    return dropoffSvc.updateDropoffSettings(ctx, staff.merchant, body);
  });

  app.post<{ Params: MerchantParams }>("/merchants/:merchantId/dropoff-settings/block", async (req) => {
    const staff = await staffFor(req, "manager", ["booking.dropoff_scheduling"], "bookings.manage");
    const body = parse(commerceApi.blockDropoffDayBody, req.body);
    return dropoffSvc.blockDropoffDay(ctx, staff.merchant, body.date);
  });

  app.delete<{ Params: MerchantParams & { date: string } }>("/merchants/:merchantId/dropoff-settings/block/:date", async (req) => {
    const staff = await staffFor(req, "manager", ["booking.dropoff_scheduling"], "bookings.manage");
    return dropoffSvc.unblockDropoffDay(ctx, staff.merchant, parse(commerceApi.blockDropoffDayBody, { date: req.params.date }).date);
  });

  // ---------------------------------------------------------------- customer orders
  app.post("/me/orders", async (req, reply) => {
    const user = requireUser(req);
    const raw = (req.body ?? {}) as Record<string, unknown>;
    const header = req.headers["idempotency-key"];
    const body = parse(commerceApi.placeOrderBody, { ...raw, idempotencyKey: raw.idempotencyKey ?? (typeof header === "string" ? header : undefined) });
    const r = await ordersSvc.placeOrder(ctx, user.id, body);
    return reply.status(r.duplicate ? 200 : 201).send(r);
  });

  app.get("/me/orders", async (req) => {
    const user = requireUser(req);
    const q = parse(paginationQuery, req.query);
    return ordersSvc.listMyOrders(ctx.db, user.id, q);
  });

  app.get<{ Params: { orderId: string } }>("/me/orders/:orderId", async (req) => {
    const user = requireUser(req);
    const order = await ordersSvc.getMyOrder(ctx.db, user.id, req.params.orderId);
    return ordersSvc.loadOrderDto(ctx.db, order);
  });

  app.post<{ Params: { orderId: string } }>("/me/orders/:orderId/cancel", async (req) => {
    const user = requireUser(req);
    const body = parse(commerceApi.cancelMyOrderBody, req.body ?? {});
    return ordersSvc.cancelMyOrder(ctx, user.id, req.params.orderId, body.reason);
  });

  // ---------------------------------------------------------------- customer bookings
  app.post("/me/bookings", async (req, reply) => {
    const user = requireUser(req);
    const body = parse(commerceApi.createBookingBody, req.body);
    return reply.status(201).send(await bookingsSvc.createBooking(ctx, user.id, body));
  });

  app.get("/me/bookings", async (req) => {
    const user = requireUser(req);
    const past = (req.query as { past?: string }).past === "true";
    return { items: await bookingsSvc.listMyBookings(ctx.db, user.id, ctx.now(), past), nextCursor: null };
  });

  app.post<{ Params: { bookingId: string } }>("/me/bookings/:bookingId/cancel", async (req) => {
    const user = requireUser(req);
    await bookingsSvc.cancelBooking(ctx.db, { bookingId: req.params.bookingId, userId: user.id });
    return bookingsSvc.getBookingDto(ctx.db, { bookingId: req.params.bookingId, userId: user.id });
  });
}
