export function renderActivationIcon(): string {
  return `
    <span class="nav-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" role="img">
        <path d="M12 5v4" />
        <path d="M7 10.5 4 13.5" />
        <path d="m17 10.5 3 3" />
        <circle cx="12" cy="5" r="2" />
        <circle cx="4" cy="14" r="2" />
        <circle cx="20" cy="14" r="2" />
        <path d="M8 18h8" />
        <path d="M10 21h4" />
      </svg>
    </span>
  `
}
