import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { Toaster } from "sonner";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import Layout from "@/components/Layout";

function NotFoundComponent() {
  return (
    <Layout>
      <div className="cx-empty" style={{ minHeight: "60vh", justifyContent: "center" }}>
        <b style={{ fontSize: 56, fontFamily: "var(--font-display)" }}>404</b>
        <b>Page not found</b>
        <p>The page you're looking for doesn't exist or has been moved.</p>
        <Link to="/" className="cx-btn cx-btn-primary">
          Go to Live matches
        </Link>
      </div>
    </Layout>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="cx-empty" style={{ minHeight: "100vh", justifyContent: "center" }}>
      <b>This page didn't load</b>
      <p>Something went wrong on our end. You can try refreshing or head back home.</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
        <button
          onClick={() => {
            void router.invalidate();
            reset();
          }}
          className="cx-btn cx-btn-primary"
        >
          Try again
        </button>
        <a href="/" className="cx-btn cx-btn-secondary">
          Go home
        </a>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "theme-color", content: "#08090d" },
      { title: "Cricx X · Sports Live" },
      { name: "description", content: "Cricx X — cricket live streaming, scores and 24/7 sports channels." },
      { property: "og:site_name", content: "Cricx X" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=DM+Sans:wght@400;500;700&display=swap",
      },
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <Layout>
        <Outlet />
      </Layout>
      <Toaster position="top-center" richColors />
    </QueryClientProvider>
  );
}
