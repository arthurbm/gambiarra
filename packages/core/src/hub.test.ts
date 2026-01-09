import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { z } from "zod";
import { createHub, type Hub } from "./hub.ts";
import { Room } from "./room.ts";

const HealthResponseSchema = z.object({
  status: z.string(),
  timestamp: z.number(),
});

const RoomResponseSchema = z.object({
  room: z.object({ id: z.string(), code: z.string(), name: z.string() }),
  hostId: z.string(),
});

const ErrorResponseSchema = z.object({
  error: z.string(),
});

const RoomsListResponseSchema = z.object({
  rooms: z.array(z.object({ participantCount: z.number() })),
});

const JoinResponseSchema = z.object({
  participant: z.object({ id: z.string(), nickname: z.string() }),
  roomId: z.string(),
});

const SuccessResponseSchema = z.object({
  success: z.boolean(),
});

const ParticipantsResponseSchema = z.object({
  participants: z.array(z.object({ nickname: z.string() })),
});

const ModelsResponseSchema = z.object({
  object: z.string(),
  data: z.array(
    z.object({
      id: z.string(),
      object: z.string(),
      owned_by: z.string(),
      gambiarra: z.object({
        nickname: z.string(),
        model: z.string(),
        endpoint: z.string(),
      }),
    })
  ),
});

