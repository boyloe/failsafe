import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { stripeLogger } from "@/lib/logger";
import type { Plan } from "@prisma/client";
import type Stripe from "stripe";

// Stripe requires raw body for webhook signature verification
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !webhookSecret) {
    return NextResponse.json({ error: "Missing signature or secret" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err) {
    stripeLogger.error("Webhook signature verification failed", { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      // ── Checkout completed → subscription created ─────────────────────────
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const { userId, plan } = session.metadata ?? {};

        if (!userId || !plan) break;

        await prisma.user.update({
          where: { id: userId },
          data: {
            plan: plan as Plan,
            stripeCustomerId: session.customer as string,
          },
        });

        stripeLogger.info("User upgraded", { userId, plan });
        break;
      }

      // ── Subscription updated (plan change) ────────────────────────────────
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const { userId, plan } = sub.metadata ?? {};

        if (!userId || !plan) break;

        await prisma.user.update({
          where: { id: userId },
          data: { plan: plan as Plan },
        });

        stripeLogger.info("User plan updated", { userId, plan });
        break;
      }

      // ── Subscription cancelled / expired → downgrade to STARTER ──────────
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const { userId } = sub.metadata ?? {};

        if (!userId) break;

        await prisma.user.update({
          where: { id: userId },
          data: { plan: "STARTER" },
        });

        stripeLogger.info("User downgraded to STARTER", { userId });
        break;
      }

      // ── Payment failed → notify user (optional: send Telegram alert) ──────
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;

        const user = await prisma.user.findFirst({
          where: { stripeCustomerId: customerId },
          include: { accounts: false },
        });

        if (user) {
          const alertConfig = await prisma.alertConfig.findUnique({
            where: { userId: user.id },
          });

          if (alertConfig?.telegram && process.env.TELEGRAM_BOT_TOKEN) {
            const token = process.env.TELEGRAM_BOT_TOKEN;
            await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                chat_id: alertConfig.telegram,
                text: `⚠️ *QA Monitor: Payment failed*\n\nWe couldn't process your payment. Please update your billing info to keep monitoring active.\n\n[Update billing](${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings)`,
                parse_mode: "Markdown",
              }),
            });
          }

          stripeLogger.warn("Payment failed", { userId: user.id, customerId });
        }
        break;
      }

      default:
        break;
    }
  } catch (err) {
    stripeLogger.error("Webhook handler error", { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
