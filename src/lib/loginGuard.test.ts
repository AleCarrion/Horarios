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

import { passwordProblem } from "./loginGuard";

describe("contraseña", () => {
  it("asks for 8 characters with letters and a number", () => {
    expect(passwordProblem("abc1")).toMatch(/al menos 8/);
    expect(passwordProblem("abcdefgh")).toMatch(/número/);
    expect(passwordProblem("12345678")).toMatch(/letras/);
    expect(passwordProblem("hotel1800")).toBeNull();
  });
  it("explains the usual login errors", () => {
    expect(friendlyAuthError("Invalid login credentials")).toMatch(/incorrectos/);
    expect(friendlyAuthError("Email not confirmed")).toMatch(/confirmado/);
    expect(friendlyAuthError("User already registered")).toMatch(/ya tiene cuenta/);
    expect(friendlyAuthError("Password should be at least 6 characters")).toMatch(/débil/);
  });
});
