import Link from "next/link";

const tiers = [
  {
    name: "Starter",
    price: 29,
    description: "Perfect for small sites and personal projects.",
    features: [
      "1 website",
      "3 test flows",
      "Daily testing",
      "Email alerts",
      "Uptime history",
    ],
    cta: "Get started",
    href: "/login",
    highlight: false,
  },
  {
    name: "Pro",
    price: 99,
    description: "For growing teams that need more coverage.",
    features: [
      "3 websites",
      "10 test flows",
      "Hourly testing",
      "Email + Slack alerts",
      "Incident reports",
      "Public status page",
    ],
    cta: "Start free trial",
    href: "/login",
    highlight: true,
  },
  {
    name: "Enterprise",
    price: 299,
    description: "Unlimited monitoring for mission-critical apps.",
    features: [
      "Unlimited websites",
      "Unlimited flows",
      "15-minute intervals",
      "All alert channels",
      "Priority support",
      "Custom SLA",
    ],
    cta: "Contact us",
    href: "/login",
    highlight: false,
  },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gray-950">
      {/* Nav */}
      <nav className="border-b border-gray-800 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-brand-400 text-xl">⬡</span>
            <span className="font-bold text-lg">QA Monitor</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/login" className="text-sm text-gray-400 hover:text-gray-100 transition-colors">
              Sign in
            </Link>
            <Link href="/login" className="btn-primary text-sm">
              Get started →
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 pt-24 pb-16 text-center">
        <div className="inline-flex items-center gap-2 rounded-full bg-brand-500/10 border border-brand-500/20 px-4 py-1.5 text-sm text-brand-400 mb-8">
          <span className="h-1.5 w-1.5 rounded-full bg-brand-400 animate-pulse" />
          Now monitoring 24/7
        </div>

        <h1 className="text-5xl md:text-6xl font-bold tracking-tight mb-6">
          Your site never sleeps.{" "}
          <span className="text-brand-400">Neither do we.</span>
        </h1>

        <p className="text-xl text-gray-400 max-w-2xl mx-auto mb-10">
          AI-powered QA testing that runs your critical user flows on autopilot. 
          Get instant alerts when something breaks — in plain English.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link href="/login" className="btn-primary px-8 py-3 text-base">
            Start monitoring free →
          </Link>
          <Link href="#pricing" className="btn-secondary px-8 py-3 text-base">
            See pricing
          </Link>
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-6xl mx-auto px-6 py-16">
        <h2 className="text-3xl font-bold text-center mb-4">How it works</h2>
        <p className="text-gray-400 text-center mb-12">Set it up once. It runs forever.</p>

        <div className="grid md:grid-cols-3 gap-6">
          {[
            {
              step: "01",
              title: "Add your flows",
              desc: "Describe the critical paths on your site — checkout, login, contact form. Plain English is fine.",
            },
            {
              step: "02",
              title: "We test automatically",
              desc: "Our AI browser runs your flows on schedule. Daily, hourly, or every 15 minutes depending on your plan.",
            },
            {
              step: "03",
              title: "Get instant alerts",
              desc: "When something breaks, you hear about it in seconds — with a plain-English description of what failed.",
            },
          ].map((item) => (
            <div key={item.step} className="card">
              <div className="text-brand-400 text-sm font-mono mb-3">{item.step}</div>
              <h3 className="text-lg font-semibold mb-2">{item.title}</h3>
              <p className="text-gray-400 text-sm leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="max-w-6xl mx-auto px-6 py-16">
        <h2 className="text-3xl font-bold text-center mb-4">Simple pricing</h2>
        <p className="text-gray-400 text-center mb-12">No surprises. Cancel anytime.</p>

        <div className="grid md:grid-cols-3 gap-6">
          {tiers.map((tier) => (
            <div
              key={tier.name}
              className={`card flex flex-col ${
                tier.highlight
                  ? "border-brand-500 ring-1 ring-brand-500"
                  : ""
              }`}
            >
              {tier.highlight && (
                <div className="text-xs font-medium text-brand-400 mb-4">MOST POPULAR</div>
              )}
              <div className="mb-6">
                <h3 className="text-lg font-semibold">{tier.name}</h3>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-4xl font-bold">${tier.price}</span>
                  <span className="text-gray-400">/mo</span>
                </div>
                <p className="mt-2 text-sm text-gray-400">{tier.description}</p>
              </div>

              <ul className="space-y-3 flex-1 mb-6">
                {tier.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm">
                    <span className="text-green-400">✓</span>
                    <span className="text-gray-300">{f}</span>
                  </li>
                ))}
              </ul>

              <Link
                href={tier.href}
                className={tier.highlight ? "btn-primary" : "btn-secondary"}
              >
                {tier.cta}
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-800 px-6 py-8">
        <div className="max-w-6xl mx-auto flex items-center justify-between text-sm text-gray-500">
          <div className="flex items-center gap-2">
            <span className="text-brand-400">⬡</span>
            <span>QA Monitor</span>
          </div>
          <span>© {new Date().getFullYear()} All rights reserved.</span>
        </div>
      </footer>
    </div>
  );
}
