#!/usr/bin/env node
// Production/CLI entry: runs the TypeScript sources through tsx (same runtime as `pnpm start`).
import { register } from "tsx/esm/api";
register();
await import("../src/cli.ts");
