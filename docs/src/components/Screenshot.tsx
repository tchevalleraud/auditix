import React from 'react';
import {useBaseUrlUtils} from '@docusaurus/useBaseUrl';
import ThemedImage from '@theme/ThemedImage';

interface ScreenshotProps {
  src?: string;
  sources?: {light: string; dark: string};
  alt: string;
  title?: string;
  caption?: string;
}

export default function Screenshot({src, sources, alt, title, caption}: ScreenshotProps): React.JSX.Element {
  const {withBaseUrl} = useBaseUrlUtils();
  const resolve = (s: string): string => /^https?:\/\//.test(s) ? s : withBaseUrl(s);

  return (
    <figure className="ax-screenshot">
      <div className="ax-screenshot__bar">
        <span className="ax-screenshot__dot" />
        <span className="ax-screenshot__dot" />
        <span className="ax-screenshot__dot" />
        {title && <span className="ax-screenshot__title">{title}</span>}
      </div>
      {sources ? (
        <ThemedImage
          alt={alt}
          sources={{light: resolve(sources.light), dark: resolve(sources.dark)}}
        />
      ) : src ? (
        <img src={resolve(src)} alt={alt} loading="lazy" />
      ) : null}
      {caption && <figcaption className="ax-screenshot__caption">{caption}</figcaption>}
    </figure>
  );
}
