import React, {useCallback, useEffect, useRef, useState} from 'react';
import {useBaseUrlUtils} from '@docusaurus/useBaseUrl';

export interface CarouselSlide {
  src: string;
  alt: string;
  caption?: string;
  title?: string;
}

interface ScreenshotCarouselProps {
  slides: CarouselSlide[];
  title?: string;
  autoplay?: boolean;
  interval?: number;
  ariaLabel?: string;
}

export default function ScreenshotCarousel({
  slides,
  title,
  autoplay = true,
  interval = 5000,
  ariaLabel = 'Screenshot carousel',
}: ScreenshotCarouselProps): React.JSX.Element {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const {withBaseUrl} = useBaseUrlUtils();
  const total = slides.length;
  const rootRef = useRef<HTMLDivElement>(null);

  const goTo = useCallback((i: number) => {
    setIndex(((i % total) + total) % total);
  }, [total]);

  const next = useCallback(() => goTo(index + 1), [index, goTo]);
  const prev = useCallback(() => goTo(index - 1), [index, goTo]);

  useEffect(() => {
    if (!autoplay || paused || total < 2) return;
    const id = window.setInterval(next, interval);
    return () => window.clearInterval(id);
  }, [autoplay, paused, interval, next, total]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
    if (e.key === 'ArrowLeft')  { e.preventDefault(); prev(); }
  };

  const resolve = (src: string): string =>
    /^https?:\/\//.test(src) ? src : withBaseUrl(src);

  const current = slides[index];
  const barTitle = current.title ?? title;

  return (
    <figure
      ref={rootRef}
      className="ax-screenshot ax-carousel"
      role="region"
      aria-roledescription="carousel"
      aria-label={ariaLabel}
      tabIndex={0}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onKeyDown={onKeyDown}
    >
      <div className="ax-screenshot__bar">
        <span className="ax-screenshot__dot" />
        <span className="ax-screenshot__dot" />
        <span className="ax-screenshot__dot" />
        {barTitle && <span className="ax-screenshot__title">{barTitle}</span>}
      </div>

      <div className="ax-carousel__viewport">
        <div
          className="ax-carousel__track"
          style={{transform: `translateX(-${index * 100}%)`}}
          aria-live="polite"
        >
          {slides.map((s, i) => (
            <div
              className="ax-carousel__slide"
              key={i}
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1} of ${total}`}
              aria-hidden={i !== index}
            >
              <img
                src={resolve(s.src)}
                alt={s.alt}
                loading={i === 0 ? 'eager' : 'lazy'}
              />
            </div>
          ))}
        </div>

        {total > 1 && (
          <>
            <button
              type="button"
              className="ax-carousel__arrow ax-carousel__arrow--prev"
              onClick={prev}
              aria-label="Previous slide"
            >
              ‹
            </button>
            <button
              type="button"
              className="ax-carousel__arrow ax-carousel__arrow--next"
              onClick={next}
              aria-label="Next slide"
            >
              ›
            </button>
          </>
        )}
      </div>

      {total > 1 && (
        <div className="ax-carousel__dots" role="tablist" aria-label="Slide navigation">
          {slides.map((_, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={`Go to slide ${i + 1}`}
              className={`ax-carousel__dot${i === index ? ' is-active' : ''}`}
              onClick={() => goTo(i)}
            />
          ))}
        </div>
      )}

      {current.caption && (
        <figcaption className="ax-screenshot__caption">{current.caption}</figcaption>
      )}
    </figure>
  );
}
