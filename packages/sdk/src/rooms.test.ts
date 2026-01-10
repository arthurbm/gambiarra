import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { rooms } from "./rooms.ts";

describe("SDK rooms namespace", () => {
  beforeEach(() => {
    rooms.clear();
  });

  afterEach(() => {
    rooms.clear();
  });

  test("re-exports all Room functions", () => {
    expect(rooms.create).toBeDefined();
    expect(rooms.get).toBeDefined();
    expect(rooms.getByCode).toBeDefined();
    expect(rooms.list).toBeDefined();
    expect(rooms.listWithParticipantCount).toBeDefined();
    expect(rooms.remove).toBeDefined();
    expect(rooms.addParticipant).toBeDefined();
    expect(rooms.removeParticipant).toBeDefined();
    expect(rooms.getParticipants).toBeDefined();
    expect(rooms.getParticipant).toBeDefined();
    expect(rooms.updateParticipantStatus).toBeDefined();
    expect(rooms.updateLastSeen).toBeDefined();
    expect(rooms.findParticipantByModel).toBeDefined();
    expect(rooms.getRandomOnlineParticipant).toBeDefined();
    expect(rooms.checkStaleParticipants).toBeDefined();
    expect(rooms.validatePassword).toBeDefined();
    expect(rooms.clear).toBeDefined();
  });

  test("basic room creation workflow", async () => {
    const room = await rooms.create("Test Room", "host-123");

    expect(room.name).toBe("Test Room");
    expect(room.hostId).toBe("host-123");
    expect(room.code).toHaveLength(6);

    const found = rooms.getByCode(room.code);
    expect(found).toEqual(room);
  });

  test("list rooms", async () => {
    await rooms.create("Room 1", "host-1");
    await rooms.create("Room 2", "host-2");

    const allRooms = rooms.list();
    expect(allRooms).toHaveLength(2);
  });

  test("create password-protected room", async () => {
    const room = await rooms.create("Secured Room", "host-123", "secret123");

    expect(room.name).toBe("Secured Room");
    expect(room.passwordHash).toBeDefined();
    expect(room.passwordHash).toHaveLength(64); // SHA-256 hash is 64 hex chars
  });

  test("validate correct password", async () => {
    const room = await rooms.create("Test", "host", "mypassword");

    const isValid = await rooms.validatePassword(room.id, "mypassword");
    expect(isValid).toBe(true);
  });

  test("reject incorrect password", async () => {
    const room = await rooms.create("Test", "host", "mypassword");

    const isValid = await rooms.validatePassword(room.id, "wrongpassword");
    expect(isValid).toBe(false);
  });

  test("allow access to room without password", async () => {
    const room = await rooms.create("Open Room", "host");

    const isValid = await rooms.validatePassword(room.id, "");
    expect(isValid).toBe(true);
  });

  test("deny access when password required but not provided", async () => {
    const room = await rooms.create("Secured", "host", "pass123");

    const isValid = await rooms.validatePassword(room.id, "");
    expect(isValid).toBe(false);
  });
});
