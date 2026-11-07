import { Hono } from "hono";
import { type AppEnv, originCheck } from "./auth/middleware";
import type { Deps } from "./deps";
import { authRoutes } from "./routes/auth";

export type { Deps } from "./deps";
export type { AppEnv } from "./auth/middleware";

/** Route modules, registered in order. Tasks 4-5 append their own `(app, deps) => void` here. */
export const routeModules: ((app: Hono<AppEnv>, deps: Deps) => void)[] = [authRoutes];

export function createApp(deps: Deps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.use("*", originCheck(deps.config.publicUrl));
  for (const register of routeModules) register(app, deps);
  app.onError((err, c) => {
    console.error(err);
    return c.json({ error: "internal_error" }, 500);
  });
  return app;
}
