import { Link, useRouter, type ErrorComponentProps } from "@tanstack/react-router";
import { AlertTriangle, SearchX } from "lucide-react";
import Empty from "./Empty";

export function RouteError({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  return (
    <Empty
      icon={<AlertTriangle size={24} />}
      title="Something went wrong"
      text={error instanceof Error ? error.message : "This page could not be loaded."}
      action={
        <button
          type="button"
          className="cx-btn cx-btn-primary"
          onClick={() => {
            void router.invalidate();
            reset();
          }}
        >
          Try again
        </button>
      }
    />
  );
}

export function RouteNotFound({ title = "Page not found", text, to = "/" as const, label = "Back to Live" }: { title?: string; text?: string; to?: "/" | "/sports"; label?: string }) {
  return (
    <Empty
      icon={<SearchX size={24} />}
      title={title}
      {...(text ? { text } : {})}
      action={
        <Link to={to} className="cx-btn cx-btn-secondary">
          {label}
        </Link>
      }
    />
  );
}
