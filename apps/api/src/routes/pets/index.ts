/**
 * Pet care: pets and vaccine proof (`pets.profiles`), groom rebooking, daycare (`pets.daycare`), food cards (`pets.food_cards`)
 * and report cards (`pets.report_cards`). Contract: @ll/shared petApi. Docs: docs/engineering/api/pets.md.
 */
import type { FastifyInstance, FastifyRequest } from "fastify";
import { type FeatureKey, petApi, VACCINE_KINDS } from "@ll/shared";
import type { AppContext } from "../../context.js";
import { requireStaff, requireUser, type StaffRole } from "../../lib/auth.js";
import { eq } from "drizzle-orm";
import { merchants } from "@ll/db";
import { HttpError, badRequest, notFound } from "../../lib/errors.js";
import { parse } from "../../lib/validate.js";
import { IMAGE_TYPES, MAX_UPLOAD_BYTES, UPLOAD_PATH, getStorage, sniffImage, uploadSigner } from "../../providers/storage.js";
import { requirePermission } from "../../services/commerceShared.js";
import { requireFeature } from "../../services/features.js";
import * as daycare from "../../services/pet-daycare.js";
import * as food from "../../services/pet-food.js";
import * as svc from "../../services/pets.js";

type MerchantParams = { merchantId: string };
type PetParams = MerchantParams & { petId: string };
type IdParams = MerchantParams & { id: string };

const kindOf = (k: string) => {
  const r = petApi.vaccineKindParam.safeParse(k);
  if (!r.success) throw badRequest(`Vaccine kind is one of ${VACCINE_KINDS.join(", ")}.`);
  return r.data;
};

