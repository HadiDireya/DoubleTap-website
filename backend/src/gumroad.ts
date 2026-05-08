import type { Env } from "./env";

// https://help.gumroad.com/article/76-license-keys
type VerifyResponse = {
  success: boolean;
  purchase?: {
    sale_id: string;
    product_id: string;
    refunded: boolean;
    chargebacked: boolean;
    email?: string;
    // Variant string the buyer picked at checkout, e.g.
    // "(2 Mac Licences)" or "Personal". Seats are encoded as the first
    // integer; absence of digits implies the single-seat tier.
    variants?: string;
  };
};

export const verifyLicense = async (env: Env, licenseKey: string) => {
  const res = await fetch("https://api.gumroad.com/v2/licenses/verify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      product_id: env.GUMROAD_PRODUCT_ID,
      license_key: licenseKey,
      increment_uses_count: "false",
    }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as VerifyResponse;
  if (!data.success || !data.purchase) return null;
  if (data.purchase.refunded || data.purchase.chargebacked) return null;
  return {
    saleId: data.purchase.sale_id,
    productId: data.purchase.product_id,
    email: typeof data.purchase.email === "string" ? data.purchase.email : null,
    variants: typeof data.purchase.variants === "string" ? data.purchase.variants : "",
  };
};

// Pull the seat count out of a Gumroad variant string. Mirrors the
// regex in DoubleTap/license-server/src/index.ts:parseMaxUses so both
// the license-server and this Worker derive the same value from the
// same Gumroad payload — drift here means a buyer's seats disagree
// between activation (license-server) and admin display (this Worker).
//
// Behaviour: first integer wins (e.g. "(2 Mac Licences)" → 2,
// "5-Mac Family Pack" → 5). No integer → 1, which is also the right
// default for the Personal tier whose variant name is just "Personal".
export const parseMaxUsesFromVariants = (variants: string): number => {
  const match = variants.match(/\d+/);
  return match ? parseInt(match[0], 10) : 1;
};
