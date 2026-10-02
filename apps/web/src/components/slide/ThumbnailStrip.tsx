import type { Deck } from "@open-slidestudio/pptd";
import { sortSlidesByOrder } from "@open-slidestudio/pptd";
import { SlideCanvas } from "./SlideCanvas";

type Props = {
  deck: Deck;
  currentSlideId: string | null;
  onSelect: (id: string) => void;
};

export function ThumbnailStrip({ deck, currentSlideId, onSelect }: Props) {
  const slides = sortSlidesByOrder(deck);
  return (
    <nav className="thumb-strip" aria-label="Slide thumbnails">
      {slides.map((slide, index) => {
        const scale = 92 / slide.size.width;
        return (
          <button
            key={slide.id}
            type="button"
            className="thumb-item"
            aria-current={slide.id === currentSlideId ? "true" : undefined}
            aria-label={`Slide ${index + 1}`}
            onClick={() => onSelect(slide.id)}
          >
            <div className="thumb-item__frame">
              <SlideCanvas
                slide={slide}
                scale={scale}
                selectedElementId={null}
                onSelectElement={() => undefined}
                interactive={false}
                thumbnail
              />
            </div>
            <span className="thumb-item__label">{index + 1}</span>
          </button>
        );
      })}
    </nav>
  );
}
