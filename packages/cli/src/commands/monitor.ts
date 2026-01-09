import { Command, Option } from "clipanion";
import { startTUI } from "tui";

export class MonitorCommand extends Command {
  static override paths = [["monitor"]];

  static override usage = Command.Usage({
    description: "Open TUI to monitor rooms in real-time",
    examples: [
      ["Monitor local hub", "gambiarra monitor"],
      [
        "Monitor remote hub",
        "gambiarra monitor --hub http://192.168.1.100:3000",
      ],
    ],
  });

  hub = Option.String("--hub,-h", "http://localhost:3000", {
    description: "Hub URL to connect to",
  });

  async execute(): Promise<number> {
    await startTUI({ hubUrl: this.hub });
    return 0;
  }
}
