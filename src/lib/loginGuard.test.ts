import { describe, expect, it } from "vitest";
import { cooldownLeft, friendlyAuthError } from "./loginGuard";

describe("enlace de acceso", () => {
  it("cooldown counts down and ends", () => {
    expect(cooldownLeft(null, 1000)).toBe(0);
    expect(cooldownLeft(0, 1000)).toBe(59);
    expect(cooldownLeft(0, 60_000)).toBe(0);
    expect(cooldownLeft(0, 90_000)).toBe(0);
  });
  it("errors are explained in Spanish", () => {
    expect(friendlyAuthError("email rate limit exceeded")).toMatch(/demasiados/);
    expect(friendlyAuthError("Signups not allowed for otp")).toMatch(/no tiene acceso/);
    expect(friendlyAuthError("weird")).toMatch(/weird/);
  });
});
