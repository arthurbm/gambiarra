import { hostname as getHostname } from "node:os";
import { createHub } from "@gambiarra/core/hub";
import { printLogo } from "@gambiarra/core/logo";
import { Command, Option } from "clipanion";

export class ServeCommand extends Command {
  static override paths = [["serve"]];

  static override usage = Command.Usage({
    description: "Start the Gambiarra hub server",
    examples: [
      ["Start on default port 3000", "gambiarra serve"],
      ["Start on custom port", "gambiarra serve --port 8080"],
      ["Start with mDNS discovery", "gambiarra serve --mdns"],
    ],
  });

  port = Option.String("--port,-p", "3000", {
    description: "Port to listen on",
  });

  host = Option.String("--host,-h", "0.0.0.0", {
    description: "Host to bind to",
  });

  mdns = Option.Boolean("--mdns,-m", false, {
    description: "Enable mDNS (Bonjour/Zeroconf) for local network discovery",
  });

  quiet = Option.Boolean("--quiet,-q", false, {
    description: "Suppress logo output",
  });

  async execute(): Promise<number> {
    if (!this.quiet) {
      printLogo();
    }

    const port = Number.parseInt(this.port, 10);
    if (Number.isNaN(port)) {
      this.context.stderr.write(`Invalid port: ${this.port}\n`);
      return 1;
    }

    const hub = createHub({
      port,
      hostname: this.host,
      mdns: this.mdns,
    });

    this.context.stdout.write(`Hub started at ${hub.url}\n`);
    this.context.stdout.write(
      `Health check: http://${this.host}:${port}/health\n`
    );

    if (hub.mdnsName) {
      const localHostname = getHostname();
      this.context.stdout.write(
        `mDNS: http://${localHostname}.local:${port}\n`
      );
      this.context.stdout.write(
        `      Service: ${hub.mdnsName}._gambiarra._tcp.local\n`
      );
    }

    this.context.stdout.write("\nPress Ctrl+C to stop\n");

    process.on("SIGINT", () => {
      this.context.stdout.write("\nShutting down...\n");
      hub.close();
      process.exit(0);
    });

    // Keep process running until SIGINT
    await new Promise(() => undefined);
    return 0;
  }
}
