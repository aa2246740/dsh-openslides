/** Trigger a browser download for a Blob or ArrayBuffer. */
export function downloadBlob(
  data: Blob | ArrayBuffer | Uint8Array | string,
  filename: string,
  mimeType?: string,
): void {
  let blob: Blob;
  if (data instanceof Blob) {
    blob = data;
  } else if (typeof data === "string") {
    blob = new Blob([data], { type: mimeType ?? "application/octet-stream" });
  } else if (data instanceof ArrayBuffer) {
    blob = new Blob([data], { type: mimeType ?? "application/octet-stream" });
  } else {
    // Copy into a fresh ArrayBuffer-backed view for DOM BlobPart typing (TS 5.7+)
    const copy = new Uint8Array(data.byteLength);
    copy.set(data);
    blob = new Blob([copy], { type: mimeType ?? "application/octet-stream" });
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Delay revoke so Safari finishes the download handshake
  window.setTimeout(() => URL.revokeObjectURL(url), 2_000);
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
