import { useState } from "react";
import { useAppStore } from "../../store/app-store";

type Props = {
  scale: number;
  slideWidth: number;
};

export function CommentDraft({ scale }: Props) {
  const draft = useAppStore((s) => s.draftComment);
  const submitComment = useAppStore((s) => s.submitComment);
  const cancelCommentDraft = useAppStore((s) => s.cancelCommentDraft);
  const [text, setText] = useState("");

  if (!draft) return null;

  return (
    <div
      className="comment-popover"
      style={{
        left: draft.x * scale + 16,
        top: draft.y * scale + 16,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <label className="sr-only" htmlFor="comment-text">
        Agent annotation
      </label>
      <textarea
        id="comment-text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Tell the agent what to change here…"
        autoFocus
      />
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button type="button" className="btn-secondary" onClick={cancelCommentDraft}>
          Cancel
        </button>
        <button
          type="button"
          className="btn-primary"
          disabled={!text.trim()}
          onClick={() => {
            submitComment(text);
            setText("");
          }}
        >
          Pin for agent
        </button>
      </div>
    </div>
  );
}
