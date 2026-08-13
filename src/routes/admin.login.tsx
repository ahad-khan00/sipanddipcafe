import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

function getAuthRedirectUrl() {
  const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
  return new URL("/auth/callback", origin).toString();
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function getFriendlyAuthError(error: { message?: string } | null | undefined) {
  const message = error?.message?.toLowerCase() ?? "";

  if (
    message.includes("invalid login credentials") ||
    message.includes("invalid credentials") ||
    message.includes("incorrect password") ||
    message.includes("user not found") ||
    message.includes("wrong password")
  ) {
    return "Invalid email or password. Please check your credentials and try again.";
  }

  if (message.includes("email not confirmed") || message.includes("confirm your email")) {
    return "Please confirm your email address before signing in.";
  }

  if (message.includes("already registered") || message.includes("user already registered")) {
    return "An account with this email already exists. Please sign in instead.";
  }

  return error?.message ?? "Authentication failed";
}

export const Route = createFileRoute("/admin/login")({
  head: () => ({
    meta: [
      { title: "Owner login — Tablebrew" },
      { name: "description", content: "Sign in to manage your cafe menu, tables and live orders." },
      { property: "og:title", content: "Owner login — Tablebrew" },
      {
        property: "og:description",
        content: "Sign in to manage your cafe menu, tables and live orders.",
      },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/admin", replace: true });
    });
  }, [navigate]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    setBusy(true);
    try {
      const normalizedEmail = normalizeEmail(email);

      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        });

        if (error) {
          throw new Error(getFriendlyAuthError(error));
        }

        navigate({ to: "/admin", replace: true });
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: { emailRedirectTo: getAuthRedirectUrl() },
        });

        if (error) {
          throw new Error(getFriendlyAuthError(error));
        }

        if (data.session) {
          navigate({ to: "/admin", replace: true });
          return;
        }

        setEmailSent(true);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Authentication failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogle() {
    setBusy(true);
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: getAuthRedirectUrl(),
        },
      });

      if (error) throw error;
      if (data?.url) {
        window.location.assign(data.url);
        return;
      }

      navigate({ to: "/admin", replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Google sign-in failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-5 py-12">
      <div className="w-full max-w-sm">
        <Link to="/" className="mb-6 block text-center font-display text-2xl font-semibold">
          Tablebrew
        </Link>

        <div className="surface-card p-6">
          {emailSent ? (
            <div className="space-y-3 text-center">
              <h1 className="font-display text-xl font-semibold">Check your email</h1>
              <p className="text-sm text-muted-foreground">
                We sent a confirmation link to {email}. Click it to activate your owner account,
                then sign in.
              </p>
              <Button variant="outline" className="w-full" onClick={() => setEmailSent(false)}>
                Back to sign in
              </Button>
            </div>
          ) : (
            <>
              <h1 className="font-display text-2xl font-semibold">
                {mode === "signin" ? "Owner login" : "Create your cafe account"}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {mode === "signin"
                  ? "Manage your menu, tables and live orders."
                  : "You'll name your cafe on the next screen."}
              </p>

              <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    required
                    minLength={8}
                    autoComplete={mode === "signin" ? "current-password" : "new-password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={busy}>
                  {mode === "signin" ? "Sign in" : "Create account"}
                </Button>
              </form>

              <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
                <span className="h-px flex-1 bg-border" />
                or
                <span className="h-px flex-1 bg-border" />
              </div>

              <Button variant="outline" className="w-full" disabled={busy} onClick={handleGoogle}>
                Continue with Google
              </Button>

              <button
                type="button"
                className="mt-5 w-full text-sm text-muted-foreground underline-offset-4 hover:underline"
                onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
              >
                {mode === "signin"
                  ? "New here? Create a cafe account"
                  : "Already have an account? Sign in"}
              </button>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
