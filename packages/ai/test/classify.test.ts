import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createClassifier } from "../src/classify";

const SHOT = fileURLToPath(new URL("../../../prototype/gallery/public/shots/osm-lisboa-1-t.webp", import.meta.url));

describe.skipIf(process.env.RUN_MODEL_TESTS !== "1")("classifier (model)", () => {
  it("classifies a map screenshot as mapa", async () => {
    const c = await createClassifier({});
    const r = await c.classify(readFileSync(SHOT));
    expect(r.tipo).toEqual(["mapa"]);
    expect(Object.keys(r.scores).length).toBeGreaterThan(30);
  }, 120_000);
});
