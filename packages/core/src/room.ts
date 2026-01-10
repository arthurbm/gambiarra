import { nanoid } from "nanoid";
import {
  PARTICIPANT_TIMEOUT,
  type ParticipantInfo,
  type RoomInfo,
} from "./types.ts";

// Password hashing utilities using Web Crypto API
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  const passwordHash = await hashPassword(password);
  return passwordHash === hash;
}

const rooms = new Map<string, RoomState>();
const codeToRoomId = new Map<string, string>();

interface RoomState {
  info: RoomInfo;
  participants: Map<string, ParticipantInfo>;
}

async function create(
  name: string,
  hostId: string,
  password?: string
): Promise<RoomInfo> {
  const id = nanoid();
  const code = nanoid(6).toUpperCase();

  const info: RoomInfo = {
    id,
    code,
    name,
    hostId,
    createdAt: Date.now(),
    passwordHash: password ? await hashPassword(password) : undefined,
  };

  rooms.set(id, {
    info,
    participants: new Map(),
  });
  codeToRoomId.set(code, id);

  return info;
}

function get(id: string): RoomInfo | undefined {
  return rooms.get(id)?.info;
}

function getByCode(code: string): RoomInfo | undefined {
  const id = codeToRoomId.get(code.toUpperCase());
  return id ? rooms.get(id)?.info : undefined;
}

function list(): RoomInfo[] {
  return Array.from(rooms.values()).map((r) => r.info);
}

function listWithParticipantCount(): (RoomInfo & {
  participantCount: number;
})[] {
  return Array.from(rooms.values()).map((r) => ({
    ...r.info,
    participantCount: r.participants.size,
  }));
}

function remove(id: string): boolean {
  const room = rooms.get(id);
  if (!room) {
    return false;
  }

  codeToRoomId.delete(room.info.code);
  rooms.delete(id);
  return true;
}

function addParticipant(roomId: string, participant: ParticipantInfo): boolean {
  const room = rooms.get(roomId);
  if (!room) {
    return false;
  }

  room.participants.set(participant.id, participant);
  return true;
}

function removeParticipant(roomId: string, participantId: string): boolean {
  const room = rooms.get(roomId);
  if (!room) {
    return false;
  }

  return room.participants.delete(participantId);
}

function getParticipants(roomId: string): ParticipantInfo[] {
  const room = rooms.get(roomId);
  return room ? Array.from(room.participants.values()) : [];
}

function getParticipant(
  roomId: string,
  participantId: string
): ParticipantInfo | undefined {
  return rooms.get(roomId)?.participants.get(participantId);
}

function updateParticipantStatus(
  roomId: string,
  participantId: string,
  status: ParticipantInfo["status"]
): boolean {
  const participant = rooms.get(roomId)?.participants.get(participantId);
  if (!participant) {
    return false;
  }

  participant.status = status;
  return true;
}

function updateLastSeen(roomId: string, participantId: string): boolean {
  const participant = rooms.get(roomId)?.participants.get(participantId);
  if (!participant) {
    return false;
  }

  participant.lastSeen = Date.now();
  participant.status = "online";
  return true;
}

function findParticipantByModel(
  roomId: string,
  model: string
): ParticipantInfo | undefined {
  const room = rooms.get(roomId);
  if (!room) {
    return undefined;
  }

  for (const participant of room.participants.values()) {
    if (participant.model === model && participant.status === "online") {
      return participant;
    }
  }
  return undefined;
}

function getRandomOnlineParticipant(
  roomId: string
): ParticipantInfo | undefined {
  const room = rooms.get(roomId);
  if (!room) {
    return undefined;
  }

  const online = Array.from(room.participants.values()).filter(
    (p) => p.status === "online"
  );

  if (online.length === 0) {
    return undefined;
  }
  return online[Math.floor(Math.random() * online.length)];
}

function checkStaleParticipants(): { roomId: string; participantId: string }[] {
  const stale: { roomId: string; participantId: string }[] = [];
  const now = Date.now();

  for (const [roomId, room] of rooms) {
    for (const participant of room.participants.values()) {
      if (now - participant.lastSeen > PARTICIPANT_TIMEOUT) {
        participant.status = "offline";
        stale.push({ roomId, participantId: participant.id });
      }
    }
  }

  return stale;
}

function clear(): void {
  rooms.clear();
  codeToRoomId.clear();
}

async function validatePassword(
  roomId: string,
  password: string
): Promise<boolean> {
  const room = rooms.get(roomId);
  if (!room) {
    return false;
  }

  // If room has no password, allow access
  if (!room.info.passwordHash) {
    return true;
  }

  // If room has password but none provided, deny access
  if (!password) {
    return false;
  }

  // Verify password
  return await verifyPassword(password, room.info.passwordHash);
}

export const Room = {
  create,
  get,
  getByCode,
  list,
  listWithParticipantCount,
  remove,
  addParticipant,
  removeParticipant,
  getParticipants,
  getParticipant,
  updateParticipantStatus,
  updateLastSeen,
  findParticipantByModel,
  getRandomOnlineParticipant,
  checkStaleParticipants,
  validatePassword,
  clear,
} as const;
