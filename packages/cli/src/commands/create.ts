import { Command, Option } from "clipanion";

interface CreateRoomResponse {
  room: {
    id: string;
    code: string;
    name: string;
    hostId: string;
    createdAt: number;
  };
  hostId: string;
}

interface ErrorResponse {
  error: string;
}

export class CreateCommand extends Command {
  static override paths = [["create"]];

  static override usage = Command.Usage({
    description: "Create a new room on a hub",
    examples: [
      ["Create a room", "gambiarra create --name 'My Room'"],
      [
        "Create on custom hub",
        "gambiarra create --name 'My Room' --hub http://192.168.1.10:3000",
      ],
      [
        "Create a password-protected room",
        "gambiarra create --name 'My Room' --password secret123",
      ],
    ],
  });

  name = Option.String("--name,-n", {
    description: "Room name",
    required: true,
  });

  password = Option.String("--password,-p", {
    description: "Optional password to protect the room",
    required: false,
  });

  hub = Option.String("--hub,-H", "http://localhost:3000", {
    description: "Hub URL",
  });

  async execute(): Promise<number> {
    try {
      const body: { name: string; password?: string } = { name: this.name };
      if (this.password) {
        body.password = this.password;
      }

      const response = await fetch(`${this.hub}/rooms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const data = (await response.json()) as ErrorResponse;
        this.context.stderr.write(`Error: ${data.error}\n`);
        return 1;
      }

      const data = (await response.json()) as CreateRoomResponse;

      this.context.stdout.write("Room created!\n");
      this.context.stdout.write(`  Code: ${data.room.code}\n`);
      this.context.stdout.write(`  ID: ${data.room.id}\n`);
      if (this.password) {
        this.context.stdout.write("  Protection: Password-protected\n");
      }
      this.context.stdout.write(
        "\nShare the code with participants to join.\n"
      );

      return 0;
    } catch (err) {
      this.context.stderr.write(`Failed to connect to hub at ${this.hub}\n`);
      this.context.stderr.write(`${err}\n`);
      return 1;
    }
  }
}
