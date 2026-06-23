"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Mic } from "lucide-react";
import { useSpeechRecognition } from "@/lib/useSpeechRecognition";
import { ConfirmItemsList, type RawParsedItem } from "@/components/ConfirmItemsList";

export default function VoiceLogPage() {
  const router = useRouter();
  const { isSupported, isListening, transcript, error: speechError, start, stop, reset } =
    useSpeechRecognition();

  const [stage, setStage] = useState<"record" | "parsing" | "confirm">("record");
  const [parseError, setParseError] = useState<string | null>(null);
  const [items, setItems] = useState<RawParsedItem[]>([]);

  async function handleParse() {
    if (!transcript.trim()) return;
    setStage("parsing");
    setParseError(null);

    try {
      const res = await fetch("/api/voice/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript }),
      });
      const data = await res.json();

      if (data.error) {
        setParseError(data.error);
        setStage("record");
        return;
      }

      setItems(data.items ?? []);
      setStage("confirm");
    } catch {
      setParseError("Something went wrong parsing the recording.");
      setStage("record");
    }
  }

  // --- Recording stage ---
  if (stage === "record") {
    return (
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 pb-24 pt-6">
        <button onClick={() => router.push("/")} className="text-sm font-medium text-emerald-600">
          ← Cancel
        </button>

        <h1 className="mt-3 text-xl font-semibold text-neutral-900">Log by voice</h1>

        {!isSupported ? (
          <p className="mt-6 text-sm text-neutral-500">
            Voice input isn&rsquo;t supported in this browser. Try Chrome, or use manual search
            instead.
          </p>
        ) : (
          <>
            <p className="mt-2 text-sm text-neutral-500">
              Tap the mic and say everything you ate, e.g. &ldquo;two eggs, a slice of toast, and a
              coffee with milk.&rdquo;
            </p>

            <div className="mt-10 flex flex-col items-center">
              <button
                onClick={isListening ? stop : start}
                className={`flex h-24 w-24 items-center justify-center rounded-full text-white shadow-lg transition ${
                  isListening ? "bg-red-500 animate-pulse" : "bg-emerald-600 hover:bg-emerald-700"
                }`}
                aria-label={isListening ? "Stop recording" : "Start recording"}
              >
                <Mic size={36} strokeWidth={2} />
              </button>
              <p className="mt-3 text-sm text-neutral-500">
                {isListening ? "Listening… tap to stop" : "Tap to start"}
              </p>
            </div>

            {transcript && (
              <div className="mt-6 rounded-xl border border-neutral-100 bg-neutral-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                  Transcript
                </p>
                <p className="mt-1 text-sm text-neutral-800">{transcript}</p>
              </div>
            )}

            {speechError && <p className="mt-4 text-sm text-red-600">{speechError}</p>}
            {parseError && <p className="mt-4 text-sm text-red-600">{parseError}</p>}

            {transcript && !isListening && (
              <div className="mt-6 flex gap-2">
                <button
                  onClick={reset}
                  className="flex-1 rounded-lg border border-neutral-200 px-3 py-3 text-sm font-medium text-neutral-600"
                >
                  Clear
                </button>
                <button
                  onClick={handleParse}
                  className="flex-1 rounded-lg bg-emerald-600 px-3 py-3 text-sm font-medium text-white transition hover:bg-emerald-700"
                >
                  Continue
                </button>
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  // --- Parsing stage ---
  if (stage === "parsing") {
    return (
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-4 pt-6">
        <p className="text-sm text-neutral-500">Working out what you ate…</p>
      </div>
    );
  }

  // --- Confirm stage ---
  return (
    <div className="mx-auto w-full max-w-md flex-1 px-4 pb-24 pt-6">
      <button onClick={() => setStage("record")} className="text-sm font-medium text-emerald-600">
        ← Back
      </button>

      <h1 className="mt-3 text-xl font-semibold text-neutral-900">Confirm items</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Pick the right match for each item, adjust quantity if needed.
      </p>

      <ConfirmItemsList
        rawItems={items}
        source="voice"
        showOriginalQuantity
        onAllSaved={() => {
          router.push("/");
          router.refresh();
        }}
      />
    </div>
  );
}
