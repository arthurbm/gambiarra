import { mDNS } from "./mdns.ts";
import { Room } from "./room.ts";
import { SSE } from "./sse.ts";
import { HEALTH_CHECK_INTERVAL, type ParticipantInfo } from "./types.ts";

export interface HubOptions {
  port?: number;
  hostname?: string;
  cors?: string[];
  mdns?: boolean;
}

export interface Hub {
  server: ReturnType<typeof Bun.serve>;
  url: string;
  mdnsName?: string;
  close: () => void;
}

// Top-level regex for route matching
const ROOM_PATH_REGEX = /^\/rooms\/([^/]+)/;
const LEAVE_PATH_REGEX = /^\/rooms\/[^/]+\/leave\/[^/]+$/;

function json(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: { "Access-Control-Allow-Origin": "*" },
  });
}

function error(message: string, status = 400): Response {
  return json({ error: message }, status);
}

function corsHeaders(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

// Route handlers
async function createRoom(req: Request): Promise<Response> {
  const body = (await req.json()) as { name: string; password?: string };
  if (!body.name) {
    return error("Name is required");
  }

  const hostId = crypto.randomUUID();
  const room = await Room.create(body.name, hostId, body.password);

  // Strip password hash from public responses to prevent offline brute-force attacks
  const { passwordHash, ...roomWithoutHash } = room;

  SSE.broadcast("room:created", roomWithoutHash);

  return json({ room: roomWithoutHash, hostId }, 201);
}

function listRooms(): Response {
  return json({ rooms: Room.listWithParticipantCount() });
}

async function joinRoom(req: Request, code: string): Promise<Response> {
  const room = Room.getByCode(code);
  if (!room) {
    return error("Room not found", 404);
  }

  const body = (await req.json()) as {
    id: string;
    nickname: string;
    model: string;
    endpoint: string;
    password?: string;
    specs?: ParticipantInfo["specs"];
    config?: ParticipantInfo["config"];
  };

  if (!(body.id && body.nickname && body.model && body.endpoint)) {
    return error("Missing required fields: id, nickname, model, endpoint");
  }

  // Validate password if room is protected
  const isPasswordValid = await Room.validatePassword(
    room.id,
    body.password ?? ""
  );
  if (!isPasswordValid) {
    return error("Invalid password", 401);
  }

  const now = Date.now();
  const participant: ParticipantInfo = {
    id: body.id,
    nickname: body.nickname,
    model: body.model,
    endpoint: body.endpoint,
    specs: body.specs ?? {},
    config: body.config ?? {},
    status: "online",
    joinedAt: now,
    lastSeen: now,
  };

  Room.addParticipant(room.id, participant);

  SSE.broadcast("participant:joined", participant, code);

  return json({ participant, roomId: room.id }, 201);
}

function leaveRoom(code: string, participantId: string): Response {
  const room = Room.getByCode(code);
  if (!room) {
    return error("Room not found", 404);
  }

  const removed = Room.removeParticipant(room.id, participantId);
  if (!removed) {
    return error("Participant not found", 404);
  }

  SSE.broadcast("participant:left", { participantId }, code);

  return json({ success: true });
}

async function healthCheck(req: Request, code: string): Promise<Response> {
  const room = Room.getByCode(code);
  if (!room) {
    return error("Room not found", 404);
  }

  const body = (await req.json()) as { id: string };
  if (!body.id) {
    return error("Participant ID is required");
  }

  const updated = Room.updateLastSeen(room.id, body.id);
  if (!updated) {
    return error("Participant not found", 404);
  }

  return json({ success: true });
}

function getParticipants(code: string): Response {
  const room = Room.getByCode(code);
  if (!room) {
    return error("Room not found", 404);
  }

  return json({ participants: Room.getParticipants(room.id) });
}

function listModels(code: string): Response {
  const room = Room.getByCode(code);
  if (!room) {
    return error("Room not found", 404);
  }

  const participants = Room.getParticipants(room.id).filter(
    (p) => p.status === "online"
  );

  // OpenAI-compatible /v1/models response
  const models: GambiarraModel[] = participants.map((p) => ({
    id: p.id,
    object: "model" as const,
    created: Math.floor(p.joinedAt / 1000),
    owned_by: p.nickname,
    gambiarra: {
      nickname: p.nickname,
      model: p.model,
      endpoint: p.endpoint,
    },
  }));

  const response: ModelsListResponse = { object: "list", data: models };
  return json(response);
}

// OpenAI-compatible model response (extended with Gambiarra metadata)
export interface GambiarraModel {
  id: string;
  object: "model";
  created: number;
  owned_by: string;
  gambiarra: {
    nickname: string;
    model: string;
    endpoint: string;
  };
}

export interface ModelsListResponse {
  object: "list";
  data: GambiarraModel[];
}

// OpenAI-compatible chat completion request (extended for our routing)
// model can be: participant ID, "model:<name>", or "*" for any
export interface ChatCompletionRequest {
  model: string;
  messages: Array<{
    role: "system" | "user" | "assistant" | "tool" | "function";
    content: string | null;
    [key: string]: unknown;
  }>;
  stream?: boolean;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  stop?: string | string[];
  frequency_penalty?: number;
  presence_penalty?: number;
  seed?: number;
  [key: string]: unknown;
}

function findParticipant(
  roomId: string,
  modelId: string
): ParticipantInfo | undefined {
  if (modelId === "*" || modelId === "any") {
    return Room.getRandomOnlineParticipant(roomId);
  }

  if (modelId.startsWith("model:")) {
    const actualModel = modelId.slice(6);
    return Room.findParticipantByModel(roomId, actualModel);
  }

  // Try as participant ID first
  const participant = Room.getParticipant(roomId, modelId);
  if (participant) {
    return participant;
  }

  // Fallback: try as model name
  return Room.findParticipantByModel(roomId, modelId);
}

async function proxyChatCompletions(
  req: Request,
  code: string
): Promise<Response> {
  const room = Room.getByCode(code);
  if (!room) {
    return error("Room not found", 404);
  }

  const body = (await req.json()) as ChatCompletionRequest;
  const participant = findParticipant(room.id, body.model);

  if (!participant) {
    return error("No available participant for the requested model", 404);
  }

  if (participant.status !== "online") {
    return error("Participant is offline", 503);
  }

  const targetUrl = `${participant.endpoint}/v1/chat/completions`;

  SSE.broadcast(
    "llm:request",
    { participantId: participant.id, model: body.model },
    code
  );

  try {
    const response = await fetch(targetUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, model: participant.model }),
    });

    if (body.stream) {
      return new Response(response.body, {
        status: response.status,
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    const data = await response.json();
    return json(data, response.status);
  } catch (err) {
    SSE.broadcast(
      "llm:error",
      { participantId: participant.id, error: String(err) },
      code
    );
    return error(`Failed to proxy request: ${err}`, 502);
  }
}

function sseEvents(code: string): Response {
  const room = Room.getByCode(code);
  if (!room) {
    return error("Room not found", 404);
  }

  const clientId = crypto.randomUUID();
  return SSE.createResponse(clientId, code);
}

function hubHealth(): Response {
  return json({ status: "ok", timestamp: Date.now() });
}

// Route handlers for room-specific endpoints
function handleRoomRoute(
  req: Request,
  method: string,
  path: string,
  code: string
): Promise<Response> | Response | null {
  if (path === `/rooms/${code}/join` && method === "POST") {
    return joinRoom(req, code);
  }

  if (LEAVE_PATH_REGEX.test(path) && method === "DELETE") {
    const participantId = path.split("/").pop();
    if (participantId) {
      return leaveRoom(code, participantId);
    }
  }

  if (path === `/rooms/${code}/health` && method === "POST") {
    return healthCheck(req, code);
  }

  if (path === `/rooms/${code}/participants` && method === "GET") {
    return getParticipants(code);
  }

  if (path === `/rooms/${code}/v1/models` && method === "GET") {
    return listModels(code);
  }

  if (path === `/rooms/${code}/v1/chat/completions` && method === "POST") {
    return proxyChatCompletions(req, code);
  }

  if (path === `/rooms/${code}/events` && method === "GET") {
    return sseEvents(code);
  }

  return null;
}

export function createHub(options: HubOptions = {}): Hub {
  const port = options.port ?? 3000;
  const hostname = options.hostname ?? "0.0.0.0";
  const enableMdns = options.mdns ?? false;

  // mDNS service name
  let mdnsName: string | undefined;
  if (enableMdns) {
    mdnsName = `gambiarra-hub-${port}`;
    mDNS.publish({
      name: mdnsName,
      port,
      txt: { version: "1.0", protocol: "http" },
    });
  }

  // Start health check interval to mark stale participants as offline
  const healthInterval = setInterval(() => {
    const stale = Room.checkStaleParticipants();
    for (const { roomId, participantId } of stale) {
      const room = Room.get(roomId);
      if (room) {
        SSE.broadcast("participant:offline", { participantId }, room.code);
      }
    }
  }, HEALTH_CHECK_INTERVAL);

  const server = Bun.serve({
    port,
    hostname,
    fetch(req) {
      const url = new URL(req.url);
      const method = req.method;
      const path = url.pathname;

      // Handle CORS preflight
      if (method === "OPTIONS") {
        return corsHeaders();
      }

      // Health check
      if (path === "/health" && method === "GET") {
        return hubHealth();
      }

      // Room management
      if (path === "/rooms" && method === "POST") {
        return createRoom(req);
      }
      if (path === "/rooms" && method === "GET") {
        return listRooms();
      }

      // Room-specific routes
      const roomMatch = path.match(ROOM_PATH_REGEX);
      if (roomMatch?.[1]) {
        const result = handleRoomRoute(req, method, path, roomMatch[1]);
        if (result) {
          return result;
        }
      }

      return new Response("Not Found", { status: 404 });
    },
  });

  const url = `http://${hostname === "0.0.0.0" ? "localhost" : hostname}:${port}`;

  return {
    server,
    url,
    mdnsName,
    close: () => {
      clearInterval(healthInterval);
      if (mdnsName) {
        mDNS.unpublish(mdnsName);
      }
      Room.clear();
      SSE.closeAll();
      server.stop();
    },
  };
}
