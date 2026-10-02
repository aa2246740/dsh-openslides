/**
 * Prevent QA recorders from silently spending quota or sending briefs and
 * attachments through a configured supplier account. The caller must set this
 * only after the user has approved the specific run and disclosed its payload.
 */
export function requireExternalModelConsent({ script, brief, attachments = [] }) {
  if (process.env.QA_ALLOW_EXTERNAL_MODEL !== "1") {
    const attachmentNote = attachments.length
      ? ` and ${attachments.length} attachment(s)`
      : "";
    throw new Error(
      `${script} may send its test brief${attachmentNote} to the selected LLM supplier. ` +
        "Refusing to run without explicit consent (QA_ALLOW_EXTERNAL_MODEL=1).",
    );
  }
  return {
    granted: true,
    briefChars: String(brief || "").length,
    attachments: attachments.map((file) => String(file)),
  };
}

export function externalModelConsentGranted() {
  return process.env.QA_ALLOW_EXTERNAL_MODEL === "1";
}
