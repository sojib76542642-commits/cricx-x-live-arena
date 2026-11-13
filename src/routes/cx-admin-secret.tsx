import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import type { Session } from "@supabase/supabase-js";
import { ShieldAlert, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import Empty from "@/components/Empty";
import AdminLogin from "@/components/admin/AdminLogin";
import AdminDashboard from "@/components/admin/AdminDashboard";

export const Route = createFileRoute("/cx-admin-secret")({
  // The sign-in session lives in the browser, so this page renders only there.
  ssr: false,
  head: () => ({
    meta: [
      { title: "Admin · Cricx X" },
      { name: "description", content: "Cricx X administrator control panel." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Admin · Cricx X" },
      { property: "og:description", content: "Cricx X administrator control panel." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminPage,
});

type RoleState = "checking" | "admin" | "denied" | "error";

function AdminPage() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [role, setRole] = useState<RoleState>("checking");

  useEffect(() => {
    let alive = true;
    supabase.auth
      .getSession()
      .then(({ data }) => alive && setSession(data.session))
      .catch(() => alive && setSession(null));
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED" || event === "INITIAL_SESSION") setSession(s);
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const userId = session?.user.id;
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    setRole("checking");
    // UI check only; the database's security rules are what actually block non-admin writes.
    supabase
      .rpc("has_role", { _user_id: userId, _role: "admin" })
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) setRole("error");
        else setRole(data ? "admin" : "denied");
      });
    return () => {
      alive = false;
    };
  }, [userId]);

  if (session === undefined || (session && role === "checking")) {
    return <Empty icon={<Loader2 className="cx-spin" size={24} />} title="Checking access…" />;
  }
  if (!session) return <AdminLogin />;

  if (role !== "admin") {
    return (
      <Empty
        icon={<ShieldAlert size={24} />}
        title={role === "error" ? "Couldn't verify access" : "Access denied"}
        text={
          role === "error"
            ? "We couldn't check your permissions. Please try again."
            : `${session.user.email ?? "This account"} is signed in but is not an administrator.`
        }
        action={
          <button type="button" className="cx-btn cx-btn-secondary" onClick={() => void supabase.auth.signOut()}>
            Sign out
          </button>
        }
      />
    );
  }

  return <AdminDashboard email={session.user.email ?? ""} />;
}
