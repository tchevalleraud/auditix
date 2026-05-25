import React from 'react';
import useBaseUrl from '@docusaurus/useBaseUrl';

interface ScreenshotProps {
  src: string;
  alt: string;
  title?: string;
  caption?: string;
}

export default function Screenshot({src, alt, title, caption}: ScreenshotProps): React.JSX.Element {
  const isExternal = /^https?:\/\//.test(src);
  const resolvedSrc = useBaseUrl(isExternal ? '' : src);
  const finalSrc = isExternal ? src : resolvedSrc;

  return (
    <figure className="ax-screenshot">
      <div className="ax-screenshot__bar">
        <span className="ax-screenshot__dot" />
        <span className="ax-screenshot__dot" />
        <span className="ax-screenshot__dot" />
        {title && <span className="ax-screenshot__title">{title}</span>}
      </div>
      <img src={finalSrc} alt={alt} loading="lazy" />
      {caption && <figcaption className="ax-screenshot__caption">{caption}</figcaption>}
    </figure>
  );
}
