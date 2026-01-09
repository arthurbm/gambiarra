import { describe, expect, test } from "bun:test";
import { hub } from "./hub.ts";

describe("SDK hub namespace", () => {
  test("re-exports createHub", () => {
    expect(hub.create).toBeDefined();
  });

  test("creates a hub", () => {
    const myHub = hub.create({ port: 3997, hostname: "127.0.0.1" });

    expect(myHub.server).toBeDefined();
    expect(myHub.url).toBe("http://127.0.0.1:3997");
    expect(myHub.close).toBeDefined();

    myHub.close();
  });
});
