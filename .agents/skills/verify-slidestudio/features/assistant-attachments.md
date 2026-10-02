# Composer attachments

Text files can be attached to the next message. Driver id `assistant-attachments`
(`drivers/assistant.mjs`), opened with `&workspace=1`, no session needed.

## What a user does

- `#composer-plus` opens the hidden file input `#agent-attachment-file`. It accepts `.txt .md .csv .tsv
  .json`, at most 6 pending files (more: toast 每次最多发送 6 个附件。).
- The file is uploaded to `POST /api/attachments` (`{name, data}` data URL) and parsed on the server. A
  chip `.agent-attachment-chip[data-attachment-id]` shows `name · size`.
- Pending chips are kept per project in `localStorage` (`oss.editor.agent-attachments:<project>`), so they
  survive a reload.
- The chip's × deletes the file on the server (`DELETE /api/attachments/<id>`) and removes the chip.
- A file the server cannot read as text is answered `415 UNSUPPORTED_AGENT_ATTACHMENT` and never stored;
  the toast says 附件上传失败：… with the reason. Over 20 MB is `413`.
- After the message is sent the chip reads 已发送，待清理 until cleanup.

## What the driver proves

- `verify-brief.txt` uploads, a chip named after it appears, and `GET /api/attachments/<id>` returns the
  stored record (parsed, containing the file's text).
- The chip survives a reload; × removes it; the server answers 404 afterwards.
- A fake `pic.png` is refused: no chip, visible toast.
- Cleanup: files added under `output/attachments/` during the run are removed, even if a check fails.

## Gotchas

- Attachment parsing is server-side text extraction only; no model reads it here. Whether a real turn
  uses the attachment text is not covered.
- The upload writes to the real `output/attachments/` folder of the repo, not the scratch deck, which is
  why the driver removes what it added.
- The 415 console line from the refused upload is expected; the driver ignores 4xx for this feature.