describe("Hub", () => {
  let hub: Hub;
  const PORT = 3999; // Use non-standard port for tests

  beforeAll(() => {
    hub = createHub({ port: PORT, hostname: "127.0.0.1" });
  });

  afterAll(() => {
    hub.close();
  });

  beforeEach(() => {
    Room.clear();
  });

  const baseUrl = `http://127.0.0.1:${PORT}`;

  async function createRoom(name: string) {
    const res = await fetch(`${baseUrl}/rooms`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    return RoomResponseSchema.parse(await res.json());
  }

  async function joinRoom(
    code: string,
    participant: {
      id: string;
      nickname: string;
      model: string;
      endpoint: string;
    }
  ) {
    const res = await fetch(`${baseUrl}/rooms/${code}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(participant),
    });
    return { res, data: await res.json() };
  }

  describe("GET /health", () => {
    test("returns health status", async () => {
      const res = await fetch(`${baseUrl}/health`);
      const data = HealthResponseSchema.parse(await res.json());

      expect(res.status).toBe(200);
      expect(data.status).toBe("ok");
      expect(data.timestamp).toBeDefined();
    });
  });

  describe("POST /rooms", () => {
    test("creates a new room", async () => {
      const res = await fetch(`${baseUrl}/rooms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Test Room" }),
      });
      const data = RoomResponseSchema.parse(await res.json());

      expect(res.status).toBe(201);
      expect(data.room.name).toBe("Test Room");
      expect(data.room.code).toHaveLength(6);
      expect(data.hostId).toBeDefined();
    });

    test("returns error when name is missing", async () => {
      const res = await fetch(`${baseUrl}/rooms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = ErrorResponseSchema.parse(await res.json());

      expect(res.status).toBe(400);
      expect(data.error).toBe("Name is required");
    });
  });

  describe("GET /rooms", () => {
    test("returns empty list when no rooms", async () => {
      const res = await fetch(`${baseUrl}/rooms`);
      const data = RoomsListResponseSchema.parse(await res.json());

      expect(res.status).toBe(200);
      expect(data.rooms).toEqual([]);
    });

    test("returns list of rooms with participant count", async () => {
      await createRoom("Room 1");
      await createRoom("Room 2");

      const res = await fetch(`${baseUrl}/rooms`);
      const data = RoomsListResponseSchema.parse(await res.json());

      expect(res.status).toBe(200);
      expect(data.rooms).toHaveLength(2);
      const firstRoom = data.rooms[0];
      expect(firstRoom).toBeDefined();
      expect(firstRoom?.participantCount).toBe(0);
    });
  });

  describe("POST /rooms/:code/join", () => {
    test("joins a room", async () => {
      const { room } = await createRoom("Test Room");
      const { res, data } = await joinRoom(room.code, {
        id: "participant-1",
        nickname: "test-user",
        model: "llama3",
        endpoint: "http://localhost:11434",
      });

      expect(res.status).toBe(201);
      const joinData = JoinResponseSchema.parse(data);
      expect(joinData.participant.id).toBe("participant-1");
      expect(joinData.participant.nickname).toBe("test-user");
      expect(joinData.roomId).toBe(room.id);
    });

    test("returns error for non-existent room", async () => {
      const { res, data } = await joinRoom("XXXXXX", {
        id: "participant-1",
        nickname: "test-user",
        model: "llama3",
        endpoint: "http://localhost:11434",
      });

      expect(res.status).toBe(404);
      const errorData = ErrorResponseSchema.parse(data);
      expect(errorData.error).toBe("Room not found");
    });

    test("returns error when required fields are missing", async () => {
      const { room } = await createRoom("Test Room");
      const res = await fetch(`${baseUrl}/rooms/${room.code}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "participant-1" }),
      });
      const data = ErrorResponseSchema.parse(await res.json());

      expect(res.status).toBe(400);
      expect(data.error).toContain("Missing required fields");
    });
  });

  describe("DELETE /rooms/:code/leave/:id", () => {
    test("removes participant from room", async () => {
      const { room } = await createRoom("Test Room");
      await joinRoom(room.code, {
        id: "participant-1",
        nickname: "test-user",
        model: "llama3",
        endpoint: "http://localhost:11434",
      });

      const res = await fetch(
        `${baseUrl}/rooms/${room.code}/leave/participant-1`,
        { method: "DELETE" }
      );
      const data = SuccessResponseSchema.parse(await res.json());

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
    });

    test("returns error for non-existent participant", async () => {
      const { room } = await createRoom("Test Room");
      const res = await fetch(
        `${baseUrl}/rooms/${room.code}/leave/non-existent`,
        { method: "DELETE" }
      );
      const data = ErrorResponseSchema.parse(await res.json());

      expect(res.status).toBe(404);
      expect(data.error).toBe("Participant not found");
    });
  });

  describe("POST /rooms/:code/health", () => {
    test("updates participant last seen", async () => {
      const { room } = await createRoom("Test Room");
      await joinRoom(room.code, {
        id: "participant-1",
        nickname: "test-user",
        model: "llama3",
        endpoint: "http://localhost:11434",
      });

      const res = await fetch(`${baseUrl}/rooms/${room.code}/health`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "participant-1" }),
      });
      const data = SuccessResponseSchema.parse(await res.json());

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
    });

    test("returns error for non-existent participant", async () => {
      const { room } = await createRoom("Test Room");
      const res = await fetch(`${baseUrl}/rooms/${room.code}/health`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "non-existent" }),
      });
      const data = ErrorResponseSchema.parse(await res.json());

      expect(res.status).toBe(404);
      expect(data.error).toBe("Participant not found");
    });
  });

  describe("GET /rooms/:code/participants", () => {
    test("returns participants in room", async () => {
      const { room } = await createRoom("Test Room");
      await joinRoom(room.code, {
        id: "participant-1",
        nickname: "test-user",
        model: "llama3",
        endpoint: "http://localhost:11434",
      });

      const res = await fetch(`${baseUrl}/rooms/${room.code}/participants`);
      const data = ParticipantsResponseSchema.parse(await res.json());

      expect(res.status).toBe(200);
      expect(data.participants).toHaveLength(1);
      const firstParticipant = data.participants[0];
      expect(firstParticipant).toBeDefined();
      expect(firstParticipant?.nickname).toBe("test-user");
    });

    test("returns error for non-existent room", async () => {
      const res = await fetch(`${baseUrl}/rooms/XXXXXX/participants`);
      const data = ErrorResponseSchema.parse(await res.json());

      expect(res.status).toBe(404);
      expect(data.error).toBe("Room not found");
    });
  });

  describe("GET /rooms/:code/v1/models", () => {
    test("returns OpenAI-compatible models list", async () => {
      const { room } = await createRoom("Test Room");
      await joinRoom(room.code, {
        id: "participant-1",
        nickname: "test-user",
        model: "llama3",
        endpoint: "http://localhost:11434",
      });

      const res = await fetch(`${baseUrl}/rooms/${room.code}/v1/models`);
      const data = ModelsResponseSchema.parse(await res.json());

      expect(res.status).toBe(200);
      expect(data.object).toBe("list");
      expect(data.data).toHaveLength(1);
      const firstModel = data.data[0];
      expect(firstModel).toBeDefined();
      expect(firstModel?.id).toBe("participant-1");
      expect(firstModel?.object).toBe("model");
      expect(firstModel?.owned_by).toBe("test-user");
      expect(firstModel?.gambiarra).toEqual({
        nickname: "test-user",
        model: "llama3",
        endpoint: "http://localhost:11434",
      });
    });

    test("only returns online participants", async () => {
      const { room } = await createRoom("Test Room");
      await joinRoom(room.code, {
        id: "participant-1",
        nickname: "test-user",
        model: "llama3",
        endpoint: "http://localhost:11434",
      });

      // Mark participant as offline
      Room.updateParticipantStatus(room.id, "participant-1", "offline");

      const res = await fetch(`${baseUrl}/rooms/${room.code}/v1/models`);
      const data = ModelsResponseSchema.parse(await res.json());

      expect(res.status).toBe(200);
      expect(data.data).toHaveLength(0);
    });
  });

  describe("OPTIONS (CORS)", () => {
    test("returns CORS headers", async () => {
      const res = await fetch(`${baseUrl}/rooms`, { method: "OPTIONS" });

      expect(res.status).toBe(204);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
      expect(res.headers.get("Access-Control-Allow-Methods")).toContain("POST");
    });
  });

  describe("404 handling", () => {
    test("returns 404 for unknown routes", async () => {
      const res = await fetch(`${baseUrl}/unknown`);

      expect(res.status).toBe(404);
    });
  });
});
