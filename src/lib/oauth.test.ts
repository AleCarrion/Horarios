import { describe, expect, it } from "vitest";
import { enabledProviders } from "./oauth";

describe("botones de Google / Apple", () => {
  it("none by default", () => {
    expect(enabledProviders(undefined)).toEqual([]);
    expect(enabledProviders("")).toEqual([]);
  });
  it("shows only the known providers that were asked for, in a fixed order", () => {
    expect(enabledProviders("apple, google")).toEqual(["google", "apple"]);
    expect(enabledProviders("GOOGLE")).toEqual(["google"]);
    expect(enabledProviders("facebook,google;twitter")).toEqual(["google"]);
  });
});
