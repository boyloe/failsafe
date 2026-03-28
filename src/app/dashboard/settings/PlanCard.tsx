"use client";

import { useState } from "react";
import { PLAN_PRICES, type PlanKey } from "@/lib/stripe";

interface Props {
  plan: PlanKey;
  details: (typeof PLAN_PRICES)[PlanKey];
  isCurrent: boolean;
  userId: string;
}

export default function PlanCard({ plan, details, isCurrent }: Props) {
  const [loading, setLoading] = useState(false);

  async function handleUpgrade() {
    setLoading(true);
    const res = await fetch("/api/stripe/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan }),
    });
    const { url, error } = await res.json();
    if (error) {
      alert(error);
      setLoading(false);
      return;
    }
    window.location.href = url;
  }

  const price = (details.amount / 100).toFixed(0);

  return (
    <div
      className={`rounded-xl border p-5 flex flex-col gap-3 transition-colors ${
        isCurrent
          ? "border-brand-500 bg-brand-500/5"
          : "border-gray-700 bg-gray-800/50"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="font-semibold text-sm">{details.name}</span>
        {isCurrent && (
          <span className="text-xs font-medium text-brand-400 bg-brand-500/10 px-2 py-0.5 rounded-full">
            Current
          </span>
        )}
      </div>

      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-bold">${price}</span>
        <span className="text-xs text-gray-400">/mo</span>
      </div>

      <ul className="space-y-1.5 flex-1">
        {details.features.map((f) => (
          <li key={f} className="flex items-center gap-2 text-xs text-gray-400">
            <span className="text-green-400">✓</span>
            {f}
          </li>
        ))}
      </ul>

      {!isCurrent && (
        <button
          onClick={handleUpgrade}
          disabled={loading}
          className="btn-primary w-full text-xs mt-1"
        >
          {loading ? "Redirecting..." : `Upgrade to ${details.name}`}
        </button>
      )}
    </div>
  );
}
