import { useHydrated } from "@tanstack/react-router";

/**
 * Renders a date in the visitor's own time zone. The server doesn't know the
 * visitor's zone, so the text appears right after the page becomes interactive.
 */
export default function LocalTime({ value, format }: { value: string; format: (v: string) => string }) {
  const hydrated = useHydrated();
  return <span suppressHydrationWarning>{hydrated ? format(value) : "\u00a0"}</span>;
}
