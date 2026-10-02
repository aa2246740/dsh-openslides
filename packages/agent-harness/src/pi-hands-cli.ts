/**
 * CLI used by the Pi extension so each skill tool runs in this package, not in chat.
 * Usage: node dist/pi-hands-cli.js <toolName> <jsonArgs>
 */
import { runPiHand } from "./pi-hands.js";

function writeResultAndExit(result: unknown, exitCode: number): void {
  process.stdout.write(`${JSON.stringify(result)}\n`, () => {
    process.exit(exitCode);
  });
}

const name = process.argv[2]?.trim() ?? "";
const raw = process.argv[3] ?? "{}";
let args: Record<string, unknown> = {};
try {
  const parsed: unknown = JSON.parse(raw);
  args = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
} catch {
  writeResultAndExit(
    { name, ok: false, summary: "bad json", detail: "args must be JSON", payload: {} },
    2,
  );
}

const result = await runPiHand(name, args, process.cwd());
writeResultAndExit(result, result.ok ? 0 : 1);
