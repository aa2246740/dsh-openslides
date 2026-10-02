import { useMemo, type MouseEvent } from "react";
import type { Slide } from "@open-slidestudio/pptd";
import { fillToCss } from "../../lib/fill-style";
import { SlideElementView } from "./SlideElementView";
import type { CommentPin } from "../../store/app-store";

type Props = {
  slide: Slide;
  scale: number;
  selectedElementId: string | null;
  onSelectElement: (id: string | null) => void;
  interactive?: boolean;
  comments?: CommentPin[];
  commentMode?: boolean;
  draftComment?: { slideId: string; x: number; y: number } | null;
  onPlaceComment?: (x: number, y: number) => void;
  onCommentClick?: (id: string) => void;
  /** Compact mode for thumbnails — no interaction */
  thumbnail?: boolean;
};

export function SlideCanvas({
  slide,
  scale,
  selectedElementId,
  onSelectElement,
  interactive = true,
  comments = [],
  commentMode = false,
  draftComment = null,
  onPlaceComment,
  onCommentClick,
  thumbnail = false,
}: Props) {
  const w = slide.size.width;
  const h = slide.size.height;
  const elements = useMemo(
    () => [...slide.elements].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0)),
    [slide.elements],
  );

  const slideComments = comments.filter((c) => c.slideId === slide.id);

  const handleBgClick = (e: MouseEvent<HTMLDivElement>) => {
    if (!interactive || thumbnail) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / scale;
    const y = (e.clientY - rect.top) / scale;
    if (commentMode && onPlaceComment) {
      onPlaceComment(x, y);
      return;
    }
    onSelectElement(null);
  };

  return (
    <div
      className="slide-frame"
      style={{
        width: w * scale,
        height: h * scale,
        cursor: commentMode ? "crosshair" : undefined,
      }}
      aria-label={thumbnail ? undefined : `Slide ${slide.order + 1}`}
    >
      <div
        className="slide-frame__inner"
        style={{
          width: w,
          height: h,
          transform: `scale(${scale})`,
        }}
        onClick={handleBgClick}
      >
        <div className="slide-bg" style={{ background: fillToCss(slide.background) }} />
        {elements.map((el) => (
          <SlideElementView
            key={el.id}
            element={el}
            selected={!thumbnail && selectedElementId === el.id}
            selectedId={selectedElementId}
            onSelect={onSelectElement}
            interactive={interactive && !thumbnail && !commentMode}
          />
        ))}
        {!thumbnail &&
          slideComments.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`comment-pin${c.resolved ? " comment-pin--resolved" : ""}`}
              style={{ left: c.x, top: c.y }}
              aria-label={`Agent pin ${c.number}${c.resolved ? " (done)" : c.failReason ? " (failed)" : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                onCommentClick?.(c.id);
              }}
              title={c.failReason ? `${c.text}\n⚠ ${c.failReason}` : c.text}
            >
              {c.number}
            </button>
          ))}
        {!thumbnail && draftComment && draftComment.slideId === slide.id ? (
          <div
            className="comment-pin"
            style={{ left: draftComment.x, top: draftComment.y, pointerEvents: "none" }}
            aria-hidden
          >
            +
          </div>
        ) : null}
      </div>
    </div>
  );
}
