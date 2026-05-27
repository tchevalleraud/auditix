import React from 'react';

/**
 * Inline brand glyphs for OIDC / SSO providers Auditix is commonly used with.
 * Paths come from Simple Icons (MIT). Rendered monochrome (currentColor) so
 * they blend with the card theme.
 */
const PROVIDERS: {name: string; path: string}[] = [
  {
    name: 'Microsoft Entra ID',
    path: 'M11.4 24H0V12.6h11.4V24zM24 24H12.6V12.6H24V24zM11.4 11.4H0V0h11.4v11.4zM24 11.4H12.6V0H24v11.4z',
  },
  {
    name: 'Google',
    path: 'M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z',
  },
  {
    name: 'Okta',
    path: 'M12 0C5.389 0 0 5.35 0 12s5.35 12 12 12 12-5.35 12-12S18.611 0 12 0Zm0 18a6 6 0 1 1 0-12 6 6 0 0 1 0 12Z',
  },
  {
    name: 'Auth0',
    path: 'M21.98 7.448L19.62 0H4.347L2.02 7.448c-1.352 4.312.03 9.206 3.815 12.015L12.007 24l6.157-4.552c3.755-2.81 5.182-7.688 3.815-12.015l-6.16 4.58 2.343 7.45-6.157-4.597-6.158 4.58 2.358-7.433-6.188-4.55 7.62-.024L12.007 0l2.356 7.448h7.617z',
  },
  {
    name: 'Keycloak',
    path: 'M22.165 9.156c-.171-.293-.439-.514-.781-.611L19.07 7.948c-.586-.171-1.196.146-1.392.732l-.586 1.685a3.668 3.668 0 0 0-2.245-.78c-2.027 0-3.69 1.66-3.69 3.69 0 2.027 1.66 3.69 3.69 3.69a3.668 3.668 0 0 0 2.245-.781l.586 1.684c.097.293.317.512.586.61.122.05.244.075.366.075a.85.85 0 0 0 .415-.122l2.342-1.343c.293-.146.514-.439.61-.781.097-.318.073-.659-.146-.952l-1.685-2.317a3.685 3.685 0 0 0 0-1.611l1.685-2.318c.146-.317.244-.659.122-.953zM7.323 7.948H4.91c-.61 0-1.097.488-1.097 1.098v5.91c0 .61.488 1.098 1.098 1.098h2.412c.61 0 1.098-.488 1.098-1.098v-5.91c0-.61-.488-1.098-1.098-1.098zm9.524 7.397a2.227 2.227 0 0 1-2.221-2.221 2.227 2.227 0 0 1 2.22-2.222 2.227 2.227 0 0 1 2.221 2.222 2.227 2.227 0 0 1-2.22 2.22z',
  },
];

export default function ProviderLogos(): React.JSX.Element {
  return (
    <div className="ax-provider-logos" aria-label="Supported identity providers">
      {PROVIDERS.map((p) => (
        <span key={p.name} className="ax-provider-logos__item" title={p.name} aria-label={p.name}>
          <svg viewBox="0 0 24 24" fill="currentColor" role="img" aria-hidden="true">
            <path d={p.path} />
          </svg>
        </span>
      ))}
    </div>
  );
}
