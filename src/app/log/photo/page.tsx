"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Camera } from "lucide-react";
import { resizeImageToBase64 } from "@/lib/imageResize";
import { ConfirmItemsList, type RawParsedItem } from "@/components/ConfirmItemsList";

export default function PhotoLogPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [stage, setStage] = useState<"capture" | "identifying" | "confirm">("capture");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [items, setItems] = useState<RawParsedItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setPreviewUrl(URL.createObjectURL(file));
    setStage("identifying");

    try {
      const { base64, mediaType } = await resizeImageToBase64(file);

      const res = await fetch("/api/photo/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64, mediaType }),
      });
      const data = await res.json();

      if (data.error) {
        setError(data.error);
        setStage("capture");
        return;
      }

      const identified: { name: string }[] = data.items ?? [];
      if (identified.length === 0) {
        setError("Couldn't identify any food in that photo. Try a clearer shot, or log manually.");
        setStage("capture");
        return;
      }

      setItems(identified.map((i) => ({ name: i.name })));
      setStage("confirm");
    } catch {
      setError("Something went wrong analyzing the photo.");
      setStage("capture");
    }
  }

  function retake() {
    setPreviewUrl(null);
    setStage("capture");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // --- Capture stage ---
  if (stage === "capture") {
    return (
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 pb-24 pt-6">
        <button onClick={() => router.push("/")} className="text-sm font-medium text-emerald-600">
          ← Cancel
        </button>

        <h1 className="mt-3 text-xl font-semibold text-neutral-900">Log by photo</h1>
        <p className="mt-2 text-sm text-neutral-500">
          Take a photo of your plate. We&rsquo;ll identify what&rsquo;s on it — you&rsquo;ll still
          confirm the exact food and quantity yourself, since portion size can&rsquo;t be measured
          reliably from a photo alone.
        </p>

        <div className="mt-10 flex flex-col items-center">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex h-24 w-24 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg transition hover:bg-emerald-700"
            aria-label="Take photo"
          >
            <Camera size={36} strokeWidth={2} />
          </button>
          <p className="mt-3 text-sm text-neutral-500">Tap to take a photo</p>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileSelected}
          className="hidden"
        />

        {error && <p className="mt-6 text-sm text-red-600">{error}</p>}
      </div>
    );
  }

  // --- Identifying stage ---
  if (stage === "identifying") {
    return (
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 pb-24 pt-6">
        {previewUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt="Captured plate"
            className="mt-4 max-h-64 w-full rounded-xl object-cover"
          />
        )}
        <p className="mt-6 text-center text-sm text-neutral-500">Looking at your plate…</p>
      </div>
    );
  }

  // --- Confirm stage ---
  return (
    <div className="mx-auto w-full max-w-md flex-1 px-4 pb-24 pt-6">
      <button onClick={retake} className="text-sm font-medium text-emerald-600">
        ← Retake photo
      </button>

      {previewUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={previewUrl}
          alt="Captured plate"
          className="mt-3 max-h-48 w-full rounded-xl object-cover"
        />
      )}

      <h1 className="mt-3 text-xl font-semibold text-neutral-900">Confirm items</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Here&rsquo;s what we spotted — pick the right match and set the quantity for each.
      </p>

      <ConfirmItemsList
        rawItems={items}
        source="photo"
        showOriginalQuantity={false}
        onAllSaved={() => {
          router.push("/");
          router.refresh();
        }}
      />
    </div>
  );
}
