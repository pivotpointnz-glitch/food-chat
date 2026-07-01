"use client";

import { useRouter } from "next/navigation";
import { LogRow } from "@/components/LogRow";
import type { LogEntryWithFood } from "@/lib/types";

export function LogList({ logs }: { logs: LogEntryWithFood[] }) {
  const router = useRouter();

  if (logs.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-neutral-400">
        Nothing logged yet today.
      </p>
    );
  }

  return (
    <>
      {logs.map((log) => (
        <LogRow
          key={log.id}
          log={log}
          onUpdated={() => router.refresh()}
        />
      ))}
    </>
  );
}
