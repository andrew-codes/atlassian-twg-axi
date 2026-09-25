import { spawn } from "node:child_process";
import { constants } from "node:os";
import { needsToonConversion, parseOutputMode } from "./output-mode.js";
import { convertToToon } from "./toon-convert.js";

// Overridable only so tests can point at a fixture binary instead of the real twg CLI.
const TWG_BIN = process.env.TWG_AXI_BIN ?? "twg";

const FORWARDED_SIGNALS = ["SIGINT", "SIGTERM", "SIGHUP"] as const;

function reportSpawnFailure(error: NodeJS.ErrnoException): number {
  if (error.code === "ENOENT") {
    process.stderr.write(
      `twg-axi: could not find "${TWG_BIN}" on PATH. Install the twg CLI and ensure it is reachable.\n`,
    );
    return 127;
  }
  process.stderr.write(`twg-axi: failed to run "${TWG_BIN}": ${error.message}\n`);
  return 1;
}

function exitCodeFor(code: number | null, signal: NodeJS.Signals | null): number {
  if (signal) return 128 + (constants.signals[signal] ?? 0);
  return code ?? 1;
}

async function runPassthrough(argv: string[]): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(TWG_BIN, argv, { stdio: "inherit" });

    for (const signal of FORWARDED_SIGNALS) {
      process.on(signal, () => child.kill(signal));
    }

    child.on("error", (error) => resolve(reportSpawnFailure(error as NodeJS.ErrnoException)));
    child.on("close", (code, signal) => resolve(exitCodeFor(code, signal)));
  });
}

async function runWithConversion(argv: string[], format: string): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(TWG_BIN, argv, { stdio: ["inherit", "pipe", "inherit"] });
    const chunks: Buffer[] = [];

    for (const signal of FORWARDED_SIGNALS) {
      process.on(signal, () => child.kill(signal));
    }

    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.on("error", (error) => resolve(reportSpawnFailure(error as NodeJS.ErrnoException)));
    child.on("close", (code, signal) => {
      const raw = Buffer.concat(chunks).toString("utf8");
      process.stdout.write(convertToToon(raw, format));
      resolve(exitCodeFor(code, signal));
    });
  });
}

export async function main(argv: string[]): Promise<number> {
  const mode = parseOutputMode(argv);
  return needsToonConversion(mode) ? runWithConversion(argv, mode.format) : runPassthrough(argv);
}
