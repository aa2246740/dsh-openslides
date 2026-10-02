import fs from "node:fs";
import path from "node:path";

export type KernelLease = {
  kernel: "dsh" | "pi";
  pid: number;
  sessionId?: string;
  startedAt: string;
};

const LOCK_REL = path.join("_agent", "kernel.lock");

function lockPath(projectRoot: string): string {
  return path.join(projectRoot, LOCK_REL);
}

function pidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function readProjectLease(projectRoot: string): KernelLease | undefined {
  const file = lockPath(projectRoot);
  if (!fs.existsSync(file)) return undefined;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as KernelLease;
  } catch {
    return undefined;
  }
}

export function acquireProjectLease(
  projectRoot: string,
  kernel: "dsh",
  sessionId?: string,
): KernelLease {
  fs.mkdirSync(path.join(projectRoot, "_agent"), { recursive: true });
  const existing = readProjectLease(projectRoot);
  if (existing && existing.kernel !== kernel && pidAlive(existing.pid)) {
    throw new Error(
      `project leased by ${existing.kernel} pid ${existing.pid}; ${kernel} cannot write`,
    );
  }
  const lease: KernelLease = {
    kernel,
    pid: process.pid,
    sessionId,
    startedAt: new Date().toISOString(),
  };
  fs.writeFileSync(lockPath(projectRoot), `${JSON.stringify(lease, null, 2)}\n`);
  return lease;
}

export function releaseProjectLease(projectRoot: string, kernel: "dsh"): void {
  const existing = readProjectLease(projectRoot);
  if (!existing || existing.kernel !== kernel) return;
  if (existing.pid !== process.pid && pidAlive(existing.pid)) return;
  fs.rmSync(lockPath(projectRoot), { force: true });
}
