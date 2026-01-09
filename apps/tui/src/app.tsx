import { useKeyboard, useRenderer } from "@opentui/react";
import { useCallback, useState } from "react";
import { ActivityLog } from "./components/activity-log";
import { AddRoomModal } from "./components/add-room-modal";
import { Footer } from "./components/footer";
import { Header } from "./components/header";
import { ParticipantList } from "./components/participant-list";
import { RoomSelector } from "./components/room-selector";
import { RoomTabs } from "./components/room-tabs";
import { useRooms } from "./hooks/use-rooms";

type Screen = "selector" | "dashboard" | "addRoom";

interface AppProps {
  hubUrl: string;
}

export function App({ hubUrl }: AppProps) {
  const renderer = useRenderer();
  const [screen, setScreen] = useState<Screen>("selector");
  const [expanded, setExpanded] = useState(false);

  const {
    rooms,
    activeRoom,
    setActiveRoom,
    addRoom,
    removeRoom,
    allConnected,
  } = useRooms({ hubUrl });

  const handleSelectRooms = useCallback(
    (roomCodes: string[]) => {
      for (const code of roomCodes) {
        addRoom(code);
      }
      setScreen("dashboard");
    },
    [addRoom]
  );

  const handleQuit = useCallback(() => {
    renderer.destroy();
    process.exit(0);
  }, [renderer]);

  const handleAddRoom = useCallback(
    (code: string) => {
      addRoom(code);
      setScreen("dashboard");
    },
    [addRoom]
  );

  const handleCycleRooms = useCallback(() => {
    const roomList = [...rooms.keys()];
    if (roomList.length > 1 && activeRoom) {
      const currentIndex = roomList.indexOf(activeRoom);
      const nextIndex = (currentIndex + 1) % roomList.length;
      setActiveRoom(roomList[nextIndex] ?? null);
    }
  }, [rooms, activeRoom, setActiveRoom]);

  const handleRefreshRoom = useCallback(() => {
    if (activeRoom && rooms.has(activeRoom)) {
      removeRoom(activeRoom);
      addRoom(activeRoom);
    }
  }, [activeRoom, rooms, removeRoom, addRoom]);

  const keyboardHandlers: Record<string, () => void> = {
    q: handleQuit,
    tab: handleCycleRooms,
    a: () => setScreen("addRoom"),
    r: handleRefreshRoom,
    e: () => setExpanded((prev) => !prev),
  };

  useKeyboard(
    (key) => {
      if (screen !== "dashboard") {
        return;
      }
      const handler = keyboardHandlers[key.name];
      if (handler) {
        handler();
      }
    },
    { release: false }
  );

  // Room selector screen
  if (screen === "selector") {
    return (
      <RoomSelector
        hubUrl={hubUrl}
        onQuit={handleQuit}
        onSelectRooms={handleSelectRooms}
      />
    );
  }

  // Add room modal
  if (screen === "addRoom") {
    return (
      <AddRoomModal
        hubUrl={hubUrl}
        onAdd={handleAddRoom}
        onCancel={() => setScreen("dashboard")}
      />
    );
  }

  // Main dashboard
  const currentRoom = activeRoom ? rooms.get(activeRoom) : null;

  return (
    <box flexDirection="column" flexGrow={1}>
      {/* Header */}
      <Header connected={allConnected} hubUrl={hubUrl} roomCount={rooms.size} />

      {/* Room tabs */}
      <RoomTabs activeRoom={activeRoom} rooms={rooms} />

      {/* Main content area */}
      <box flexDirection="row" flexGrow={1}>
        {/* Participants panel */}
        <box flexGrow={1}>
          {currentRoom ? (
            <ParticipantList
              expanded={expanded}
              participants={currentRoom.participants}
              processingRequests={currentRoom.processingRequests}
            />
          ) : (
            <box
              alignItems="center"
              borderStyle="single"
              flexGrow={1}
              justifyContent="center"
            >
              <text>No room selected</text>
            </box>
          )}
        </box>

        {/* Activity log panel */}
        <box flexGrow={1}>
          {currentRoom ? (
            <ActivityLog entries={currentRoom.logs} />
          ) : (
            <box
              alignItems="center"
              borderStyle="single"
              flexGrow={1}
              justifyContent="center"
            >
              <text>No activity</text>
            </box>
          )}
        </box>
      </box>

      {/* Footer */}
      <Footer
        shortcuts={[
          { key: "q", description: "Quit" },
          { key: "Tab", description: "Switch" },
          { key: "a", description: "Add Room" },
          { key: "e", description: expanded ? "Collapse" : "Expand" },
          { key: "r", description: "Refresh" },
        ]}
      />
    </box>
  );
}
