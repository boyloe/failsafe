import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createCheckoutSession, type PlanKey } from "@/lib/stripe";
import { stripeLogger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { plan } = await req.json() as { plan: PlanKey };
  if (!plan || !["STARTER", "PRO", "ENTERPRISE"].includes(plan)) {
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id as string },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  try {
    const url = await createCheckoutSession({
      userId: user.id,
      userEmail: user.email!,
      plan,
      stripeCustomerId: user.stripeCustomerId,
    });
    stripeLogger.info("Checkout session created", { userId: user.id, plan });
    return NextResponse.json({ url });
  } catch (err) {
    stripeLogger.error("Failed to create checkout session", {
      userId: user.id,
      plan,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Failed to create checkout session" }, { status: 500 });
  }
}
