import { supabase } from "../supabase/client";

type SignInOptions = {
  redirect_uri?: string;
  redirectTo?: string;
  extraParams?: Record<string, string>;
};

function getRedirectUrl(redirectUri?: string) {
  if (redirectUri) return redirectUri;

  const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
  return new URL("/auth/callback", origin).toString();
}

export const lovable = {
  auth: {
    signInWithOAuth: async (
      provider: "google" | "apple" | "microsoft" | "lovable",
      opts?: SignInOptions,
    ) => {
      if (provider === "lovable") {
        return {
          error: new Error("The Lovable provider is not configured for this app. Use the Supabase Google OAuth flow."),
        };
      }

      const mappedProvider = provider === "microsoft" ? "azure" : provider;
      const redirectTo = getRedirectUrl(opts?.redirect_uri ?? opts?.redirectTo);

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: mappedProvider,
        options: {
          redirectTo,
          queryParams: opts?.extraParams,
        },
      });

      if (error) {
        return { error };
      }

      return {
        redirected: Boolean(data?.url),
        url: data?.url,
      };
    },
  },
};
