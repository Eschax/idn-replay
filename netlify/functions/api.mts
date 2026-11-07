import { EventEmitter } from "node:events";
import handleRequest from "../../server.js";

const ENV_KEYS = [
  "JKT48CONNECT_API_KEY",
  "AUTH_SECRET",
  "APP_USERS",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_CHAT_ID",
  "TELEGRAM_NOTIFY_MODE",
  "PUBLIC_APP_URL"
];

export default async (req: Request): Promise<Response> => {
  if (typeof Netlify !== "undefined" && Netlify.env) {
    for (const key of ENV_KEYS) {
      const val = Netlify.env.get(key);
      if (val) process.env[key] = val;
    }
  }

  const url = new URL(req.url);
  const bodyText = req.method === "GET" || req.method === "HEAD" ? "" : await req.text();

  return new Promise<Response>((resolve) => {
    const mockReq: any = Object.assign(new EventEmitter(), {
      method: req.method,
      url: url.pathname + url.search,
      headers: Object.fromEntries(req.headers.entries()),
      destroy() {},
    });

    let statusCode = 200;
    const resHeaders = new Headers();
    const chunks: Buffer[] = [];

    const mockRes: any = Object.assign(new EventEmitter(), {
      writableEnded: false,
      writeHead(status: number, headers?: Record<string, string>) {
        statusCode = status;
        if (headers) {
          for (const [k, v] of Object.entries(headers)) {
            if (k.toLowerCase() === "access-control-allow-origin") continue;
            resHeaders.set(k, String(v));
          }
        }
      },
      write(chunk: any) {
        if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
        return true;
      },
      end(chunk?: any) {
        this.writableEnded = true;
        if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
        const bodyBuf = req.method === "HEAD" ? null : Buffer.concat(chunks);
        resolve(new Response(bodyBuf, { status: statusCode, headers: resHeaders }));
      },
    });

    handleRequest(mockReq, mockRes);
    if (bodyText) mockReq.emit("data", bodyText);
    mockReq.emit("end");
  });
};

export const config = {
  path: ["/api/*"],
};
