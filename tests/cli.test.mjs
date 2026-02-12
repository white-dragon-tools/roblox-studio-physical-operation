import { describe, it, expect } from "vitest";
import { parseOptions, getCommandExamples } from "../src/cli-parse.mjs";

describe("parseOptions", () => {
  it("returns empty object for empty args", () => {
    expect(parseOptions([])).toEqual({});
  });

  it("parses --after-line", () => {
    expect(parseOptions(["--after-line", "100"])).toEqual({ after_line: 100 });
  });

  it("parses --before-line", () => {
    expect(parseOptions(["--before-line", "200"])).toEqual({ before_line: 200 });
  });

  it("parses --start-date", () => {
    expect(parseOptions(["--start-date", "2026-01-01"])).toEqual({ start_date: "2026-01-01" });
  });

  it("parses --end-date", () => {
    expect(parseOptions(["--end-date", "2026-12-31"])).toEqual({ end_date: "2026-12-31" });
  });

  it("parses --timestamps flag", () => {
    expect(parseOptions(["--timestamps"])).toEqual({ timestamps: true });
  });

  it("parses --context", () => {
    expect(parseOptions(["--context", "play"])).toEqual({ context: "play" });
  });

  it("parses --max-errors", () => {
    expect(parseOptions(["--max-errors", "50"])).toEqual({ max_errors: 50 });
  });

  it("parses --close flag", () => {
    expect(parseOptions(["--close"])).toEqual({ close: true });
  });

  it("parses --debug flag", () => {
    expect(parseOptions(["--debug"])).toEqual({ debug: true });
  });

  it("parses --no-save flag", () => {
    expect(parseOptions(["--no-save"])).toEqual({ save: false });
  });

  it("parses --full flag", () => {
    expect(parseOptions(["--full"])).toEqual({ full: true });
  });

  it("parses --viewport flag", () => {
    expect(parseOptions(["--viewport"])).toEqual({ viewport: true });
  });

  it("parses --errors flag", () => {
    expect(parseOptions(["--errors"])).toEqual({ errors: true });
  });

  it("parses multiple options together", () => {
    const result = parseOptions([
      "some_path",
      "--after-line", "50",
      "--timestamps",
      "--context", "edit",
      "--errors",
      "--max-errors", "10",
    ]);
    expect(result).toEqual({
      after_line: 50,
      timestamps: true,
      context: "edit",
      errors: true,
      max_errors: 10,
    });
  });

  it("ignores unknown args", () => {
    expect(parseOptions(["--unknown", "value"])).toEqual({});
  });

  it("ignores value-options without a value", () => {
    // --after-line at end with no following arg
    expect(parseOptions(["--after-line"])).toEqual({});
  });
});

describe("getCommandExamples", () => {
  it("returns examples for known commands", () => {
    for (const cmd of ["list", "open", "close", "status", "modal", "game", "log", "screenshot", "toolbar"]) {
      const ex = getCommandExamples(cmd);
      expect(ex, `expected examples for '${cmd}'`).not.toBeNull();
      expect(typeof ex).toBe("string");
      expect(ex.length).toBeGreaterThan(0);
    }
  });

  it("returns null for unknown command", () => {
    expect(getCommandExamples("foobar")).toBeNull();
  });
});
