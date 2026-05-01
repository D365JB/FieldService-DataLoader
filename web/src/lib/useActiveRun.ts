import { useSyncExternalStore } from "react";
import { activeRunStore, type ActiveRunSnapshot } from "@/lib/activeRunStore";

/** React hook that re-renders whenever the active-run store changes. */
export function useActiveRun(): ActiveRunSnapshot {
  return useSyncExternalStore(
    activeRunStore.subscribe,
    activeRunStore.snapshot,
    activeRunStore.snapshot,
  );
}
