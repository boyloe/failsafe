module.exports = {
  apps: [
    // ── Next.js Dashboard ─────────────────────────────────────────────────
    {
      name: "qa-dashboard",
      cwd: "/home/boyloe/.openclaw/workspace/qa-dashboard",
      script: "./node_modules/.bin/next",
      args: "start --port 3001",
      env: {
        NODE_ENV: "production",
      },
      // Restart on crash, up to 10 times
      max_restarts: 10,
      restart_delay: 5000,
      // Log output
      out_file: "./logs/dashboard-out.log",
      error_file: "./logs/dashboard-err.log",
      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss",
    },

    // ── Test Runner (scheduler) ───────────────────────────────────────────
    {
      name: "qa-runner",
      cwd: "/home/boyloe/.openclaw/workspace/qa-dashboard",
      script: "node_modules/.bin/tsx",
      args: "runner/scheduler.ts",
      env: {
        NODE_ENV: "production",
      },
      max_restarts: 10,
      restart_delay: 10000,
      out_file: "./logs/runner-out.log",
      error_file: "./logs/runner-err.log",
      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss",
    },
  ],
};
