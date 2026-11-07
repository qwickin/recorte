import { Hono } from "hono";
import { type AppEnv, originCheck } from "./auth/middleware";
import { type Deps, type DepsInput, resolveDeps } from "./deps";
import { authRoutes } from "./routes/auth";
import { categoryRoutes } from "./routes/categories";
import { eventRoutes } from "./routes/events";
import { exportRoutes } from "./routes/export";
import { extensionRoutes } from "./routes/extension";
import { itemRoutes } from "./routes/items";
import { tagRoutes } from "./routes/tags";

export type { Deps, DepsInput } from "./deps";
export type { AppEnv } from "./auth/middleware";

/** Route modules, registered in order. Tasks 4-5 append their own `(app, deps) => void` here. */
export const routeModules: ((app: Hono<AppEnv>, deps: Deps) => void)[] = [
  authRoutes,
  itemRoutes,
  tagRoutes,
  categoryRoutes,
  eventRoutes,
  exportRoutes,
  extensionRoutes,
];

export function createApp(input: DepsInput): Hono<AppEnv> {
  const deps = resolveDeps(input);
  const app = new Hono<AppEnv>();
  app.use("*", originCheck(deps.config.publicUrl));
  for (const register of routeModules) register(app, deps);
  app.onError((err, c) => {
    console.error(err);
    return c.json({ error: "internal_error" }, 500);
  });
  return app;
}
