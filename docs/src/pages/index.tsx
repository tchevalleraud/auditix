import React from 'react';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import Translate, {translate} from '@docusaurus/Translate';
import Hero from '@site/src/components/Hero';
import FeatureCard from '@site/src/components/FeatureCard';
import FeatureGrid from '@site/src/components/FeatureGrid';
import Screenshot from '@site/src/components/Screenshot';
import ScreenshotCarousel from '@site/src/components/ScreenshotCarousel';

export default function Home(): React.JSX.Element {
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
        pill={translate({
          id: 'landing.hero.pill',
          message: '✨ Auditix 5.0 · AI Edition',
        })}
        title={
          <>
            <Translate id="landing.hero.title.start">Network compliance,</Translate>{' '}
            <span className="ax-ai-accent">
              <Translate id="landing.hero.title.accent">augmented by AI</Translate>
            </span>
          </>
        }
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
                src: '/img/screenshots/landing-dashboard.png',
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
                src: '/img/screenshots/landing-ai-assistant.png',
                alt: translate({
                  id: 'landing.slide.ai.alt',
                  message: 'AI assistant side panel answering a question',
                }),
                caption: translate({
                  id: 'landing.slide.ai.caption',
                  message: 'Need a hand? The AI assistant has your back',
                }),
              },
              {
                src: '/img/screenshots/landing-topology.png',
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
                src: '/img/screenshots/landing-compliance.png',
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
                src: '/img/screenshots/landing-pdf-report.png',
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

        <section style={{marginTop: '4rem'}}>
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

          <FeatureGrid>
            <FeatureCard
              icon="🧠"
              title={translate({id: 'landing.feature.aiAssistants.title', message: 'AI Assistants'})}
              description={translate({
                id: 'landing.feature.aiAssistants.desc',
                message: 'Ask your network in natural language. Tools are read-only and outputs are anonymised before reaching cloud LLMs.',
              })}
              to="/guide/ai/overview"
              ai
            />
            <FeatureCard
              icon="✍️"
              title={translate({id: 'landing.feature.aiAssist.title', message: 'AI Assist in reports'})}
              description={translate({
                id: 'landing.feature.aiAssist.desc',
                message: 'One-click paragraph drafting in PDF and mail reports — keeps your prose consistent and your audits faster.',
              })}
              to="/guide/ai/ai-assist-blocks"
              ai
            />
            <FeatureCard
              icon="🛰"
              title={translate({id: 'landing.feature.collection.title', message: 'Automated collection'})}
              description={translate({
                id: 'landing.feature.collection.desc',
                message: 'Scheduled SSH and SNMP collections with reusable rules, multi-source joins and ZIP / CSV bulk imports.',
              })}
              to="/guide/collections/commands"
            />
            <FeatureCard
              icon="🛡"
              title={translate({id: 'landing.feature.compliance.title', message: 'Compliance engine'})}
              description={translate({
                id: 'landing.feature.compliance.desc',
                message: 'Visual rule editor, per-policy auto-assignment, debug introspection on nested rule blocks.',
              })}
              to="/guide/compliance/rules"
            />
            <FeatureCard
              icon="🗺"
              title={translate({id: 'landing.feature.topology.title', message: 'Live topology'})}
              description={translate({
                id: 'landing.feature.topology.desc',
                message: 'Cytoscape map with LLDP / OSPF / ISIS / BGP / STP filters, manual links, MSTI multi-instance overlays.',
              })}
              to="/guide/topology/overview"
            />
            <FeatureCard
              icon="📄"
              title={translate({id: 'landing.feature.reports.title', message: 'PDF & mail reports'})}
              description={translate({
                id: 'landing.feature.reports.desc',
                message: 'Block-based editor with chart, lifecycle, compliance, topology and custom schemas. Theme per context.',
              })}
              to="/guide/reports/creating"
            />
            <FeatureCard
              icon="📦"
              title={translate({id: 'landing.feature.lifecycle.title', message: 'Lifecycle tracking'})}
              description={translate({
                id: 'landing.feature.lifecycle.desc',
                message: 'EoS / EoSM / EoL timelines with a configurable freshness score, refreshed by vendor plugins.',
              })}
              to="/guide/inventory/lifecycle"
            />
            <FeatureCard
              icon="🔐"
              title={translate({id: 'landing.feature.auth.title', message: 'Auth & SSO'})}
              description={translate({
                id: 'landing.feature.auth.desc',
                message: 'Multi-provider OIDC, TOTP 2FA, internal password policy and a public REST API v1 with per-token context scoping.',
              })}
              to="/admin/authentication/oidc"
            />
            <FeatureCard
              icon="📡"
              title={translate({id: 'landing.feature.audit.title', message: 'Audit & syslog'})}
              description={translate({
                id: 'landing.feature.audit.desc',
                message: 'Every security event recorded, browsable, exportable — and pushable to one or several SIEM collectors.',
              })}
              to="/admin/audit/audit-log"
            />
          </FeatureGrid>
        </section>

        <section className="ax-ai-section">
          <div style={{display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: '2.5rem', alignItems: 'center'}}>
            <div>
              <span className="ax-eyebrow">
                <Translate id="landing.ai.eyebrow">New in 5.0</Translate>
              </span>
              <h2 className="ax-section-title">
                <Translate id="landing.ai.title.start">Meet your</Translate>{' '}
                <span className="ax-ai-accent">
                  <Translate id="landing.ai.title.accent">network co-pilot</Translate>
                </span>
              </h2>
              <p className="ax-section-lead">
                <Translate id="landing.ai.lead">
                  Configure one or several LLM providers (OpenRouter, OpenAI, Anthropic, or your local Ollama). Define context-scoped assistants with their own system prompt. Toggle tool-use to let them safely query your own data — hostnames are stripped before any cloud call.
                </Translate>
              </p>
              <div style={{display: 'flex', gap: '0.75rem', flexWrap: 'wrap'}}>
                <Link to="/guide/ai/overview" className="ax-btn ax-btn--primary">
                  <Translate id="landing.ai.cta.primary">Read the AI guide</Translate>
                </Link>
                <Link to="/usecase/ai-assisted-recommendations" className="ax-btn ax-btn--secondary">
                  <Translate id="landing.ai.cta.secondary">See a use case</Translate>
                </Link>
              </div>
            </div>
            <div>
              <Screenshot
                src="/img/screenshots/landing-ai-tool-trace.png"
                alt={translate({
                  id: 'landing.ai.screenshot.alt',
                  message: 'AI assistant panel showing tool calls and anonymised results',
                })}
                title="AI Assistant"
              />
            </div>
          </div>
        </section>

        <section style={{marginTop: '4rem', marginBottom: '5rem'}}>
          <span className="ax-eyebrow">
            <Translate id="landing.start.eyebrow">Where to start</Translate>
          </span>
          <h2 className="ax-section-title">
            <Translate id="landing.start.title">Pick the path that fits</Translate>
          </h2>

          <FeatureGrid>
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
