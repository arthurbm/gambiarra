import { useCallback, useEffect, useRef, useState } from "react";
import type { SSEEvent } from "../types";

interface UseSSEOptions {
  hubUrl: string;
  roomCode: string;
  onEvent: (event: string, data: unknown) => void;
  enabled?: boolean;
}

interface UseSSEReturn {
  connected: boolean;
  error: Error | null;
  reconnect: () => void;
}

const RECONNECT_DELAY = 3000;
const MAX_RECONNECT_ATTEMPTS = 10;

export function useSSE(options: UseSSEOptions): UseSSEReturn {
  const { hubUrl, roomCode, onEvent, enabled = true } = options;

  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  const connect = useCallback(async () => {
    if (!enabled) {
      return;
    }

    // Cleanup previous connection
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await fetch(`${hubUrl}/rooms/${roomCode}/events`, {
        signal: controller.signal,
        headers: {
          Accept: "text/event-stream",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      if (!response.body) {
        throw new Error("No response body");
      }

      setConnected(true);
      setError(null);
      reconnectAttemptsRef.current = 0;

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });

        // Parse SSE events from buffer
        const events = parseSSEBuffer(buffer);
        buffer = events.remaining;

        for (const event of events.parsed) {
          onEvent(event.event, event.data);
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        // Intentional abort, don't reconnect
        return;
      }

      setConnected(false);
      setError(err instanceof Error ? err : new Error(String(err)));

      // Attempt reconnection
      if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttemptsRef.current++;
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, RECONNECT_DELAY);
      }
    }
  }, [hubUrl, roomCode, onEvent, enabled]);

  const reconnect = useCallback(() => {
    reconnectAttemptsRef.current = 0;
    connect();
  }, [connect]);

  useEffect(() => {
    if (enabled) {
      connect();
    }

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [connect, enabled]);

  return { connected, error, reconnect };
}

interface ParsedSSEResult {
  parsed: SSEEvent[];
  remaining: string;
}

function parseSSEBuffer(buffer: string): ParsedSSEResult {
  const events: SSEEvent[] = [];
  const lines = buffer.split("\n");

  let currentEvent = "";
  let currentData = "";
  let i = 0;

  for (; i < lines.length; i++) {
    const line = lines[i] as string;

    if (line === "") {
      // Empty line marks end of event
      if (currentEvent && currentData) {
        try {
          events.push({
            event: currentEvent,
            data: JSON.parse(currentData),
          });
        } catch {
          // Invalid JSON, skip event
        }
      }
      currentEvent = "";
      currentData = "";
      continue;
    }

    if (line.startsWith("event: ")) {
      currentEvent = line.slice(7);
    } else if (line.startsWith("data: ")) {
      currentData = line.slice(6);
    }
  }

  // Return any incomplete event data as remaining buffer
  let remaining = "";
  if (currentEvent || currentData) {
    // Reconstruct the incomplete event
    if (currentEvent) {
      remaining += `event: ${currentEvent}\n`;
    }
    if (currentData) {
      remaining += `data: ${currentData}\n`;
    }
  }

  return { parsed: events, remaining };
}
