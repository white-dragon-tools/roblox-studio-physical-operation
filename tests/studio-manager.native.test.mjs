import { describe, it, expect } from "vitest";
import { getSession } from "../src/studio-manager.mjs";

describe("getSession - platform integration", () => {
  it("returns not found for non-running place", async () => {
    const [ok] = await getSession("/non/existent/place.rbxl");
    expect(ok).toBe(false);
  });

  it("returns not found for non-running place id", async () => {
    const [ok] = await getSession(null, 99999999);
    expect(ok).toBe(false);
  });
});
