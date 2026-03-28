"use client";

interface Props {
  action: (formData: FormData) => Promise<void>;
  defaultValues: {
    email: boolean;
    telegram: string | null;
    slack: string | null;
  };
  userEmail: string;
}

export default function AlertConfigForm({ action, defaultValues, userEmail }: Props) {
  return (
    <div className="card">
      <h2 className="text-base font-semibold mb-1">Alert Configuration</h2>
      <p className="text-sm text-gray-400 mb-6">
        Where to send notifications when a flow fails or recovers.
      </p>

      <form action={action} className="space-y-5">
        {/* Email */}
        <div className="flex items-start justify-between gap-4 py-3 border-b border-gray-800">
          <div>
            <p className="text-sm font-medium">Email alerts</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Sends to <span className="text-gray-300">{userEmail}</span>
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer mt-0.5">
            <input
              type="checkbox"
              name="email"
              defaultChecked={defaultValues.email}
              className="sr-only peer"
            />
            <div className="w-10 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-500" />
          </label>
        </div>

        {/* Telegram */}
        <div className="py-3 border-b border-gray-800">
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-sm font-medium">Telegram</p>
              <p className="text-xs text-gray-500 mt-0.5">Enter your Telegram chat ID</p>
            </div>
            {defaultValues.telegram && (
              <span className="text-xs text-green-400 bg-green-900/30 px-2 py-0.5 rounded-full">
                Active
              </span>
            )}
          </div>
          <input
            type="text"
            name="telegram"
            defaultValue={defaultValues.telegram ?? ""}
            placeholder="e.g. 8633287384"
            className="input max-w-xs"
          />
          <p className="text-xs text-gray-600 mt-1.5">
            Find yours by messaging @userinfobot on Telegram
          </p>
        </div>

        {/* Slack */}
        <div className="py-3">
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-sm font-medium">Slack</p>
              <p className="text-xs text-gray-500 mt-0.5">Incoming webhook URL</p>
            </div>
            {defaultValues.slack && (
              <span className="text-xs text-green-400 bg-green-900/30 px-2 py-0.5 rounded-full">
                Active
              </span>
            )}
          </div>
          <input
            type="url"
            name="slack"
            defaultValue={defaultValues.slack ?? ""}
            placeholder="https://hooks.slack.com/services/..."
            className="input"
          />
        </div>

        <div className="flex justify-end pt-2">
          <button type="submit" className="btn-primary">
            Save changes
          </button>
        </div>
      </form>
    </div>
  );
}
