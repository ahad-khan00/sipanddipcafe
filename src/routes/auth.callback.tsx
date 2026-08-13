import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth/callback")({
  component: AuthCallbackPage,
});

function AuthCallbackPage() {
  const navigate = useNavigate();
  const [message, setMessage] = useState("Completing sign in…");

  useEffect(() => {
    let active = true;

    async function completeAuth() {
      try {
        const params = new URLSearchParams(window.location.search);
        const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
        const code = params.get("code") ?? hashParams.get("code");
        const error = params.get("error") ?? hashParams.get("error");

        if (error) {
          throw new Error(error);
        }

        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) {
            throw exchangeError;
          }
        }

        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (!active) return;

        if (sessionError) {
          throw sessionError;
        }

        if (!session) {
          throw new Error("Authentication was not completed successfully.");
        }

        navigate({ to: "/admin", replace: true });
      } catch (error) {
        console.error("OAuth callback failed:", error);
        if (!active) return;
        setMessage(
          error instanceof Error ? error.message : "Authentication failed. Please try again.",
        );
        setTimeout(() => navigate({ to: "/admin/login", replace: true }), 2000);
      }
    }

    void completeAuth();

    return () => {
      active = false;
    };
  }, [navigate]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 text-center shadow-sm">
        <p className="font-display text-lg font-semibold text-foreground">Signing you in</p>
        <p className="mt-3 text-sm text-muted-foreground">{message}</p>
      </div>
    </main>
  );
}
