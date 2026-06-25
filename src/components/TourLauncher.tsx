"use client";

import { useState, useEffect } from "react";
import { OnboardingTour } from "@/components/OnboardingTour";

export function TourLauncher({ hasSeenTour }: { hasSeenTour: boolean }) {
  const [showTour, setShowTour] = useState(false);

  useEffect(() => {
    if (!hasSeenTour) {
      // Small delay so the dashboard's layout has settled before we
      // measure button positions for the spotlight.
      const t = setTimeout(() => setShowTour(true), 300);
      return () => clearTimeout(t);
    }
  }, [hasSeenTour]);

  async function finishTour() {
    setShowTour(false);
    await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hasSeenTour: true }),
    });
  }

  if (!showTour) return null;

  return <OnboardingTour onFinish={finishTour} />;
}
