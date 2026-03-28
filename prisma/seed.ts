import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import path from "path";

const dbPath = path.resolve(process.cwd(), "dev.db");
const adapter = new PrismaBetterSqlite3({ url: dbPath });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🌱 Seeding database...");

  // Clean slate
  await prisma.testResult.deleteMany();
  await prisma.incident.deleteMany();
  await prisma.testFlow.deleteMany();
  await prisma.client.deleteMany();
  await prisma.alertConfig.deleteMany();
  await prisma.session.deleteMany();
  await prisma.account.deleteMany();
  await prisma.user.deleteMany();

  // ── User ────────────────────────────────────────────────────────────────
  const user = await prisma.user.create({
    data: {
      id: "user_bryan",
      name: "Bryan Oyloe",
      email: "boyloe@gmail.com",
      plan: "PRO",
    },
  });

  await prisma.alertConfig.create({
    data: {
      userId: user.id,
      email: true,
      telegram: "8633287384",
    },
  });

  // ── Client 1: Acme Corp (healthy) ───────────────────────────────────────
  const acme = await prisma.client.create({
    data: {
      userId: user.id,
      name: "Acme Corp",
      url: "https://acme-store.example.com",
    },
  });

  const acmeCheckout = await prisma.testFlow.create({
    data: {
      clientId: acme.id,
      name: "Checkout Flow",
      description: "Full purchase path from cart to confirmation",
      steps: JSON.stringify([
        "Navigate to /cart",
        "Verify cart has at least 1 item",
        "Click 'Proceed to Checkout'",
        "Fill in email: test@example.com",
        "Fill in shipping address",
        "Click 'Continue to Payment'",
        "Enter test card: 4242 4242 4242 4242",
        "Click 'Place Order'",
        "Expect 'Order Confirmed' on page",
      ]),
    },
  });

  const acmeLogin = await prisma.testFlow.create({
    data: {
      clientId: acme.id,
      name: "User Login",
      description: "Email + password sign in",
      steps: JSON.stringify([
        "Navigate to /login",
        "Fill in email: demo@acme.com",
        "Fill in password",
        "Click 'Sign In'",
        "Expect redirect to /dashboard",
        "Expect user avatar in nav",
      ]),
    },
  });

  const acmeSearch = await prisma.testFlow.create({
    data: {
      clientId: acme.id,
      name: "Product Search",
      description: "Search bar returns relevant results",
      steps: JSON.stringify([
        "Navigate to /",
        "Click search bar",
        "Type 'widget'",
        "Expect at least 1 result",
        "Click first result",
        "Expect product detail page to load",
      ]),
    },
  });

  // Acme results — all passing, last 7 days
  const now = new Date();
  for (const flow of [acmeCheckout, acmeLogin, acmeSearch]) {
    for (let i = 6; i >= 0; i--) {
      const ranAt = new Date(now);
      ranAt.setDate(ranAt.getDate() - i);
      await prisma.testResult.create({
        data: {
          flowId: flow.id,
          status: "PASS",
          durationMs: Math.floor(Math.random() * 3000) + 800,
          ranAt,
        },
      });
    }
  }

  // ── Client 2: TechBlog Pro (1 failing flow) ─────────────────────────────
  const techblog = await prisma.client.create({
    data: {
      userId: user.id,
      name: "TechBlog Pro",
      url: "https://techblog.example.com",
    },
  });

  const blogContact = await prisma.testFlow.create({
    data: {
      clientId: techblog.id,
      name: "Contact Form",
      description: "Visitor submits contact form",
      steps: JSON.stringify([
        "Navigate to /contact",
        "Fill in name: Test User",
        "Fill in email: test@example.com",
        "Fill in message",
        "Click 'Send Message'",
        "Expect 'Message sent!' confirmation",
      ]),
    },
  });

  const blogRSS = await prisma.testFlow.create({
    data: {
      clientId: techblog.id,
      name: "RSS Feed",
      description: "RSS endpoint returns valid XML",
      steps: JSON.stringify([
        "Navigate to /feed.xml",
        "Expect HTTP 200",
        "Expect Content-Type: application/xml",
        "Expect at least 5 <item> elements",
      ]),
    },
  });

  // Contact form — started failing 2 days ago
  for (let i = 6; i >= 3; i--) {
    const ranAt = new Date(now);
    ranAt.setDate(ranAt.getDate() - i);
    await prisma.testResult.create({
      data: { flowId: blogContact.id, status: "PASS", durationMs: 1200, ranAt },
    });
  }
  for (let i = 2; i >= 0; i--) {
    const ranAt = new Date(now);
    ranAt.setDate(ranAt.getDate() - i);
    await prisma.testResult.create({
      data: {
        flowId: blogContact.id,
        status: "FAIL",
        durationMs: 4800,
        error: "Form submission returned HTTP 500. Server error on POST /contact. Expected 'Message sent!' but page showed 'Internal Server Error'.",
        ranAt,
      },
    });
  }

  // RSS — passing
  for (let i = 6; i >= 0; i--) {
    const ranAt = new Date(now);
    ranAt.setDate(ranAt.getDate() - i);
    await prisma.testResult.create({
      data: { flowId: blogRSS.id, status: "PASS", durationMs: 340, ranAt },
    });
  }

  // Incident for the contact form failure
  await prisma.incident.create({
    data: {
      flowId: blogContact.id,
      title: "Contact form returning 500 error",
      description:
        "Form submission at /contact has been returning HTTP 500 since 2026-03-26. POST request to /contact fails at server level. Likely a broken backend route or misconfigured email handler.",
      status: "OPEN",
      alertSent: true,
      createdAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
    },
  });

  // ── Client 3: HealthTrack SaaS (recently recovered) ─────────────────────
  const healthtrack = await prisma.client.create({
    data: {
      userId: user.id,
      name: "HealthTrack SaaS",
      url: "https://healthtrack.example.com",
    },
  });

  const htLogin = await prisma.testFlow.create({
    data: {
      clientId: healthtrack.id,
      name: "Patient Login",
      description: "HIPAA-compliant login with MFA check",
      steps: JSON.stringify([
        "Navigate to /patient/login",
        "Fill in credentials",
        "Submit login form",
        "Expect MFA prompt",
        "Enter code: 123456",
        "Expect redirect to /patient/dashboard",
        "Verify no PHI shown without auth",
      ]),
    },
  });

  const htBooking = await prisma.testFlow.create({
    data: {
      clientId: healthtrack.id,
      name: "Appointment Booking",
      description: "Patient books appointment end-to-end",
      steps: JSON.stringify([
        "Navigate to /appointments/new",
        "Select provider from dropdown",
        "Choose available date slot",
        "Confirm appointment",
        "Expect confirmation email trigger",
        "Expect appointment in /appointments list",
      ]),
    },
  });

  // HealthTrack — had an outage 4 days ago, recovered
  for (const flow of [htLogin, htBooking]) {
    for (let i = 6; i >= 5; i--) {
      const ranAt = new Date(now);
      ranAt.setDate(ranAt.getDate() - i);
      await prisma.testResult.create({
        data: { flowId: flow.id, status: "PASS", durationMs: 1800, ranAt },
      });
    }
    // Outage days
    for (let i = 4; i >= 3; i--) {
      const ranAt = new Date(now);
      ranAt.setDate(ranAt.getDate() - i);
      await prisma.testResult.create({
        data: {
          flowId: flow.id,
          status: "FAIL",
          durationMs: 8000,
          error: "Page timed out after 8000ms. Site returned no response.",
          ranAt,
        },
      });
    }
    // Recovered
    for (let i = 2; i >= 0; i--) {
      const ranAt = new Date(now);
      ranAt.setDate(ranAt.getDate() - i);
      await prisma.testResult.create({
        data: { flowId: flow.id, status: "PASS", durationMs: 1650, ranAt },
      });
    }
  }

  // Resolved incident
  await prisma.incident.create({
    data: {
      flowId: htLogin.id,
      title: "Site unreachable — complete outage",
      description:
        "All flows failed for 48 hours starting 2026-03-24. Site returned no HTTP response. Resolved after hosting provider restarted the server.",
      status: "RESOLVED",
      alertSent: true,
      createdAt: new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000),
      resolvedAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
    },
  });

  console.log("✅ Done!");
  console.log(`   👤 User: ${user.email}`);
  console.log(`   🏢 3 clients seeded`);
  console.log(`   🔁 7 test flows`);
  console.log(`   📊 ${7 * 7 + 2} test results`);
  console.log(`   🚨 2 incidents (1 open, 1 resolved)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
