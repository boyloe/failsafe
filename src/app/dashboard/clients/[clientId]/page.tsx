import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";

interface Props {
  params: Promise<{ clientId: string }>;
}

export default async function ClientDetailPage({ params }: Props) {
  const { clientId } = await params;
  const session = await auth();
  const userId = session!.user!.id as string;

  const client = await prisma.client.findFirst({
    where: { id: clientId, userId },
    include: {
      flows: {
        include: {
          results: {
            orderBy: { ranAt: "desc" },
            take: 5,
          },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!client) notFound();

  async function addFlow(formData: FormData) {
    "use server";
    const session = await auth();
    const userId = session!.user!.id as string;

    // Re-verify ownership
    const clientCheck = await prisma.client.findFirst({
      where: { id: clientId, userId },
    });
    if (!clientCheck) return;

    const name = formData.get("name") as string;
    const description = formData.get("description") as string;
    const steps = formData.get("steps") as string;

    if (!name || !steps) return;

    // Validate steps is parseable JSON or treat as plain text list
    let stepsJson: string;
    try {
      JSON.parse(steps);
      stepsJson = steps;
    } catch {
      // Treat as newline-delimited steps, convert to JSON array
      const stepsArr = steps.split("\n").map((s) => s.trim()).filter(Boolean);
      stepsJson = JSON.stringify(stepsArr);
    }

    await prisma.testFlow.create({
      data: { clientId, name, description, steps: stepsJson },
    });

    redirect(`/dashboard/clients/${clientId}`);
  }

  async function deleteClient(formData: FormData) {
    "use server";
    const session = await auth();
    const userId = session!.user!.id as string;

    await prisma.client.deleteMany({
      where: { id: clientId, userId },
    });

    redirect("/dashboard/clients");
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
            <Link href="/dashboard/clients" className="hover:text-gray-300 transition-colors">
              Clients
            </Link>
            <span>/</span>
            <span className="text-gray-300">{client.name}</span>
          </div>
          <h1 className="text-2xl font-bold">{client.name}</h1>
          <a
            href={client.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-brand-400 hover:underline"
          >
            {client.url} ↗
          </a>
        </div>

        <form action={deleteClient}>
          <button
            type="submit"
            className="btn-danger text-xs"
            onClick={(e) => {
              if (!confirm(`Delete ${client.name}? This removes all test history.`)) {
                e.preventDefault();
              }
            }}
          >
            Delete client
          </button>
        </form>
      </div>

      {/* Add flow form */}
      <div className="card">
        <h2 className="text-base font-semibold mb-4">Add test flow</h2>
        <form action={addFlow} className="space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <input
              name="name"
              type="text"
              placeholder="Flow name (e.g. Checkout Flow)"
              required
              className="input"
            />
            <input
              name="description"
              type="text"
              placeholder="Description (optional)"
              className="input"
            />
          </div>
          <textarea
            name="steps"
            placeholder={`Describe the steps to test, one per line:\n1. Go to /cart\n2. Click checkout\n3. Fill in email field\n4. Submit form\n5. Expect "Thank you" on page`}
            required
            rows={5}
            className="input font-mono text-xs resize-y"
          />
          <button type="submit" className="btn-primary">
            Add flow
          </button>
        </form>
      </div>

      {/* Flows */}
      {client.flows.length === 0 ? (
        <div className="card text-center py-10">
          <p className="text-gray-500">No test flows yet. Add one above.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Test flows</h2>
          {client.flows.map((flow) => {
            const lastResult = flow.results[0];
            const steps = JSON.parse(flow.steps) as string[];

            return (
              <div key={flow.id} className="card">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`h-2 w-2 rounded-full flex-shrink-0 ${
                          !lastResult
                            ? "bg-gray-500"
                            : lastResult.status === "PASS"
                            ? "bg-green-400"
                            : "bg-red-400"
                        }`}
                      />
                      <h3 className="font-medium">{flow.name}</h3>
                    </div>
                    {flow.description && (
                      <p className="text-sm text-gray-500 mt-0.5 ml-4">
                        {flow.description}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {lastResult ? (
                      <span
                        className={
                          lastResult.status === "PASS"
                            ? "badge-pass"
                            : lastResult.status === "FAIL"
                            ? "badge-fail"
                            : "badge-error"
                        }
                      >
                        {lastResult.status}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-500">Not run yet</span>
                    )}
                  </div>
                </div>

                {/* Steps preview */}
                <div className="bg-gray-950 rounded-lg p-3 mb-3">
                  <p className="text-xs text-gray-500 mb-2 font-mono">Steps:</p>
                  <ol className="space-y-1">
                    {steps.map((step, i) => (
                      <li key={i} className="text-xs text-gray-400 font-mono">
                        <span className="text-gray-600 mr-2">{i + 1}.</span>
                        {step}
                      </li>
                    ))}
                  </ol>
                </div>

                {/* Recent results */}
                {flow.results.length > 0 && (
                  <div>
                    <p className="text-xs text-gray-500 mb-2">Recent runs:</p>
                    <div className="flex flex-wrap gap-2">
                      {flow.results.map((result) => (
                        <div
                          key={result.id}
                          className="flex items-center gap-1.5 bg-gray-800 rounded px-2 py-1"
                        >
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
                          <span className="text-xs text-gray-500">
                            {new Date(result.ranAt).toLocaleDateString()}
                          </span>
                          {result.durationMs && (
                            <span className="text-xs text-gray-600">
                              {result.durationMs}ms
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                    {lastResult?.error && (
                      <div className="mt-3 bg-red-950/30 border border-red-900/50 rounded-lg p-3">
                        <p className="text-xs text-red-400 font-mono">{lastResult.error}</p>
                      </div>
                    )}
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
