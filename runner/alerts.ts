/**
 * alerts.ts
 *
 * Sends failure/recovery alerts via email and Telegram.
 */

import nodemailer from "nodemailer";

export interface AlertPayload {
  clientName: string;
  clientUrl: string;
  flowName: string;
  status: "FAIL" | "RECOVERED";
  error?: string;
  durationMs?: number;
  ranAt: Date;
}

// ── Email ─────────────────────────────────────────────────────────────────────

function getTransporter() {
  const host = process.env.EMAIL_SERVER_HOST;
  const port = Number(process.env.EMAIL_SERVER_PORT ?? 587);
  const user = process.env.EMAIL_SERVER_USER;
  const pass = process.env.EMAIL_SERVER_PASSWORD;

  if (!host || !user || !pass) return null;

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

function buildEmailBody(payload: AlertPayload): { subject: string; html: string } {
  const { clientName, clientUrl, flowName, status, error, ranAt } = payload;
  const icon = status === "FAIL" ? "🚨" : "✅";
  const subject =
    status === "FAIL"
      ? `${icon} ALERT: "${flowName}" is failing on ${clientName}`
      : `${icon} RECOVERED: "${flowName}" is passing again on ${clientName}`;

  const color = status === "FAIL" ? "#ef4444" : "#22c55e";
  const label = status === "FAIL" ? "FAILING" : "RECOVERED";

  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #111; color: #eee; padding: 24px; border-radius: 12px;">
      <div style="margin-bottom: 24px;">
        <span style="background: ${color}22; color: ${color}; font-size: 12px; font-weight: 600; padding: 4px 10px; border-radius: 999px; border: 1px solid ${color}44;">
          ${label}
        </span>
      </div>

      <h2 style="margin: 0 0 8px; font-size: 20px;">${icon} ${flowName}</h2>
      <p style="margin: 0 0 24px; color: #888; font-size: 14px;">
        <a href="${clientUrl}" style="color: #38bdf8;">${clientName}</a> · ${ranAt.toUTCString()}
      </p>

      ${
        error
          ? `<div style="background: #1a0000; border: 1px solid #7f1d1d; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
               <p style="margin: 0; font-family: monospace; font-size: 13px; color: #fca5a5; white-space: pre-wrap;">${error}</p>
             </div>`
          : ""
      }

      ${
        status === "RECOVERED"
          ? `<p style="color: #86efac; font-size: 14px;">✅ This flow is now passing again. No action required.</p>`
          : `<p style="color: #fca5a5; font-size: 14px;">Your QA Monitor detected this failure automatically. Check the dashboard for details.</p>`
      }

      <hr style="border: none; border-top: 1px solid #333; margin: 24px 0;" />
      <p style="color: #555; font-size: 12px; margin: 0;">
        QA Monitor · <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard" style="color: #38bdf8;">View dashboard</a>
      </p>
    </div>
  `;

  return { subject, html };
}

export async function sendEmailAlert(
  toEmail: string,
  payload: AlertPayload
): Promise<void> {
  const transporter = getTransporter();
  if (!transporter) {
    console.warn("  ⚠ Email not configured — skipping email alert");
    return;
  }

  const { subject, html } = buildEmailBody(payload);

  await transporter.sendMail({
    from: process.env.EMAIL_FROM ?? "alerts@qamonitor.app",
    to: toEmail,
    subject,
    html,
  });

  console.log(`  📧 Email alert sent to ${toEmail}`);
}

// ── Telegram ──────────────────────────────────────────────────────────────────

export async function sendTelegramAlert(
  chatId: string,
  payload: AlertPayload
): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.warn("  ⚠ TELEGRAM_BOT_TOKEN not set — skipping Telegram alert");
    return;
  }

  const { clientName, flowName, status, error, clientUrl } = payload;
  const icon = status === "FAIL" ? "🚨" : "✅";
  const label = status === "FAIL" ? "FAILING" : "RECOVERED";

  const lines = [
    `${icon} *${label}: ${flowName}*`,
    `🌐 [${clientName}](${clientUrl})`,
    `🕐 ${payload.ranAt.toUTCString()}`,
  ];

  if (error) {
    lines.push("", `\`\`\`\n${error.slice(0, 500)}\n\`\`\``);
  }

  if (status === "RECOVERED") {
    lines.push("", "✅ Flow is passing again. No action needed.");
  }

  const text = lines.join("\n");
  const url = `https://api.telegram.org/bot${token}/sendMessage`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "Markdown",
      disable_web_page_preview: true,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`  ❌ Telegram alert failed: ${body}`);
  } else {
    console.log(`  📱 Telegram alert sent to ${chatId}`);
  }
}

// ── Slack ─────────────────────────────────────────────────────────────────────

export async function sendSlackAlert(
  webhookUrl: string,
  payload: AlertPayload
): Promise<void> {
  const { clientName, flowName, status, error, clientUrl, ranAt } = payload;
  const icon = status === "FAIL" ? "🚨" : "✅";
  const color = status === "FAIL" ? "#ef4444" : "#22c55e";

  const body = {
    attachments: [
      {
        color,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `${icon} *${flowName}* is ${status === "FAIL" ? "failing" : "recovered"} on <${clientUrl}|${clientName}>`,
            },
          },
          ...(error
            ? [
                {
                  type: "section",
                  text: { type: "mrkdwn", text: `\`\`\`${error.slice(0, 300)}\`\`\`` },
                },
              ]
            : []),
          {
            type: "context",
            elements: [{ type: "plain_text", text: ranAt.toUTCString() }],
          },
        ],
      },
    ],
  };

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    console.error(`  ❌ Slack alert failed: ${await res.text()}`);
  } else {
    console.log(`  💬 Slack alert sent`);
  }
}
