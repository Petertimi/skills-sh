#!/usr/bin/env node

import { add } from "./commands/add";

const args = process.argv.slice(2);
const command = args[0];

function printUsage(): void {
  console.log(`Usage: skills <command> [options]

Commands:
  add <owner/repo | url> [--skill <name>]    Add skills from a GitHub repository

Options:
  --skill <name>    Install a specific skill from the repository

Examples:
  skills add anthropics/claude-skills
  skills add https://github.com/anthropics/claude-skills
  skills add anthropics/claude-skills --skill my-skill
  npx skills-sh add https://github.com/owner/repo --skill react-patterns`);
}

function parseAddArgs(rawArgs: string[]): { target: string; skill?: string } {
  let target = "";
  let skill: string | undefined;

  for (let i = 0; i < rawArgs.length; i++) {
    if (rawArgs[i] === "--skill" || rawArgs[i] === "-s") {
      skill = rawArgs[++i];
      if (!skill) {
        console.error("Error: --skill requires a name argument.\n");
        printUsage();
        process.exit(1);
      }
    } else if (!target) {
      target = rawArgs[i];
    }
  }

  return { target, skill };
}

async function main(): Promise<void> {
  if (!command || command === "--help" || command === "-h") {
    printUsage();
    process.exit(0);
  }

  switch (command) {
    case "add": {
      const { target, skill } = parseAddArgs(args.slice(1));
      if (!target) {
        console.error("Error: Missing <owner/repo> or URL argument.\n");
        printUsage();
        process.exit(1);
      }
      await add(target, skill);
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
