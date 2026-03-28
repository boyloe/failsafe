import Stripe from "stripe";

function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY is not set");
  }
  return new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: "2026-03-25.dahlia",
  });
}

// Lazy singleton
let _stripe: Stripe | null = null;
export function getStripeClient(): Stripe {
  if (!_stripe) _stripe = getStripe();
  return _stripe;
}

// Convenience alias — only call at runtime (not module load time)
export const stripe = new Proxy({} as Stripe, {
  get(_target, prop) {
    return (getStripeClient() as unknown as Record<string | symbol, unknown>)[prop];
  },
});

// ── Plan → Stripe price mapping ──────────────────────────────────────────────
// Fill these in after creating products in Stripe dashboard

export const PLAN_PRICES = {
  STARTER: {
    priceId: process.env.STRIPE_STARTER_PRICE_ID ?? "",
    name: "Starter",
    amount: 2900, // $29/mo in cents
    interval: "month" as const,
    description: "1 website · 3 flows · daily testing",
    features: ["1 website", "3 test flows", "Daily testing", "Email + Telegram alerts"],
  },
  PRO: {
    priceId: process.env.STRIPE_PRO_PRICE_ID ?? "",
    name: "Pro",
    amount: 9900,
    interval: "month" as const,
    description: "3 websites · 10 flows · hourly testing",
    features: ["3 websites", "10 test flows", "Hourly testing", "All alert channels", "Public status page"],
  },
  ENTERPRISE: {
    priceId: process.env.STRIPE_ENTERPRISE_PRICE_ID ?? "",
    name: "Enterprise",
    amount: 29900,
    interval: "month" as const,
    description: "Unlimited · 15-min intervals",
    features: ["Unlimited websites", "Unlimited flows", "15-min intervals", "Priority support"],
  },
} as const;

export type PlanKey = keyof typeof PLAN_PRICES;

// ── Helpers ───────────────────────────────────────────────────────────────────

export async function createCheckoutSession({
  userId,
  userEmail,
  plan,
  stripeCustomerId,
}: {
  userId: string;
  userEmail: string;
  plan: PlanKey;
  stripeCustomerId?: string | null;
}): Promise<string> {
  const priceId = PLAN_PRICES[plan].priceId;
  if (!priceId) throw new Error(`No price ID configured for plan: ${plan}`);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: stripeCustomerId ?? undefined,
    customer_email: stripeCustomerId ? undefined : userEmail,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${appUrl}/dashboard/settings?upgrade=success`,
    cancel_url: `${appUrl}/dashboard/settings?upgrade=cancelled`,
    metadata: { userId, plan },
    subscription_data: {
      metadata: { userId, plan },
    },
    allow_promotion_codes: true,
  });

  return session.url!;
}

export async function createBillingPortalSession({
  stripeCustomerId,
}: {
  stripeCustomerId: string;
}): Promise<string> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const session = await stripe.billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: `${appUrl}/dashboard/settings`,
  });

  return session.url;
}

export async function getSubscription(stripeCustomerId: string) {
  const subscriptions = await stripe.subscriptions.list({
    customer: stripeCustomerId,
    status: "active",
    limit: 1,
  });
  return subscriptions.data[0] ?? null;
}
