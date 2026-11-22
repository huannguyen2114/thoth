import { activityKinds } from "@thoth/core";
import { describe, expect, it } from "vitest";
import { activityTone } from "./activity-tone";

describe("activityTone", () => {
  it("gives every activity kind a tone utility", () => {
    for (const k of activityKinds) expect(activityTone(k)).toMatch(/^tone-/);
  });
  it("matches the sidebar: reviews are sky, plans are butter", () => {
    expect(activityTone("card_review")).toBe("tone-sky");
    expect(activityTone("plan_item_done")).toBe("tone-butter");
  });
});
