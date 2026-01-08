import { useKeyboard, useRenderer } from "@opentui/react";
import { useCallback, useState } from "react";
import { ActivityLog } from "./components/ActivityLog";
import { AddRoomModal } from "./components/AddRoomModal";
import { Footer } from "./components/Footer";
import { Header } from "./components/Header";
import { ParticipantList } from "./components/ParticipantList";
import { RoomSelector } from "./components/RoomSelector";
import { RoomTabs } from "./components/RoomTabs";
import { useRooms } from "./hooks/useRooms";

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

  // Keyboard shortcuts for dashboard
  useKeyboard(
    (key) => {
      if (screen !== "dashboard") {
        return;
      }

      if (key.name === "q") {
        handleQuit();
      } else if (key.name === "tab") {
        // Cycle through rooms
        const roomList = [...rooms.keys()];
        if (roomList.length > 1 && activeRoom) {
          const currentIndex = roomList.indexOf(activeRoom);
          const nextIndex = (currentIndex + 1) % roomList.length;
          setActiveRoom(roomList[nextIndex] ?? null);
        }
      } else if (key.name === "a") {
        setScreen("addRoom");
      } else if (key.name === "r") {
        // Refresh current room
        if (activeRoom) {
          const room = rooms.get(activeRoom);
          if (room) {
            // Force re-fetch by removing and re-adding
            removeRoom(activeRoom);
            addRoom(activeRoom);
          }
        }
      } else if (key.name === "e") {
        setExpanded((prev) => !prev);
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
