export function renderIntro(): string {
  return `
    <section class="intro-panel">
      <p class="eyebrow">Agentic AI analytics product</p>
      <h1>Design, monitor, and explain product experiments.</h1>
      <p class="summary">
        This tool helps product teams compare activation definitions across experiment groups.
        The first model uses Snowflake-style event telemetry to measure whether users complete
        selected actions within a chosen number of days after first login.
      </p>

      <div class="intro-grid">
        <article>
          <span>1</span>
          <h2>Choose actions</h2>
          <p>Select 2 to 4 product events that define activation.</p>
        </article>
        <article>
          <span>2</span>
          <h2>Set window</h2>
          <p>Pick the number of days after first login.</p>
        </article>
        <article>
          <span>3</span>
          <h2>Compare results</h2>
          <p>Review completion rate for each selected event.</p>
        </article>
      </div>

      <button class="primary-action" id="open-activation" type="button">Open activation model</button>
    </section>
  `
}
