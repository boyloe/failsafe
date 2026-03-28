import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { PLAN_PRICES } from "@/lib/stripe";
import { createBillingPortalSession } from "@/lib/stripe";
import PlanCard from "./PlanCard";
import AlertConfigForm from "./AlertConfigForm";

interface Props {
  searchParams: Promise<{ upgrade?: string }>;
}

export default async function SettingsPage({ searchParams }: Props) {
  const { upgrade } = await searchParams;
  const session = await auth();
  const userId = session!.user!.id as string;

  const [user, alertConfig] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.alertConfig.findUnique({ where: { userId } }),
  ]);

  if (!user) redirect("/login");

  // Server action — update alert config
  async function updateAlertConfig(formData: FormData) {
    "use server";
    const session = await auth();
    const userId = session!.user!.id as string;

    const telegram = formData.get("telegram") as string;
    const slack = formData.get("slack") as string;
    const emailEnabled = formData.get("email") === "on";

    await prisma.alertConfig.upsert({
      where: { userId },
      create: { userId, email: emailEnabled, telegram: telegram || null, slack: slack || null },
      update: { email: emailEnabled, telegram: telegram || null, slack: slack || null },
    });

    redirect("/dashboard/settings?saved=1");
  }

  // Server action — open Stripe billing portal
  async function openBillingPortal() {
    "use server";
    const session = await auth();
    const userId = session!.user!.id as string;
    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (!user?.stripeCustomerId) redirect("/dashboard/settings");

    const url = await createBillingPortalSession({
      stripeCustomerId: user.stripeCustomerId,
    });
    redirect(url);
  }

  const currentPlan = user.plan;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-gray-400 text-sm mt-1">Manage your plan and alert preferences.</p>
      </div>

      {/* Upgrade/cancel banners */}
      {upgrade === "success" && (
        <div className="rounded-lg bg-green-900/30 border border-green-700 px-4 py-3 text-sm text-green-300">
          ✅ Plan upgraded successfully! Your new limits are active immediately.
        </div>
      )}
      {upgrade === "cancelled" && (
        <div className="rounded-lg bg-gray-800 border border-gray-700 px-4 py-3 text-sm text-gray-400">
          Upgrade cancelled — no changes made.
        </div>
      )}

      {/* Current plan */}
      <div className="card">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-base font-semibold">Billing & Plan</h2>
            <p className="text-sm text-gray-400 mt-0.5">
              You&apos;re on the{" "}
              <span className="text-brand-400 font-medium">
                {PLAN_PRICES[currentPlan].name}
              </span>{" "}
              plan · {PLAN_PRICES[currentPlan].description}
            </p>
          </div>

          {user.stripeCustomerId && (
            <form action={openBillingPortal}>
              <button type="submit" className="btn-secondary text-xs">
                Manage billing →
              </button>
            </form>
          )}
        </div>

        {/* Plan cards */}
        <div className="grid md:grid-cols-3 gap-4">
          {(Object.keys(PLAN_PRICES) as Array<keyof typeof PLAN_PRICES>).map((plan) => (
            <PlanCard
              key={plan}
              plan={plan}
              details={PLAN_PRICES[plan]}
              isCurrent={plan === currentPlan}
              userId={userId}
            />
          ))}
        </div>
      </div>

      {/* Alert config */}
      <AlertConfigForm
        action={updateAlertConfig}
        defaultValues={{
          email: alertConfig?.email ?? true,
          telegram: alertConfig?.telegram ?? "",
          slack: alertConfig?.slack ?? "",
        }}
        userEmail={user.email!}
      />
    </div>
  );
}
