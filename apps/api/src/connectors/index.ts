import { clover } from "./clover/index.js";
import { googleBusiness } from "./google-business/index.js";
import { lightspeed } from "./lightspeed/index.js";
import { mailchimp } from "./mailchimp/index.js";
import { shopify } from "./shopify/index.js";
import { square } from "./square/index.js";
import { toast } from "./toast/index.js";
import type { Connector, ConnectorId, PosProviderId } from "./types.js";

export * from "./types.js";

export const CONNECTORS: Record<ConnectorId, Connector> = {
  square,
  clover,
  shopify,
  lightspeed,
  toast,
  google_business: googleBusiness,
  mailchimp,
};

export const POS_PROVIDERS: PosProviderId[] = ["square", "clover", "shopify", "lightspeed", "toast"];
export const isPosProvider = (p: string): p is PosProviderId => (POS_PROVIDERS as string[]).includes(p);

export function getConnector(id: string): Connector | null {
  return Object.prototype.hasOwnProperty.call(CONNECTORS, id) ? CONNECTORS[id as ConnectorId] : null;
}
