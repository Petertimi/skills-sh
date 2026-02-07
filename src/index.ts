#!/usr/bin/env node

import { add } from "./commands/add";

const args = process.argv.slice(2);
const command = args[0];

function printUsage(): void {
  console.log(`Usage: skills <command> [options]

Commands:
  add <owner/repo>    Add skills from a GitHub repository

Examples:
  skills add anthropics/claude-skills
  npx skills-sh add anthropics/claude-skills`);
}

async function main(): Promise<void> {
  if (!command || command === "--help" || command === "-h") {
    printUsage();
    process.exit(0);
  }

  switch (command) {
    case "add": {
      const target = args[1];
      if (!target) {
        console.error("Error: Missing <owner/repo> argument.\n");
        printUsage();
        process.exit(1);
      }
      await add(target);
      break;
    }
    default:
      console.error(`Error: Unknown command '${command}'.\n`);
      printUsage();
      process.exit(1);
  }
}

main().catch((err: Error) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
