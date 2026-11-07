import type { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { type AppEnv, requireUser } from "../auth/middleware";
import type { Deps } from "../deps";

export function eventRoutes(app: Hono<AppEnv>, deps: Deps): void {
  app.get("/api/events", requireUser(deps.db), (c) => {
    const userId = c.var.userId;
    c.header("X-Accel-Buffering", "no");
    return streamSSE(c, async (stream) => {
      let open = true;
      let chain: Promise<unknown> = stream.write(": connected\n\n");
      const unsub = deps.events.subscribe(userId, (e) => {
        chain = chain.then(() => (open ? stream.writeSSE({ event: e.type, data: JSON.stringify(e.data) }) : undefined)).catch(() => {});
      });
      stream.onAbort(() => {
        open = false;
        unsub();
      });
      while (open) {
        await stream.sleep(deps.events.heartbeatMs);
        if (!open) break;
        chain = chain.then(() => stream.write(": heartbeat\n\n")).catch(() => {});
      }
      unsub();
    });
  });
}