export default async function register(app: FastifyInstance, ctx: AppContext): Promise<void> {
  async function staffFor(req: FastifyRequest, minRole: StaffRole, feature: FeatureKey, perm: "bookings.manage" | "orders.manage" | null) {
    const { merchantId } = req.params as MerchantParams;
    const staff = await requireStaff(ctx, req, merchantId, minRole);
    await requireFeature(ctx.db, staff.merchant, feature);
    if (perm) await requirePermission(ctx, staff, perm);
    return staff;
  }
  const profiles = (req: FastifyRequest, minRole: StaffRole = "staff") => staffFor(req, minRole, "pets.profiles", "bookings.manage");
  const dc = (req: FastifyRequest, minRole: StaffRole = "staff") => staffFor(req, minRole, "pets.daycare", "bookings.manage");
  const fc = (req: FastifyRequest, minRole: StaffRole = "staff") => staffFor(req, minRole, "pets.food_cards", "orders.manage");

  // ---------------------------------------------------------------- pets (staff)
  app.get<{ Params: MerchantParams }>("/merchants/:merchantId/pets", async (req) => svc.listPets(ctx, (await profiles(req)).merchant, parse(petApi.petListQuery, req.query)));
  app.post<{ Params: MerchantParams }>("/merchants/:merchantId/pets", async (req, reply) => reply.status(201).send(await svc.createPetForMember(ctx, await profiles(req), parse(petApi.staffPetBody, req.body))));
  // Fixed paths before /pets/:petId so they are not read as an id.
  app.get<{ Params: MerchantParams }>("/merchants/:merchantId/pets/rebooking", async (req) => svc.rebookingOverview(ctx, (await profiles(req)).merchant));
  app.post<{ Params: MerchantParams }>("/merchants/:merchantId/pets/rebooking/send", async (req) => svc.sendRebooking(ctx, (await profiles(req)).merchant, parse(petApi.rebookingSendBody, req.body)));
  app.get<{ Params: MerchantParams }>("/merchants/:merchantId/pets/settings", async (req) => svc.getPetSettings(ctx, (await staffFor(req, "staff", "pets.profiles", null)).merchant.id));
  app.put<{ Params: MerchantParams }>("/merchants/:merchantId/pets/settings", async (req) => svc.savePetSettings(ctx, (await profiles(req, "manager")).merchant.id, parse(petApi.petSettingsBody, req.body)));
  app.get<{ Params: PetParams }>("/merchants/:merchantId/pets/:petId", async (req) => svc.getPet(ctx, (await profiles(req)).merchant, req.params.petId));
  app.put<{ Params: PetParams }>("/merchants/:merchantId/pets/:petId/shop", async (req) => svc.putPetShop(ctx, await profiles(req), req.params.petId, parse(petApi.petShopBody, req.body)));
  app.put<{ Params: PetParams & { kind: string } }>("/merchants/:merchantId/pets/:petId/vaccines/:kind", async (req) => svc.setVaccineAsStaff(ctx, await profiles(req), req.params.petId, kindOf(req.params.kind), parse(petApi.vaccineBody, req.body)));
  // A groom logged without a report card moves the cadence (the same as a report card with send off).
  app.post<{ Params: PetParams }>("/merchants/:merchantId/pets/:petId/report-card", async (req, reply) => {
    const staff = await staffFor(req, "staff", "pets.report_cards", "bookings.manage");
    return reply.status(201).send(await svc.sendReportCard(ctx, staff, req.params.petId, parse(petApi.reportCardBody, req.body)));
  });
  // Report-card photos: the shop's upload (same bytes and checks as ticket photos).
  app.post<{ Params: MerchantParams }>("/merchants/:merchantId/pets-uploads", async (req, reply): Promise<petApi.UploadResponse> => {
    const staff = await staffFor(req, "staff", "pets.report_cards", "bookings.manage");
    return reply.status(201).send(await storeUpload(req, staff.merchant.id));
  });

  // ---------------------------------------------------------------- daycare (staff)
  app.get<{ Params: MerchantParams; Querystring: { day?: string } }>("/merchants/:merchantId/daycare/day", async (req) => {
    const day = typeof req.query.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.day) ? req.query.day : undefined;
    return daycare.dayBoard(ctx, (await dc(req)).merchant, day);
  });
  app.post<{ Params: MerchantParams }>("/merchants/:merchantId/daycare/stays", async (req, reply) => reply.status(201).send(await daycare.expectStay(ctx, await dc(req), parse(petApi.stayBody, req.body))));
  app.post<{ Params: IdParams }>("/merchants/:merchantId/daycare/stays/:id/check-in", async (req) => daycare.checkIn(ctx, await dc(req), req.params.id, parse(petApi.checkInBody, req.body ?? {})));
  app.post<{ Params: IdParams }>("/merchants/:merchantId/daycare/stays/:id/check-out", async (req) => daycare.checkOut(ctx, await dc(req), req.params.id));
  app.post<{ Params: IdParams }>("/merchants/:merchantId/daycare/stays/:id/no-show", async (req) => daycare.closeStay(ctx, await dc(req), req.params.id, "no_show"));
  app.post<{ Params: IdParams }>("/merchants/:merchantId/daycare/stays/:id/cancel", async (req) => daycare.closeStay(ctx, await dc(req), req.params.id, "cancelled"));
  app.get<{ Params: MerchantParams }>("/merchants/:merchantId/daycare/packs", async (req) => ({ items: await daycare.listPacks(ctx, (await dc(req)).merchant) }));
  app.post<{ Params: MerchantParams }>("/merchants/:merchantId/daycare/packs", async (req, reply) => reply.status(201).send(await daycare.sellPack(ctx, await dc(req), parse(petApi.packBody, req.body))));

  // ---------------------------------------------------------------- food cards (staff)
  app.get<{ Params: MerchantParams }>("/merchants/:merchantId/food/programs", async (req) => ({ programs: await food.listPrograms(ctx, (await staffFor(req, "staff", "pets.food_cards", null)).merchant) }));
  app.post<{ Params: MerchantParams }>("/merchants/:merchantId/food/programs", async (req, reply) => reply.status(201).send(await food.createProgram(ctx, await staffFor(req, "manager", "pets.food_cards", null), parse(petApi.foodProgramBody, req.body))));
  app.put<{ Params: IdParams }>("/merchants/:merchantId/food/programs/:id", async (req) => food.updateProgram(ctx, await staffFor(req, "manager", "pets.food_cards", null), req.params.id, parse(petApi.foodProgramBody.partial(), req.body)));
  app.post<{ Params: IdParams }>("/merchants/:merchantId/food/programs/:id/skus", async (req, reply) => reply.status(201).send(await food.addSku(ctx, await staffFor(req, "manager", "pets.food_cards", null), req.params.id, parse(petApi.foodSkuBody, req.body))));
  app.get<{ Params: MerchantParams; Querystring: { memberId?: string } }>("/merchants/:merchantId/food/cards", async (req) => {
    const staff = await fc(req);
    const memberId = typeof req.query.memberId === "string" ? req.query.memberId : "";
    if (!memberId) throw badRequest("memberId is required");
    return food.memberCards(ctx, staff.merchant, memberId);
  });
  app.post<{ Params: MerchantParams }>("/merchants/:merchantId/food/punch", async (req) => food.punch(ctx, await fc(req), parse(petApi.punchBody, req.body)));
  app.post<{ Params: IdParams }>("/merchants/:merchantId/food/cards/:id/redeem", async (req) => food.redeem(ctx, await fc(req), req.params.id));
  app.post<{ Params: IdParams }>("/merchants/:merchantId/food/cards/:id/undo", async (req) => food.undoLast(ctx, await fc(req), req.params.id));
  app.get<{ Params: MerchantParams }>("/merchants/:merchantId/food/runout", async (req) => food.runOutOverview(ctx, (await fc(req)).merchant));
  app.post<{ Params: MerchantParams }>("/merchants/:merchantId/food/runout/send", async (req) => {
    const staff = await fc(req);
    const body = (req.body ?? {}) as { cardIds?: string[] };
    return food.sendRunOuts(ctx, staff.merchant, { cardIds: Array.isArray(body.cardIds) ? body.cardIds : undefined });
  });

  // ---------------------------------------------------------------- owner
  app.get("/me/pets", async (req) => svc.listMyPets(ctx, requireUser(req)));
  app.post("/me/pets", async (req, reply) => reply.status(201).send(await svc.createMyPet(ctx, requireUser(req), parse(petApi.petBody, req.body))));
  app.patch<{ Params: { id: string } }>("/me/pets/:id", async (req) => svc.updateMyPet(ctx, requireUser(req), req.params.id, parse(petApi.updatePetBody, req.body)));
  app.delete<{ Params: { id: string } }>("/me/pets/:id", async (req, reply) => {
    await svc.deleteMyPet(ctx, requireUser(req), req.params.id);
    return reply.status(204).send();
  });
  app.put<{ Params: { id: string; kind: string } }>("/me/pets/:id/vaccines/:kind", async (req) => svc.setMyVaccine(ctx, requireUser(req), req.params.id, kindOf(req.params.kind), parse(petApi.vaccineBody, req.body)));
  // The certificate photo: kept under the owner's own id, shown by short-lived signed link.
  app.post("/me/pets-uploads", async (req, reply): Promise<petApi.UploadResponse> => reply.status(201).send(await storeUpload(req, requireUser(req).id)));
  app.get("/me/food-cards", async (req) => food.myFoodCards(ctx, requireUser(req).id));
  app.put<{ Params: { id: string } }>("/me/food-cards/:id/remind", async (req) => food.setMyRemind(ctx, requireUser(req).id, req.params.id, parse(petApi.myRemindBody, req.body)));

  // ---------------------------------------------------------------- public: a report card page
  app.get<{ Params: { token: string } }>("/public/visits/:token", async (req, reply) => {
    reply.header("cache-control", "no-store");
    return svc.publicVisit(ctx, req.params.token);
  });

  // The shop page's blurb: the food card deal and the daycare packs, so the real hook is visible before someone joins.
  app.get<{ Params: { slug: string } }>("/public/shops/:slug/pets", async (req, reply) => {
    reply.header("cache-control", "public, max-age=60");
    const [m] = await ctx.db.select().from(merchants).where(eq(merchants.slug, req.params.slug)).limit(1);
    if (!m || m.status === "closed") throw notFound("Shop");
    return svc.publicPetInfo(ctx, m);
  });

  async function storeUpload(req: FastifyRequest, namespace: string): Promise<petApi.UploadResponse> {
    const type = String(req.headers["content-type"] ?? "").split(";")[0]!.trim().toLowerCase();
    const body = req.body;
    if (!(type in IMAGE_TYPES) || !Buffer.isBuffer(body)) throw new HttpError(415, "unsupported_media_type", "Upload a JPEG, PNG, WebP or HEIC photo.");
    if (body.length > MAX_UPLOAD_BYTES) throw new HttpError(413, "too_large", "That photo is over 5 MB. Try a smaller one.");
    const real = sniffImage(body);
    if (!real) throw badRequest("That file isn't a photo we can read.");
    const stored = await getStorage(ctx).put({ merchantId: namespace, contentType: real, body });
    return { url: uploadSigner(ctx)(`${UPLOAD_PATH}${stored.key}`), contentType: real, bytes: body.length };
  }
}
