import React from 'react';
import Layout from '@theme/Layout';
import Translate, {translate} from '@docusaurus/Translate';
import Hero from '@site/src/components/Hero';
import FeatureCard from '@site/src/components/FeatureCard';
import FeatureGrid from '@site/src/components/FeatureGrid';
import FeatureSpotlight from '@site/src/components/FeatureSpotlight';
import ScreenshotCarousel from '@site/src/components/ScreenshotCarousel';
import ProviderLogos from '@site/src/components/ProviderLogos';

export default function Home(): React.JSX.Element {
  React.useEffect(() => {
    document.body.classList.add('ax-marketing');
    return () => {
      document.body.classList.remove('ax-marketing');
    };
  }, []);

  return (
    <Layout
      title={translate({
        id: 'landing.meta.title',
        message: 'Auditix · AI-powered network compliance',
      })}
      description={translate({
        id: 'landing.meta.description',
        message: 'Auditix 5.0 — collect, evaluate and report on your network with an AI assistant by your side.',
      })}>
      <Hero
        subtitle={
          <Translate id="landing.hero.subtitle">
            Collect data from your fleet, evaluate it against your policies, visualise your topology — and ask your network in plain English with the new AI assistant.
          </Translate>
        }
        primaryCta={{
          label: translate({id: 'landing.hero.cta.primary', message: 'Get started'}),
          to: '/getting-started/installation',
        }}
        secondaryCta={{
          label: translate({id: 'landing.hero.cta.secondary', message: 'Explore use cases'}),
          to: '/usecase/intro',
        }}
      />

      <main className="ax-container">
        <section style={{marginTop: '3rem'}}>
          <ScreenshotCarousel
            title="auditix.example.com"
            ariaLabel={translate({
              id: 'landing.carousel.ariaLabel',
              message: 'Auditix 5.0 product tour',
            })}
            slides={[
              {
                sources: {
                  light: '/img/screenshots/landing-dashboard-light.png',
                  dark: '/img/screenshots/landing-dashboard-dark.png',
                },
                alt: translate({
                  id: 'landing.slide.dashboard.alt',
                  message: 'Customisable dashboard with a compliance overview',
                }),
                caption: translate({
                  id: 'landing.slide.dashboard.caption',
                  message: 'Customisable dashboard for a clear view of your compliance',
                }),
              },
              {
                sources: {
                  light: '/img/screenshots/landing-topology-light.png',
                  dark: '/img/screenshots/landing-topology-dark.png',
                },
                alt: translate({
                  id: 'landing.slide.topology.alt',
                  message: 'Live topology map with protocol overlays',
                }),
                caption: translate({
                  id: 'landing.slide.topology.caption',
                  message: 'Need visibility? Your topology is always up to date',
                }),
              },
              {
                sources: {
                  light: '/img/screenshots/landing-compliance-light.png',
                  dark: '/img/screenshots/landing-compliance-dark.png',
                },
                alt: translate({
                  id: 'landing.slide.compliance.alt',
                  message: 'Compliance matrix per policy and per node',
                }),
                caption: translate({
                  id: 'landing.slide.compliance.caption',
                  message: 'Compliance — a score built from YOUR rules',
                }),
              },
              {
                sources: {
                  light: '/img/screenshots/landing-pdf-report-light.png',
                  dark: '/img/screenshots/landing-pdf-report-dark.png',
                },
                alt: translate({
                  id: 'landing.slide.report.alt',
                  message: 'PDF report with AI-drafted recommendations',
                }),
                caption: translate({
                  id: 'landing.slide.report.caption',
                  message: 'A web tool is great — a PDF report with AI recommendations is even better',
                }),
              },
            ]}
          />
        </section>

        <section style={{marginTop: '5rem'}}>
          <span className="ax-eyebrow">
            <Translate id="landing.features.eyebrow">Features</Translate>
          </span>
          <h2 className="ax-section-title">
            <Translate id="landing.features.title">Everything you need to audit a network</Translate>
          </h2>
          <p className="ax-section-lead">
            <Translate id="landing.features.lead">
              A single platform that goes from raw device output to a signed PDF report — with an AI layer that helps you write, search and recommend.
            </Translate>
          </p>
        </section>

        <FeatureSpotlight
          variant="ai"
          imageSide="right"
          eyebrow={<Translate id="landing.spot.ai.eyebrow">New in 5.0</Translate>}
          title={
            <>
              <Translate id="landing.spot.ai.title.start">AI Assistant — your</Translate>{' '}
              <span className="ax-ai-accent">
                <Translate id="landing.spot.ai.title.accent">network co-pilot</Translate>
              </span>
            </>
          }
          description={
            <Translate id="landing.spot.ai.desc">
              Query your network in plain language. Tools are read-only and the data sent to the LLM is human-controlled, preventing any sensitive data leak. The assistant also helps draft documents and author audit rules. Use a cloud LLM (OpenAI, Anthropic, OpenRouter…) or your own on-prem AI stack (Ollama, custom OpenAI-compatible endpoint).
            </Translate>
          }
          imageSources={{
            light: '/img/screenshots/landing-ai-assistant-light.png',
            dark: '/img/screenshots/landing-ai-assistant-dark.png',
          }}
          imageAlt={translate({
            id: 'landing.spot.ai.alt',
            message: 'AI assistant side panel answering a question about the network',
          })}
          imageTitle="AI Assistant"
          cta={{
            label: translate({id: 'landing.spot.ai.cta', message: 'Discover the AI assistant'}),
            to: '/features/ai-assistant',
          }}
        />

        <FeatureSpotlight
          imageSide="left"
          title={<Translate id="landing.spot.topology.title">Live topology</Translate>}
          description={
            <Translate id="landing.spot.topology.desc">
              A Cytoscape map of your infrastructure, built from your collections and device results. LLDP, STP, MSTP, OSPF, BGP or ISIS — whatever protocol stack you run, your topology is always up to date.
            </Translate>
          }
          imageSources={{
            light: '/img/screenshots/landing-topology-placeholder.svg',
            dark: '/img/screenshots/landing-topology-placeholder.svg',
          }}
          imageAlt={translate({
            id: 'landing.spot.topology.alt',
            message: 'Live topology map with protocol overlays',
          })}
          imageTitle="Topology"
          cta={{
            label: translate({id: 'landing.spot.topology.cta', message: 'Discover live topology'}),
            to: '/features/topology',
          }}
        />

        <FeatureSpotlight
          imageSide="right"
          title={<Translate id="landing.spot.collection.title">Automated collection</Translate>}
          description={
            <Translate id="landing.spot.collection.desc">
              Pull the data you need over SSH or vendor APIs, extract the relevant bits and normalise everything for downstream audits. Device unreachable, off-site engagement? No problem — drop command outputs in manually and the same pipeline handles them.
            </Translate>
          }
          imageSources={{
            light: '/img/screenshots/landing-collection-placeholder.svg',
            dark: '/img/screenshots/landing-collection-placeholder.svg',
          }}
          imageAlt={translate({
            id: 'landing.spot.collection.alt',
            message: 'Scheduled collection pipeline running across the fleet',
          })}
          imageTitle="Collections"
          cta={{
            label: translate({id: 'landing.spot.collection.cta', message: 'Discover automated collection'}),
            to: '/features/collection',
          }}
        />

        <FeatureSpotlight
          imageSide="left"
          title={<Translate id="landing.spot.compliance.title">Compliance engine</Translate>}
          description={
            <Translate id="landing.spot.compliance.desc">
              A visual rule editor, on-demand policies and first-class exception handling. GDPR, HIPAA, SOC 2, ISO 27001 — define your own requirements and stay compliant at every audit moment.
            </Translate>
          }
          imageSources={{
            light: '/img/screenshots/landing-compliance-placeholder.svg',
            dark: '/img/screenshots/landing-compliance-placeholder.svg',
          }}
          imageAlt={translate({
            id: 'landing.spot.compliance.alt',
            message: 'Compliance matrix per policy and per node',
          })}
          imageTitle="Compliance"
          cta={{
            label: translate({id: 'landing.spot.compliance.cta', message: 'Discover the compliance engine'}),
            to: '/features/compliance',
          }}
        />

        <FeatureSpotlight
          imageSide="right"
          title={<Translate id="landing.spot.reports.title">PDF & mail reports</Translate>}
          description={
            <Translate id="landing.spot.reports.desc">
              A graphical editor that follows your brand guidelines. Blocks adapt dynamically to fresh results when needed — so the report is always up to date, with every relevant element and AI-drafted recommendations included.
            </Translate>
          }
          imageSources={{
            light: '/img/screenshots/landing-pdf-report-placeholder.svg',
            dark: '/img/screenshots/landing-pdf-report-placeholder.svg',
          }}
          imageAlt={translate({
            id: 'landing.spot.reports.alt',
            message: 'PDF report with AI-drafted recommendations',
          })}
          imageTitle="Report"
          cta={{
            label: translate({id: 'landing.spot.reports.cta', message: 'Discover PDF & mail reports'}),
            to: '/features/reports',
          }}
        />

        <section style={{marginTop: '5rem'}}>
          <span className="ax-eyebrow">
            <Translate id="landing.more.eyebrow">And much more</Translate>
          </span>
          <h2 className="ax-section-title">
            <Translate id="landing.more.title">Built for real-world audit workflows</Translate>
          </h2>

          <FeatureGrid cols={2}>
            <FeatureCard
              title={translate({id: 'landing.more.monitoring.title', message: 'Device monitoring'})}
              description={translate({
                id: 'landing.more.monitoring.desc',
                message: 'An audit means watching the gear. Continuous SNMP / SSH monitoring keeps every device under observation so you catch drift before it becomes an incident.',
              })}
              to="/features/monitoring"
            />
            <FeatureCard
              title={translate({id: 'landing.more.lifecycle.title', message: 'Lifecycle tracking'})}
              description={translate({
                id: 'landing.more.lifecycle.desc',
                message: 'Dynamically pull EoS / EoSM / EoL data from your vendors. Know when hardware retires and plan replacements with a clean budget timeline.',
              })}
              to="/features/lifecycle"
            />
            <FeatureCard
              title={translate({id: 'landing.more.scalable.title', message: 'Docker-native & scalable'})}
              description={translate({
                id: 'landing.more.scalable.desc',
                message: 'Container-first architecture that scales horizontally — when the workload spikes, new worker services spin up to meet demand.',
              })}
              to="/features/scalable"
            />
            <FeatureCard
              title={translate({id: 'landing.more.multitenant.title', message: 'Multi-tenant'})}
              description={translate({
                id: 'landing.more.multitenant.desc',
                message: 'Running audits for several clients? Strict tenant isolation via contexts — one instance, many customers, no data crossover.',
              })}
              to="/features/multi-tenant"
            />
            <FeatureCard
              title={translate({id: 'landing.more.labs.title', message: 'Labs for teaching'})}
              description={translate({
                id: 'landing.more.labs.desc',
                message: 'Teaching the solution? Auditix can verify a student has the right configuration on each lab before moving on — saves you time and gives participants full autonomy.',
              })}
              to="/features/labs"
            />
            <FeatureCard
              title={translate({id: 'landing.more.backup.title', message: 'Backup & import'})}
              description={translate({
                id: 'landing.more.backup.desc',
                message: 'Back up part or all of your instance as modular JSON files — and re-import them just as easily into another environment.',
              })}
              to="/features/backup"
            />
            <FeatureCard
              title={translate({id: 'landing.more.auth.title', message: 'Auth & SSO'})}
              description={translate({
                id: 'landing.more.auth.desc',
                message: 'Multi-provider OIDC, TOTP 2FA and internal password policy. Plug Auditix into your existing IdP in minutes.',
              })}
              to="/features/auth-sso"
              footer={<ProviderLogos />}
            />
            <FeatureCard
              title={translate({id: 'landing.more.api.title', message: 'Open REST API'})}
              description={translate({
                id: 'landing.more.api.desc',
                message: 'A fully open API v1 to drive Auditix from your automation pipelines, ITSM or CI workflows.',
              })}
              to="/features/api"
            />
          </FeatureGrid>
        </section>

        <section style={{marginTop: '5rem', marginBottom: '5rem'}}>
          <span className="ax-eyebrow">
            <Translate id="landing.start.eyebrow">Where to start</Translate>
          </span>
          <h2 className="ax-section-title">
            <Translate id="landing.start.title">Pick the path that fits</Translate>
          </h2>

          <FeatureGrid cols={2}>
            <FeatureCard
              icon="🚀"
              title={translate({id: 'landing.start.install.title', message: 'Install Auditix'})}
              description={translate({
                id: 'landing.start.install.desc',
                message: 'One-line install or manual setup. Up and running in under 10 minutes.',
              })}
              to="/getting-started/installation"
            />
            <FeatureCard
              icon="📘"
              title={translate({id: 'landing.start.guide.title', message: 'User guide'})}
              description={translate({
                id: 'landing.start.guide.desc',
                message: 'Reference documentation for every feature, from node onboarding to PDF themes.',
              })}
              to="/guide/dashboard"
            />
            <FeatureCard
              icon="🧪"
              title={translate({id: 'landing.start.usecase.title', message: 'Use cases'})}
              description={translate({
                id: 'landing.start.usecase.desc',
                message: 'Step-by-step recipes: 1st compliance audit, monthly report, AI recommendations, SSO with Azure AD…',
              })}
              to="/usecase/intro"
            />
            <FeatureCard
              icon="🔌"
              title={translate({id: 'landing.start.api.title', message: 'API reference'})}
              description={translate({
                id: 'landing.start.api.desc',
                message: 'REST API v1, token authentication, OpenAPI / Swagger UI bundled with each instance.',
              })}
              to="/api/overview"
            />
          </FeatureGrid>
        </section>
      </main>
    </Layout>
  );
}
