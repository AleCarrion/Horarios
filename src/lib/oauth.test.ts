import { describe, expect, it } from "vitest";
import { enabledProviders } from "./oauth";

describe("botón de Google", () => {
  it("none by default", () => {
    expect(enabledProviders(undefined)).toEqual([]);
    expect(enabledProviders("")).toEqual([]);
  });
  it("shows Google only when asked for; anything else is ignored", () => {
    expect(enabledProviders("GOOGLE")).toEqual(["google"]);
    expect(enabledProviders("apple, google")).toEqual(["google"]);
    expect(enabledProviders("apple,facebook")).toEqual([]);
  });
});
