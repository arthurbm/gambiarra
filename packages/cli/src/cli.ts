#!/usr/bin/env bun
import { Builtins, Cli } from "clipanion";
import { CreateCommand } from "./commands/create.ts";
import { JoinCommand } from "./commands/join.ts";
import { ListCommand } from "./commands/list.ts";
import { ServeCommand } from "./commands/serve.ts";

const cli = new Cli({
  binaryLabel: "gambiarra",
  binaryName: "gambiarra",
  binaryVersion: "0.0.1",
});

cli.register(ServeCommand);
cli.register(CreateCommand);
cli.register(JoinCommand);
cli.register(ListCommand);
cli.register(Builtins.HelpCommand);
cli.register(Builtins.VersionCommand);

cli.runExit(process.argv.slice(2));
