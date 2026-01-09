import { ParticipantInfo as ParticipantInfoSchema } from "@gambiarra/core/types";
import { nanoid } from "nanoid";
import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import type { ActivityLogEntry, ParticipantInfo, RoomState } from "../types";
import {
  SSEConnectedEvent,
  SSELlmCompleteEvent,
  SSELlmErrorEvent,
  SSELlmRequestEvent,
  SSEParticipantJoinedEvent,
  SSEParticipantLeftEvent,
  SSEParticipantOfflineEvent,
  SSERoomCreatedEvent,
} from "../types";
import { useSSE } from "./useSSE";

interface UseRoomOptions {
  hubUrl: string;
  roomCode: string;
  enabled?: boolean;
}

interface UseRoomReturn extends RoomState {
  refresh: () => Promise<void>;
}

export function useRoom(options: UseRoomOptions): UseRoomReturn {
  const { hubUrl, roomCode, enabled = true } = options;

  const [participants, setParticipants] = useState<
    Map<string, ParticipantInfo>
  >(new Map());
  const [logs, setLogs] = useState<ActivityLogEntry[]>([]);
  const [processingRequests, setProcessingRequests] = useState<Set<string>>(
    new Set()
  );
  const [name, setName] = useState(roomCode);

  // Ref to access current participants in event handler
  const participantsRef = useRef(participants);
  participantsRef.current = participants;

  // Fetch initial participants
  const fetchParticipants = useCallback(async () => {
    try {
      const response = await fetch(`${hubUrl}/rooms/${roomCode}/participants`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      const parsed = z.array(ParticipantInfoSchema).safeParse(data);
      if (!parsed.success) {
        console.error("Invalid participants data:", parsed.error);
        return;
      }
      const map = new Map<string, ParticipantInfo>();
      for (const p of parsed.data) {
        map.set(p.id, p);
      }
      setParticipants(map);
    } catch {
      // Will be handled by SSE connection error
    }
  }, [hubUrl, roomCode]);

  const addLog = useCallback(
    (entry: Omit<ActivityLogEntry, "id" | "timestamp" | "roomCode">) => {
      setLogs((prev) => {
        const newEntry: ActivityLogEntry = {
          ...entry,
          id: nanoid(),
          timestamp: Date.now(),
          roomCode,
        };
        // Keep last 100 entries
        const next = [...prev, newEntry];
        if (next.length > 100) {
          return next.slice(-100);
        }
        return next;
      });
    },
    [roomCode]
  );

  // Handle SSE events
  const handleEvent = useCallback(
    (event: string, data: unknown) => {
      switch (event) {
        case "connected": {
          const parsed = SSEConnectedEvent.safeParse(data);
          if (parsed.success) {
            fetchParticipants();
          }
          break;
        }

        case "room:created": {
          const parsed = SSERoomCreatedEvent.safeParse(data);
          if (parsed.success && parsed.data.code === roomCode) {
            setName(parsed.data.name);
          }
          break;
        }

        case "participant:joined": {
          const parsed = SSEParticipantJoinedEvent.safeParse(data);
          if (parsed.success) {
            const participant = parsed.data;
            setParticipants((prev) => {
              const next = new Map(prev);
              next.set(participant.id, participant);
              return next;
            });
            addLog({
              type: "join",
              participantId: participant.id,
              participantName: participant.nickname,
              message: `${participant.nickname} joined`,
            });
          }
          break;
        }

        case "participant:left": {
          const parsed = SSEParticipantLeftEvent.safeParse(data);
          if (parsed.success) {
            const { participantId } = parsed.data;
            const participant = participantsRef.current.get(participantId);
            setParticipants((prev) => {
              const next = new Map(prev);
              next.delete(participantId);
              return next;
            });
            if (participant) {
              addLog({
                type: "leave",
                participantId,
                participantName: participant.nickname,
                message: `${participant.nickname} left`,
              });
            }
          }
          break;
        }

        case "participant:offline": {
          const parsed = SSEParticipantOfflineEvent.safeParse(data);
          if (parsed.success) {
            const { participantId } = parsed.data;
            const participant = participantsRef.current.get(participantId);
            if (participant) {
              setParticipants((prev) => {
                const next = new Map(prev);
                next.set(participantId, { ...participant, status: "offline" });
                return next;
              });
              addLog({
                type: "offline",
                participantId,
                participantName: participant.nickname,
                message: `${participant.nickname} offline`,
              });
            }
          }
          break;
        }

        case "llm:request": {
          const parsed = SSELlmRequestEvent.safeParse(data);
          if (parsed.success) {
            const { participantId, model } = parsed.data;
            setProcessingRequests((prev) => {
              const next = new Set(prev);
              next.add(participantId);
              return next;
            });
            const participant = participantsRef.current.get(participantId);
            if (participant) {
              setParticipants((prev) => {
                const next = new Map(prev);
                next.set(participantId, { ...participant, status: "busy" });
                return next;
              });
            }
            addLog({
              type: "request",
              participantId,
              participantName: participant?.nickname,
              message: `req → ${participant?.nickname ?? participantId} (${model})`,
            });
          }
          break;
        }

        case "llm:complete": {
          const parsed = SSELlmCompleteEvent.safeParse(data);
          if (parsed.success) {
            const { participantId, metrics } = parsed.data;
            setProcessingRequests((prev) => {
              const next = new Set(prev);
              next.delete(participantId);
              return next;
            });
            const participant = participantsRef.current.get(participantId);
            if (participant) {
              setParticipants((prev) => {
                const next = new Map(prev);
                next.set(participantId, { ...participant, status: "online" });
                return next;
              });
            }
            addLog({
              type: "complete",
              participantId,
              message: "complete",
              metrics,
            });
          }
          break;
        }

        case "llm:error": {
          const parsed = SSELlmErrorEvent.safeParse(data);
          if (parsed.success) {
            const { participantId, error: errorMsg } = parsed.data;
            setProcessingRequests((prev) => {
              const next = new Set(prev);
              next.delete(participantId);
              return next;
            });
            const participant = participantsRef.current.get(participantId);
            if (participant) {
              setParticipants((prev) => {
                const next = new Map(prev);
                next.set(participantId, { ...participant, status: "online" });
                return next;
              });
            }
            addLog({
              type: "error",
              participantId,
              message: `error: ${errorMsg}`,
            });
          }
          break;
        }
      }
    },
    [roomCode, fetchParticipants, addLog]
  );

  const { connected, reconnect } = useSSE({
    hubUrl,
    roomCode,
    onEvent: handleEvent,
    enabled,
  });

  // Fetch participants on mount
  useEffect(() => {
    if (enabled) {
      fetchParticipants();
    }
  }, [enabled, fetchParticipants]);

  return {
    code: roomCode,
    name,
    participants,
    logs,
    connected,
    processingRequests,
    refresh: async () => {
      await fetchParticipants();
      reconnect();
    },
  };
}
