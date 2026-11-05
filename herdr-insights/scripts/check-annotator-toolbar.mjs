import assert from "node:assert/strict";
import { withInsightsToolbar } from "./toolbar.mjs";

for (const mod of ["tabs", "annotator-tabs"]) {
  const original = { id: "tabs", type: "block", content: { mod } };
  const result = withInsightsToolbar(original);
  assert.equal(result.children[0].content.mod, mod);
  assert.equal(result.children[1].content.mod, "insights");
  assert.equal(original.type, "block");
  assert.throws(() => withInsightsToolbar(result));
}
assert.throws(() => withInsightsToolbar({ id: "tabs", type: "block", content: { mod: "unknown" } }));
console.log("Stock and Annotator tabs preserved; unsupported/duplicate layouts rejected.");
