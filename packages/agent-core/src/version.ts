import { createId } from "./util.js";

export interface VersionStamp {
  versionId: string;
  versionNumber: number;
  versionLabel: string;
}

/** Next version after a generate (starts at 1) or refinement bump. */
export function nextVersion(baseVersionNumber?: number): VersionStamp {
  const versionNumber =
    baseVersionNumber === undefined || baseVersionNumber < 1
      ? 1
      : Math.floor(baseVersionNumber) + 1;
  return {
    versionId: createId("ver"),
    versionNumber,
    versionLabel: `V${versionNumber}`,
  };
}

export function versionLabel(n: number): string {
  return `V${Math.max(1, Math.floor(n))}`;
}
