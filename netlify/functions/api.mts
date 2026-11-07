import { EventEmitter } from "node:events";
import handleRequest from "../../server.js";

export default async (req: Request): Promise<Response> => {
  const netlifyKey =
    typeof Netlify !== "undefined" && Netlify.env ? Netlify.env.get("JKT48CONNECT_API_KEY") : "";
  if (netlifyKey) {
    process.env.JKT48CONNECT_API_KEY = netlifyKey;
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
    const resHeaders: Record<string, string> = {};
    const chunks: Buffer[] = [];

    const mockRes: any = Object.assign(new EventEmitter(), {
      writeHead(status: number, headers?: Record<string, string>) {
        statusCode = status;
        if (headers) {
          for (const [k, v] of Object.entries(headers)) resHeaders[k.toLowerCase()] = String(v);
        }
      },
      write(chunk: any) {
        if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
        return true;
      },
      end(chunk?: any) {
        if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
        delete resHeaders["access-control-allow-origin"];
        resolve(new Response(Buffer.concat(chunks), { status: statusCode, headers: resHeaders }));
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
