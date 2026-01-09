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

interface UseRoomsOptions {
  hubUrl: string;
}

interface RoomConnection {
  code: string;
  abortController: AbortController;
  connected: boolean;
}

interface UseRoomsReturn {
  rooms: Map<string, RoomState>;
  activeRoom: string | null;
  setActiveRoom: (code: string | null) => void;
  addRoom: (code: string) => void;
  removeRoom: (code: string) => void;
  refreshRoom: (code: string) => Promise<void>;
  allConnected: boolean;
}

const RECONNECT_DELAY = 3000;

export function useRooms(options: UseRoomsOptions): UseRoomsReturn {
  const { hubUrl } = options;

  const [rooms, setRooms] = useState<Map<string, RoomState>>(new Map());
  const [activeRoom, setActiveRoom] = useState<string | null>(null);

  const connectionsRef = useRef<Map<string, RoomConnection>>(new Map());
  const reconnectTimeoutsRef = useRef<
    Map<string, ReturnType<typeof setTimeout>>
  >(new Map());

  const addLog = useCallback(
    (
      code: string,
      entry: Omit<ActivityLogEntry, "id" | "timestamp" | "roomCode">
    ) => {
      setRooms((prev) => {
        const room = prev.get(code);
        if (!room) {
          return prev;
        }

        const newEntry: ActivityLogEntry = {
          ...entry,
          id: nanoid(),
          timestamp: Date.now(),
          roomCode: code,
        };

        const logs = [...room.logs, newEntry];
        const next = new Map(prev);
        next.set(code, {
          ...room,
          logs: logs.length > 100 ? logs.slice(-100) : logs,
        });
        return next;
      });
    },
    []
  );

  const handleSSEEvent = useCallback(
    (code: string, event: string, data: unknown) => {
      setRooms((prev) => {
        const room = prev.get(code);
        if (!room) {
          return prev;
        }

        const next = new Map(prev);

        switch (event) {
          case "connected": {
            SSEConnectedEvent.safeParse(data);
            next.set(code, { ...room, connected: true });
            break;
          }

          case "room:created": {
            const parsed = SSERoomCreatedEvent.safeParse(data);
            if (parsed.success && parsed.data.code === code) {
              next.set(code, { ...room, name: parsed.data.name });
            }
            break;
          }

          case "participant:joined": {
            const parsed = SSEParticipantJoinedEvent.safeParse(data);
            if (parsed.success) {
              const participant = parsed.data;
              const participants = new Map(room.participants);
              participants.set(participant.id, participant);
              next.set(code, { ...room, participants });

              // Log outside of setRooms to avoid nested setState
              setTimeout(() => {
                addLog(code, {
                  type: "join",
                  participantId: participant.id,
                  participantName: participant.nickname,
                  message: `${participant.nickname} joined`,
                });
              }, 0);
            }
            break;
          }

          case "participant:left": {
            const parsed = SSEParticipantLeftEvent.safeParse(data);
            if (parsed.success) {
              const { participantId } = parsed.data;
              const participant = room.participants.get(participantId);
              const participants = new Map(room.participants);
              participants.delete(participantId);
              next.set(code, { ...room, participants });

              if (participant) {
                setTimeout(() => {
                  addLog(code, {
                    type: "leave",
                    participantId,
                    participantName: participant.nickname,
                    message: `${participant.nickname} left`,
                  });
                }, 0);
              }
            }
            break;
          }

          case "participant:offline": {
            const parsed = SSEParticipantOfflineEvent.safeParse(data);
            if (parsed.success) {
              const { participantId } = parsed.data;
              const participant = room.participants.get(participantId);
              if (participant) {
                const participants = new Map(room.participants);
                participants.set(participantId, {
                  ...participant,
                  status: "offline",
                });
                next.set(code, { ...room, participants });

                setTimeout(() => {
                  addLog(code, {
                    type: "offline",
                    participantId,
                    participantName: participant.nickname,
                    message: `${participant.nickname} offline`,
                  });
                }, 0);
              }
            }
            break;
          }

          case "llm:request": {
            const parsed = SSELlmRequestEvent.safeParse(data);
            if (parsed.success) {
              const { participantId, model } = parsed.data;
              const participant = room.participants.get(participantId);
              const processingRequests = new Set(room.processingRequests);
              processingRequests.add(participantId);

              if (participant) {
                const participants = new Map(room.participants);
                participants.set(participantId, {
                  ...participant,
                  status: "busy",
                });
                next.set(code, { ...room, participants, processingRequests });
              } else {
                next.set(code, { ...room, processingRequests });
              }

              setTimeout(() => {
                addLog(code, {
                  type: "request",
                  participantId,
                  participantName: participant?.nickname,
                  message: `req → ${participant?.nickname ?? participantId} (${model})`,
                });
              }, 0);
            }
            break;
          }

          case "llm:complete": {
            const parsed = SSELlmCompleteEvent.safeParse(data);
            if (parsed.success) {
              const { participantId, metrics } = parsed.data;
              const participant = room.participants.get(participantId);
              const processingRequests = new Set(room.processingRequests);
              processingRequests.delete(participantId);

              if (participant) {
                const participants = new Map(room.participants);
                participants.set(participantId, {
                  ...participant,
                  status: "online",
                });
                next.set(code, { ...room, participants, processingRequests });
              } else {
                next.set(code, { ...room, processingRequests });
              }

              setTimeout(() => {
                addLog(code, {
                  type: "complete",
                  participantId,
                  message: "complete",
                  metrics,
                });
              }, 0);
            }
            break;
          }

          case "llm:error": {
            const parsed = SSELlmErrorEvent.safeParse(data);
            if (parsed.success) {
              const { participantId, error: errorMsg } = parsed.data;
              const participant = room.participants.get(participantId);
              const processingRequests = new Set(room.processingRequests);
              processingRequests.delete(participantId);

              if (participant) {
                const participants = new Map(room.participants);
                participants.set(participantId, {
                  ...participant,
                  status: "online",
                });
                next.set(code, { ...room, participants, processingRequests });
              } else {
                next.set(code, { ...room, processingRequests });
              }

              setTimeout(() => {
                addLog(code, {
                  type: "error",
                  participantId,
                  message: `error: ${errorMsg}`,
                });
              }, 0);
            }
            break;
          }
        }

        return next;
      });
    },
    [addLog]
  );

  const fetchParticipants = useCallback(
    async (code: string) => {
      try {
        const response = await fetch(`${hubUrl}/rooms/${code}/participants`);
        if (!response.ok) {
          return;
        }

        const data: unknown = await response.json();
        // API returns { participants: [...] }
        const participantsArray =
          data && typeof data === "object" && "participants" in data
            ? (data as { participants: unknown }).participants
            : data;
        const parsed = z
          .array(ParticipantInfoSchema)
          .safeParse(participantsArray);
        if (!parsed.success) {
          return;
        }

        const participants = new Map<string, ParticipantInfo>();
        for (const p of parsed.data) {
          participants.set(p.id, p);
        }

        setRooms((prev) => {
          const room = prev.get(code);
          if (!room) {
            return prev;
          }
          const next = new Map(prev);
          next.set(code, { ...room, participants });
          return next;
        });
      } catch {
        // Ignore fetch errors
      }
    },
    [hubUrl]
  );

  const connectToRoom = useCallback(
    async (code: string) => {
      // Cleanup existing connection
      const existing = connectionsRef.current.get(code);
      if (existing) {
        existing.abortController.abort();
      }

      const abortController = new AbortController();
      connectionsRef.current.set(code, {
        code,
        abortController,
        connected: false,
      });

      try {
        const response = await fetch(`${hubUrl}/rooms/${code}/events`, {
          signal: abortController.signal,
          headers: { Accept: "text/event-stream" },
        });

        if (!(response.ok && response.body)) {
          throw new Error(`HTTP ${response.status}`);
        }

        // Fetch initial participants
        fetchParticipants(code);

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });

          // Parse SSE events
          const lines = buffer.split("\n");
          let currentEvent = "";
          let currentData = "";

          for (const line of lines) {
            if (line === "") {
              if (currentEvent && currentData) {
                try {
                  const data = JSON.parse(currentData);
                  handleSSEEvent(code, currentEvent, data);
                } catch {
                  // Invalid JSON
                }
              }
              currentEvent = "";
              currentData = "";
            } else if (line.startsWith("event: ")) {
              currentEvent = line.slice(7);
            } else if (line.startsWith("data: ")) {
              currentData = line.slice(6);
            }
          }

          // Keep incomplete data in buffer
          buffer =
            currentEvent || currentData
              ? `event: ${currentEvent}\ndata: ${currentData}\n`
              : "";
        }
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          return;
        }

        setRooms((prev) => {
          const room = prev.get(code);
          if (!room) {
            return prev;
          }
          const next = new Map(prev);
          next.set(code, { ...room, connected: false });
          return next;
        });

        // Schedule reconnect
        const timeout = setTimeout(() => {
          if (connectionsRef.current.has(code)) {
            connectToRoom(code);
          }
        }, RECONNECT_DELAY);
        reconnectTimeoutsRef.current.set(code, timeout);
      }
    },
    [hubUrl, fetchParticipants, handleSSEEvent]
  );

  const addRoom = useCallback(
    (code: string) => {
      if (rooms.has(code)) {
        return;
      }

      setRooms((prev) => {
        const next = new Map(prev);
        next.set(code, {
          code,
          name: code,
          participants: new Map(),
          logs: [],
          connected: false,
          processingRequests: new Set(),
        });
        return next;
      });

      // Set as active if first room
      if (activeRoom === null) {
        setActiveRoom(code);
      }

      connectToRoom(code);
    },
    [rooms, activeRoom, connectToRoom]
  );

  const removeRoom = useCallback(
    (code: string) => {
      // Abort connection
      const connection = connectionsRef.current.get(code);
      if (connection) {
        connection.abortController.abort();
        connectionsRef.current.delete(code);
      }

      // Clear reconnect timeout
      const timeout = reconnectTimeoutsRef.current.get(code);
      if (timeout) {
        clearTimeout(timeout);
        reconnectTimeoutsRef.current.delete(code);
      }

      // Remove from state
      setRooms((prev) => {
        const next = new Map(prev);
        next.delete(code);
        return next;
      });

      // Update active room if needed
      setActiveRoom((current) => {
        if (current === code) {
          const remaining = [...rooms.keys()].filter((k) => k !== code);
          return remaining[0] ?? null;
        }
        return current;
      });
    },
    [rooms]
  );

  const refreshRoom = useCallback(
    async (code: string) => {
      await fetchParticipants(code);

      // Reconnect SSE
      const connection = connectionsRef.current.get(code);
      if (connection) {
        connection.abortController.abort();
      }
      connectToRoom(code);
    },
    [fetchParticipants, connectToRoom]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      for (const connection of connectionsRef.current.values()) {
        connection.abortController.abort();
      }
      for (const timeout of reconnectTimeoutsRef.current.values()) {
        clearTimeout(timeout);
      }
    };
  }, []);

  const allConnected =
    rooms.size > 0 && [...rooms.values()].every((r) => r.connected);

  return {
    rooms,
    activeRoom,
    setActiveRoom,
    addRoom,
    removeRoom,
    refreshRoom,
    allConnected,
  };
}
