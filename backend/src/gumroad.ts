import type { Env } from "./env";

// https://help.gumroad.com/article/76-license-keys
type VerifyResponse = {
  success: boolean;
  purchase?: {
    sale_id: string;
    product_id: string;
    refunded: boolean;
    chargebacked: boolean;
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
  return { saleId: data.purchase.sale_id, productId: data.purchase.product_id };
};
