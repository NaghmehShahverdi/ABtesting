import heroUrl from '../assets/hero.png'
import '../landing.css'

export function renderIntro(): string {
  return `
    <div class="landing">
      <section class="landing-hero">
        <div class="landing-ambient landing-ambient-one" aria-hidden="true"></div>
        <div class="landing-ambient landing-ambient-two" aria-hidden="true"></div>

        <div class="landing-hero-copy">
          <div class="landing-kicker">
            <span class="landing-kicker-dot"></span>
            Decision intelligence for product and GTM teams
          </div>

          <p class="landing-brand">SignalFoundry</p>
          <h1>Turn product signals into decisions you can defend.</h1>
          <p class="landing-lead">
            One workspace to define activation, prioritize accounts, test causal hypotheses,
            and ask an AI copilot what the evidence actually means.
          </p>

          <div class="landing-actions">
            <button class="landing-primary-action" id="open-activation" type="button">
              Explore the models
              <span aria-hidden="true">→</span>
            </button>
            <a class="landing-secondary-action" href="#landing-capabilities">
              See how it works
            </a>
          </div>

          <div class="landing-proof" aria-label="Platform highlights">
            <div>
              <strong>100K+</strong>
              <span>product events</span>
            </div>
            <div>
              <strong>4</strong>
              <span>models compared</span>
            </div>
            <div>
              <strong>90 days</strong>
              <span>outcome horizon</span>
            </div>
          </div>
        </div>

        <div class="landing-visual" aria-label="SignalFoundry analytics preview">
          <div class="landing-orbit landing-orbit-one" aria-hidden="true"></div>
          <div class="landing-orbit landing-orbit-two" aria-hidden="true"></div>
          <img class="landing-layer-art" src="${heroUrl}" alt="" />

          <article class="landing-preview-card">
            <header>
              <div>
                <span class="landing-preview-label">Decision workspace</span>
                <strong>Signal overview</strong>
              </div>
              <span class="landing-live"><i></i> Live</span>
            </header>

            <div class="landing-score-row">
              <div>
                <span>Top-decile revenue</span>
                <strong>64%</strong>
                <small>captured by the deployed model</small>
              </div>
              <div class="landing-ring" aria-label="64 percent">
                <span>64</span>
              </div>
            </div>

            <div class="landing-mini-chart" aria-hidden="true">
              <span style="height: 21%"></span>
              <span style="height: 29%"></span>
              <span style="height: 24%"></span>
              <span style="height: 42%"></span>
              <span style="height: 51%"></span>
              <span style="height: 47%"></span>
              <span style="height: 70%"></span>
              <span style="height: 92%"></span>
            </div>

            <div class="landing-preview-footer">
              <span><i class="is-blue"></i> Predictive signal</span>
              <span><i class="is-green"></i> Causal evidence</span>
            </div>
          </article>

          <div class="landing-float-card landing-float-card-top">
            <span>Experiment hypothesis</span>
            <strong>Workspace onboarding</strong>
            <small>Ready for controlled validation</small>
          </div>

          <div class="landing-float-card landing-float-card-bottom">
            <span class="landing-spark">✦</span>
            <div>
              <strong>AI Copilot</strong>
              <small>Grounded in live model results</small>
            </div>
          </div>
        </div>
      </section>

      <section class="landing-trust">
        <span>Built for decisions, not dashboard theater</span>
        <div>
          <p>Snowflake-connected</p>
          <p>Leakage-aware</p>
          <p>Uncertainty-first</p>
          <p>Experiment-ready</p>
        </div>
      </section>

      <section class="landing-capabilities" id="landing-capabilities">
        <div class="landing-section-heading">
          <p>From signal to action</p>
          <h2>Three questions. One decision system.</h2>
          <span>
            Move from understanding behavior to predicting outcomes and testing what
            actually changes them.
          </span>
        </div>

        <div class="landing-capability-grid">
          <article class="landing-capability-card is-activation">
            <div class="landing-capability-number">01</div>
            <div class="landing-capability-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="M4 17V9m5 8V5m5 12v-7m5 7V3" />
              </svg>
            </div>
            <p class="landing-capability-tag">Measure</p>
            <h3>What defines activation?</h3>
            <p>
              Build behavior-based activation definitions, tune observation windows,
              and compare the events that signal durable product value.
            </p>
            <ul>
              <li>Flexible event definitions</li>
              <li>Time-window analysis</li>
              <li>Segment comparison</li>
            </ul>
          </article>

          <article class="landing-capability-card is-scoring">
            <div class="landing-capability-number">02</div>
            <div class="landing-capability-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="M4 19 10 13l4 3 6-9" />
                <path d="M16 7h4v4" />
              </svg>
            </div>
            <p class="landing-capability-tag">Predict</p>
            <h3>Who is most likely to convert?</h3>
            <p>
              Rank accounts using product, sales, marketing, and firmographic signals,
              then translate scores into an actionable weekly workflow.
            </p>
            <ul>
              <li>Held-out model evaluation</li>
              <li>Revenue-aware ranking</li>
              <li>Grounded AI copilot</li>
            </ul>
          </article>

          <article class="landing-capability-card is-causal">
            <div class="landing-capability-number">03</div>
            <div class="landing-capability-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="6" r="3" />
                <circle cx="18" cy="18" r="3" />
                <path d="m9 11 6-4m-6 6 6 4" />
              </svg>
            </div>
            <p class="landing-capability-tag">Prove</p>
            <h3>What might change the outcome?</h3>
            <p>
              Separate association from intervention opportunity with cross-fitted AIPW,
              overlap diagnostics, confidence intervals, and experiment design.
            </p>
            <ul>
              <li>Common-support estimates</li>
              <li>Uncertainty-aware readouts</li>
              <li>Experiment hypotheses</li>
            </ul>
          </article>
        </div>
      </section>

      <section class="landing-philosophy">
        <div>
          <p class="landing-philosophy-kicker">The SignalFoundry standard</p>
          <h2>Every number should earn the decision attached to it.</h2>
        </div>
        <div class="landing-philosophy-points">
          <article>
            <span>01</span>
            <div>
              <strong>Evidence before confidence</strong>
              <p>Show holdouts, overlap, calibration, and intervals—not only point estimates.</p>
            </div>
          </article>
          <article>
            <span>02</span>
            <div>
              <strong>Action with boundaries</strong>
              <p>State what the model supports, what remains uncertain, and what to test next.</p>
            </div>
          </article>
          <article>
            <span>03</span>
            <div>
              <strong>One connected narrative</strong>
              <p>Link product behavior, account priority, causal evidence, and business outcomes.</p>
            </div>
          </article>
        </div>
      </section>

      <section class="landing-final-cta">
        <div>
          <span>Start with the signal</span>
          <h2>Build an activation definition your team can use.</h2>
        </div>
        <a class="landing-primary-action" href="#open-activation">
          Return to the model launcher
          <span aria-hidden="true">↑</span>
        </a>
      </section>
    </div>
  `
}
