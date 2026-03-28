import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { signOut } from "@/lib/auth";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-gray-950 flex">
      {/* Sidebar */}
      <aside className="w-60 border-r border-gray-800 flex flex-col py-6 px-4 flex-shrink-0">
        <Link href="/dashboard" className="flex items-center gap-2 text-brand-400 font-bold mb-8 px-2">
          <span className="text-lg">⬡</span>
          <span>QA Monitor</span>
        </Link>

        <nav className="space-y-1 flex-1">
          {[
            { href: "/dashboard", label: "Overview", icon: "◈" },
            { href: "/dashboard/clients", label: "Clients", icon: "◎" },
            { href: "/dashboard/settings", label: "Settings", icon: "⚙" },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-gray-100 hover:bg-gray-800 transition-colors"
            >
              <span className="text-xs">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="border-t border-gray-800 pt-4 mt-4">
          <div className="px-3 mb-3">
            <p className="text-xs text-gray-500 truncate">{session.user.email}</p>
          </div>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/" });
            }}
          >
            <button
              type="submit"
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-500 hover:text-gray-100 hover:bg-gray-800 transition-colors text-left"
            >
              <span className="text-xs">↩</span>
              Sign out
            </button>
          </form>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto">
        <div className="max-w-5xl mx-auto px-8 py-8">
          {children}
        </div>
      </main>
    </div>
  );
}
