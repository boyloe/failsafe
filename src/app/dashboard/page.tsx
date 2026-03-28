import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";

export default async function DashboardPage() {
  const session = await auth();
  const userId = session!.user!.id as string;

  const [clients, recentResults] = await Promise.all([
    prisma.client.findMany({
      where: { userId },
      include: {
        flows: {
          include: {
            results: {
              orderBy: { ranAt: "desc" },
              take: 1,
            },
          },
        },
      },
    }),
    prisma.testResult.findMany({
      where: {
        flow: {
          client: { userId },
        },
      },
      orderBy: { ranAt: "desc" },
      take: 10,
      include: {
        flow: {
          include: { client: true },
        },
      },
    }),
  ]);

  const totalFlows = clients.reduce((acc, c) => acc + c.flows.length, 0);
  const passingFlows = clients.reduce(
    (acc, c) =>
      acc + c.flows.filter((f) => f.results[0]?.status === "PASS").length,
    0
  );
  const failingFlows = clients.reduce(
    (acc, c) =>
      acc + c.flows.filter((f) => f.results[0]?.status === "FAIL").length,
    0
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Overview</h1>
        <p className="text-gray-400 text-sm mt-1">
          Here&apos;s what&apos;s happening across all your monitored sites.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Sites monitored", value: clients.length },
          { label: "Total flows", value: totalFlows },
          { label: "Passing", value: passingFlows, color: "text-green-400" },
          { label: "Failing", value: failingFlows, color: "text-red-400" },
        ].map((stat) => (
          <div key={stat.label} className="card">
            <p className="text-xs text-gray-500 mb-1">{stat.label}</p>
            <p className={`text-3xl font-bold ${stat.color ?? "text-white"}`}>
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      {/* Recent results */}
      <div className="card">
        <h2 className="text-lg font-semibold mb-4">Recent test runs</h2>

        {recentResults.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500 mb-4">No tests run yet.</p>
            <Link href="/dashboard/clients" className="btn-primary">
              Add your first client →
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {recentResults.map((result) => (
              <div
                key={result.id}
                className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0"
              >
                <div>
                  <p className="text-sm font-medium">{result.flow.name}</p>
                  <p className="text-xs text-gray-500">{result.flow.client.name}</p>
                </div>
                <div className="flex items-center gap-3">
                  {result.durationMs && (
                    <span className="text-xs text-gray-500">
                      {result.durationMs}ms
                    </span>
                  )}
                  <span
                    className={
                      result.status === "PASS"
                        ? "badge-pass"
                        : result.status === "FAIL"
                        ? "badge-fail"
                        : "badge-error"
                    }
                  >
                    {result.status}
                  </span>
                  <span className="text-xs text-gray-600">
                    {new Date(result.ranAt).toLocaleTimeString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick actions */}
      {clients.length === 0 && (
        <div className="card border-dashed border-2 text-center py-12">
          <h3 className="text-lg font-semibold mb-2">Ready to start monitoring?</h3>
          <p className="text-gray-400 text-sm mb-6">
            Add your first client website and define the flows you want to test.
          </p>
          <Link href="/dashboard/clients" className="btn-primary">
            Add your first client →
          </Link>
        </div>
      )}
    </div>
  );
}
