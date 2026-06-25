"use client";

import { useState, useEffect, useCallback } from "react";

interface TourStep {
  targetId: string;
  title: string;
  description: string;
}

const TOUR_STEPS: TourStep[] = [
  {
    targetId: "tour-log-manual",
    title: "Log food manually",
    description: "Search our food database, set a quantity and meal, and log it in a few taps.",
  },
  {
    targetId: "tour-log-voice",
    title: "Log by voice",
    description: 'Say what you ate out loud — "two eggs and toast" — and confirm the matches.',
  },
  {
    targetId: "tour-log-photo",
    title: "Log by photo",
    description: "Snap a photo of your plate and we'll identify what's on it for you to confirm.",
  },
  {
    targetId: "tour-my-foods",
    title: "Save your own foods",
    description: "Add your own recipes, such as your favourite smoothie, for easy logging.",
  },
  {
    targetId: "tour-history",
    title: "Track your history",
    description: "See daily, weekly, and monthly trends, and export your log as a spreadsheet anytime.",
  },
];

interface SpotlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export function OnboardingTour({ onFinish }: { onFinish: () => void }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<SpotlightRect | null>(null);

  const step = TOUR_STEPS[stepIndex];
  const isLastStep = stepIndex === TOUR_STEPS.length - 1;

  const measureTarget = useCallback(() => {
    const el = document.getElementById(step.targetId);
    if (!el) {
      setRect(null);
      return;
    }
    const r = el.getBoundingClientRect();
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, [step.targetId]);

  useEffect(() => {
    measureTarget();
    window.addEventListener("resize", measureTarget);
    return () => window.removeEventListener("resize", measureTarget);
  }, [measureTarget]);

  function next() {
    if (isLastStep) {
      onFinish();
    } else {
      setStepIndex((i) => i + 1);
    }
  }

  // Position the explanation card above or below the spotlighted element,
  // depending on which has more room, so it never runs off-screen.
  const viewportHeight = typeof window !== "undefined" ? window.innerHeight : 800;
  const showCardAbove = rect ? rect.top > viewportHeight / 2 : true;

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="App tour">
      {/* Dimmed backdrop with a cut-out spotlight around the target element */}
      <svg className="absolute inset-0 h-full w-full" style={{ pointerEvents: "none" }}>
        <defs>
          <mask id="spotlight-mask">
            <rect width="100%" height="100%" fill="white" />
            {rect && (
              <rect
                x={rect.left - 8}
                y={rect.top - 8}
                width={rect.width + 16}
                height={rect.height + 16}
                rx={16}
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="rgba(15, 23, 42, 0.6)" mask="url(#spotlight-mask)" />
        {rect && (
          <rect
            x={rect.left - 8}
            y={rect.top - 8}
            width={rect.width + 16}
            height={rect.height + 16}
            rx={16}
            fill="none"
            stroke="#10b981"
            strokeWidth={2}
          />
        )}
      </svg>

      {/* Clickable scrim to allow skipping by tapping outside the card */}
      <div className="absolute inset-0" onClick={next} />

      {/* Explanation card */}
      <div
        className="absolute left-1/2 z-10 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 rounded-2xl bg-white p-4 shadow-xl"
        style={
          rect
            ? showCardAbove
              ? { top: Math.max(16, rect.top - 8 - 160) }
              : { top: rect.top + rect.height + 24 }
            : { top: "50%", transform: "translate(-50%, -50%)" }
        }
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-xs font-medium text-emerald-600">
          Step {stepIndex + 1} of {TOUR_STEPS.length}
        </p>
        <h3 className="mt-1 text-base font-semibold text-neutral-900">{step.title}</h3>
        <p className="mt-1 text-sm text-neutral-600">{step.description}</p>

        <div className="mt-4 flex items-center justify-between">
          <button onClick={onFinish} className="text-sm font-medium text-neutral-400">
            Skip tour
          </button>
          <button
            onClick={next}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700"
          >
            {isLastStep ? "Done" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
