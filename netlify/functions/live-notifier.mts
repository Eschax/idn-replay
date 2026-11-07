import handleRequest from "../../server.js";

const ENV_KEYS = [
  "JKT48CONNECT_API_KEY",
  "AUTH_SECRET",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_CHAT_ID",
  "TELEGRAM_NOTIFY_MODE",
  "PUBLIC_APP_URL"
];

export default async () => {
  if (typeof Netlify !== "undefined" && Netlify.env) {
    for (const key of ENV_KEYS) {
      const val = Netlify.env.get(key);
      if (val) process.env[key] = val;
    }
  }
  const result = await handleRequest.runCloudLiveNotifyCheck();
  console.log("[CLOUD LIVE NOTIFIER]", JSON.stringify(result));
  return Response.json(result);
};

export const config = {
  schedule: "*/5 * * * *",
};

