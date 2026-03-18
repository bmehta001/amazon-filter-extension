/**
 * In-page feature tour — shown on first Amazon search visit after install.
 *
 * A lightweight step-by-step callout that highlights the main extension
 * widgets and then marks the tour as complete.
 */

import { shouldShowTour, markTourSeen } from "../../onboarding/state";

// ── Tour Steps ───────────────────────────────────────────────────────

interface TourStep {
  /** CSS selector for the element to point at (null = centered overlay). */
  target: string | null;
  message: string;
}

const STEPS: TourStep[] = [
  {
    target: ".bas-widget-main",
    message: "👋 Your filters are here! Set minimum reviews, hide sponsored, and more.",
  },
  {
    target: ".bas-widget-review",
    message: "⭐ Filter by rating and review authenticity to avoid fake reviews.",
  },
  {
    target: ".bas-widget-sort",
    message: "📊 Sort results by value score, trending, or best deals.",
  },
  {
    target: null,
    message: "✅ You're all set! Click the extension icon anytime to adjust settings.",
  },
];

// ── CSS ──────────────────────────────────────────────────────────────

export const TOUR_STYLES = `
  .bas-tour-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.35);
    z-index: 99998;
    transition: opacity 0.2s;
  }

  .bas-tour-callout {
    position: fixed;
    z-index: 99999;
    background: #fff;
    border-radius: 10px;
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.18);
    padding: 18px 20px 14px;
    max-width: 340px;
    width: max-content;
    font-family: "Amazon Ember", "Segoe UI", -apple-system, sans-serif;
    font-size: 14px;
    color: #0f1111;
    line-height: 1.5;
    transition: top 0.25s ease, left 0.25s ease;
  }

  .bas-tour-callout::after {
    content: "";
    position: absolute;
    width: 12px;
    height: 12px;
    background: #fff;
    transform: rotate(45deg);
    box-shadow: -2px -2px 4px rgba(0, 0, 0, 0.06);
  }

  .bas-tour-callout.arrow-top::after {
    top: -6px;
    left: 24px;
  }

  .bas-tour-callout.arrow-left::after {
    left: -6px;
    top: 24px;
  }

  .bas-tour-callout.arrow-none::after {
    display: none;
  }

  .bas-tour-callout.centered {
    top: 50% !important;
    left: 50% !important;
    transform: translate(-50%, -50%);
  }

  .bas-tour-message {
    margin-bottom: 12px;
  }

  .bas-tour-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .bas-tour-counter {
    font-size: 12px;
    color: #888c8c;
  }

  .bas-tour-actions {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .bas-tour-skip {
    background: none;
    border: none;
    color: #888c8c;
    font-size: 12px;
    cursor: pointer;
    font-family: inherit;
    text-decoration: underline;
    padding: 0;
  }

  .bas-tour-skip:hover {
    color: #565959;
  }

  .bas-tour-next {
    background: #ff9900;
    color: #0f1111;
    border: none;
    border-radius: 6px;
    padding: 6px 16px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
    transition: background 0.15s;
  }

  .bas-tour-next:hover {
    background: #e88b00;
  }
`;

// ── Tour Logic ───────────────────────────────────────────────────────

function createOverlay(): HTMLElement {
  const overlay = document.createElement("div");
  overlay.className = "bas-tour-overlay";
  return overlay;
}

function createCallout(): HTMLElement {
  const el = document.createElement("div");
  el.className = "bas-tour-callout";
  el.innerHTML = `
    <div class="bas-tour-message"></div>
    <div class="bas-tour-footer">
      <span class="bas-tour-counter"></span>
      <div class="bas-tour-actions">
        <button class="bas-tour-skip">Skip tour</button>
        <button class="bas-tour-next">Next →</button>
      </div>
    </div>
  `;
  return el;
}

function positionCallout(callout: HTMLElement, step: TourStep): void {
  callout.classList.remove("arrow-top", "arrow-left", "arrow-none", "centered");

  if (!step.target) {
    callout.classList.add("arrow-none", "centered");
    return;
  }

  const target = document.querySelector(step.target);
  if (!target) {
    callout.classList.add("arrow-none", "centered");
    return;
  }

  const rect = target.getBoundingClientRect();
  const calloutWidth = 340;
  const margin = 12;

  // Position below the target
  const top = rect.bottom + margin;
  let left = rect.left;

  // Keep callout on screen
  if (left + calloutWidth > window.innerWidth - 16) {
    left = window.innerWidth - calloutWidth - 16;
  }
  if (left < 16) left = 16;

  callout.style.top = `${top}px`;
  callout.style.left = `${left}px`;
  callout.style.transform = "";
  callout.classList.add("arrow-top");
}

async function runTour(): Promise<void> {
  const overlay = createOverlay();
  const callout = createCallout();
  document.body.appendChild(overlay);
  document.body.appendChild(callout);

  const messageEl = callout.querySelector<HTMLElement>(".bas-tour-message")!;
  const counterEl = callout.querySelector<HTMLElement>(".bas-tour-counter")!;
  const nextBtn = callout.querySelector<HTMLButtonElement>(".bas-tour-next")!;
  const skipBtn = callout.querySelector<HTMLButtonElement>(".bas-tour-skip")!;

  let currentStep = 0;

  const showStep = (index: number): void => {
    const step = STEPS[index];
    messageEl.textContent = step.message;
    counterEl.textContent = `${index + 1}/${STEPS.length}`;
    nextBtn.textContent = index === STEPS.length - 1 ? "Done ✓" : "Next →";
    positionCallout(callout, step);
  };

  return new Promise<void>((resolve) => {
    const finish = async () => {
      overlay.remove();
      callout.remove();
      await markTourSeen();
      resolve();
    };

    nextBtn.addEventListener("click", async () => {
      currentStep++;
      if (currentStep >= STEPS.length) {
        await finish();
      } else {
        showStep(currentStep);
      }
    });

    skipBtn.addEventListener("click", async () => {
      await finish();
    });

    overlay.addEventListener("click", async () => {
      await finish();
    });

    showStep(0);
  });
}

/**
 * Check onboarding state and show the feature tour if appropriate.
 * Safe to call on every page load — no-op if tour was already shown.
 */
export async function tryShowFeatureTour(): Promise<void> {
  const show = await shouldShowTour();
  if (!show) return;
  await runTour();
}
