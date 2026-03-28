import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function ClientsPage() {
  const session = await auth();
  const userId = session!.user!.id as string;

  const clients = await prisma.client.findMany({
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
    orderBy: { createdAt: "desc" },
  });

  async function createClient(formData: FormData) {
    "use server";
    const session = await auth();
    const userId = session!.user!.id as string;

    const name = formData.get("name") as string;
    const url = formData.get("url") as string;

    if (!name || !url) return;

    await prisma.client.create({
      data: { userId, name, url },
    });

    redirect("/dashboard/clients");
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Clients</h1>
          <p className="text-gray-400 text-sm mt-1">
            Manage the websites you&apos;re monitoring.
          </p>
        </div>
      </div>

      {/* Add client form */}
      <div className="card">
        <h2 className="text-base font-semibold mb-4">Add new client</h2>
        <form action={createClient} className="flex flex-col sm:flex-row gap-3">
          <input
            name="name"
            type="text"
            placeholder="Client name (e.g. Acme Corp)"
            required
            className="input flex-1"
          />
          <input
            name="url"
            type="url"
            placeholder="https://example.com"
            required
            className="input flex-1"
          />
          <button type="submit" className="btn-primary whitespace-nowrap">
            Add client
          </button>
        </form>
      </div>

      {/* Client list */}
      {clients.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-gray-500">No clients yet. Add one above to get started.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {clients.map((client) => {
            const totalFlows = client.flows.length;
            const passing = client.flows.filter(
              (f) => f.results[0]?.status === "PASS"
            ).length;
            const failing = client.flows.filter(
              (f) => f.results[0]?.status === "FAIL"
            ).length;

            return (
              <div key={client.id} className="card">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="font-semibold">{client.name}</h3>
                      {failing > 0 ? (
                        <span className="badge-fail">
                          {failing} failing
                        </span>
                      ) : totalFlows > 0 ? (
                        <span className="badge-pass">All passing</span>
                      ) : null}
                    </div>
                    <p className="text-sm text-gray-500 truncate">{client.url}</p>
                  </div>

                  <div className="flex items-center gap-3 ml-4 flex-shrink-0">
                    <span className="text-xs text-gray-500">
                      {totalFlows} flow{totalFlows !== 1 ? "s" : ""}
                    </span>
                    <Link
                      href={`/dashboard/clients/${client.id}`}
                      className="btn-secondary text-xs"
                    >
                      Manage →
                    </Link>
                  </div>
                </div>

                {/* Flow summary */}
                {client.flows.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-gray-800 flex flex-wrap gap-2">
                    {client.flows.map((flow) => {
                      const lastResult = flow.results[0];
                      return (
                        <div
                          key={flow.id}
                          className="flex items-center gap-1.5 bg-gray-800 rounded-lg px-2.5 py-1"
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              !lastResult
                                ? "bg-gray-500"
                                : lastResult.status === "PASS"
                                ? "bg-green-400"
                                : "bg-red-400"
                            }`}
                          />
                          <span className="text-xs text-gray-300">{flow.name}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
