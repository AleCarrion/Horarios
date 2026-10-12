import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { channelName } from "./realtime";

describe("canales de tiempo real", () => {
  // The bug behind «Algo ha fallado» on /turnos: two listeners on the same channel name made Supabase throw.
  const sb = createClient("http://127.0.0.1:9", "anon-key", { realtime: { params: {} } });
  const listen = (name: string) => sb.channel(name).on("postgres_changes", { event: "*", schema: "public", table: "app_catalog" }, () => {}).subscribe();

  it("con el mismo nombre, el segundo oyente rompe la página (lo que pasaba)", () => {
    listen("catalog-test");
    expect(() => listen("catalog-test")).toThrow(/after `subscribe\(\)`/);
  });

  it("con channelName cada oyente tiene su canal y no rompe nada", () => {
    expect(() => {
      listen(channelName("catalog"));
      listen(channelName("catalog"));
    }).not.toThrow();
    expect(channelName("x")).not.toBe(channelName("x"));
  });
});
