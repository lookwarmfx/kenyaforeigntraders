import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, ShieldCheck } from "lucide-react";

// Local typed wrapper — supabase.auth.oauth is a beta namespace not in the
// generated types. The Supabase client method exists at runtime.
type OAuthClient = { name?: string; redirect_uri?: string };
type AuthorizationDetails = {
  client?: OAuthClient;
  scope?: string;
  redirect_url?: string;
  redirect_to?: string;
};
type AuthorizationResult = {
  data: AuthorizationDetails | null;
  error: { message: string } | null;
};
type OAuthApi = {
  getAuthorizationDetails: (id: string) => Promise<AuthorizationResult>;
  approveAuthorization: (id: string) => Promise<AuthorizationResult>;
  denyAuthorization: (id: string) => Promise<AuthorizationResult>;
};

const oauthApi = (supabase.auth as unknown as { oauth: OAuthApi }).oauth;

const OAuthConsent = () => {
  const [params] = useSearchParams();
  const authorizationId = params.get("authorization_id") ?? "";
  const [details, setDetails] = useState<AuthorizationDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!authorizationId) {
        setError("Missing authorization_id");
        return;
      }
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        const next = window.location.pathname + window.location.search;
        window.location.href = "/login?next=" + encodeURIComponent(next);
        return;
      }
      const { data, error } = await oauthApi.getAuthorizationDetails(authorizationId);
      if (!active) return;
      if (error) {
        setError(error.message);
        return;
      }
      const immediate = data?.redirect_url ?? data?.redirect_to;
      if (immediate && !data?.client) {
        window.location.href = immediate;
        return;
      }
      setDetails(data);
    })();
    return () => {
      active = false;
    };
  }, [authorizationId]);

  const decide = async (approve: boolean) => {
    setBusy(true);
    const { data, error } = approve
      ? await oauthApi.approveAuthorization(authorizationId)
      : await oauthApi.denyAuthorization(authorizationId);
    if (error) {
      setBusy(false);
      setError(error.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("No redirect returned by the authorization server.");
      return;
    }
    window.location.href = target;
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-primary" />
            Authorize connection
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {error ? (
            <div className="rounded-lg p-3 text-sm bg-destructive/10 border border-destructive/20 text-destructive">
              Could not load this authorization request: {error}
            </div>
          ) : !details ? (
            <div className="flex items-center gap-2 text-muted-foreground py-6 justify-center">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading authorization…
            </div>
          ) : (
            <>
              <div>
                <h2 className="text-lg font-semibold text-foreground">
                  Connect {details.client?.name ?? "an app"} to your account
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  This lets {details.client?.name ?? "the client"} use Kenya Smart Trades tools while
                  you are signed in — check balances, view deposits/withdrawals, and submit
                  withdrawal requests as you.
                </p>
              </div>
              <div className="text-xs text-muted-foreground bg-secondary rounded-lg p-3 space-y-1">
                <p>• Share your basic profile and email</p>
                <p>• Act on your account only while you are signed in</p>
                <p>• Your app permissions and backend policies still apply</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => decide(false)} disabled={busy}>
                  Deny
                </Button>
                <Button className="flex-1" onClick={() => decide(true)} disabled={busy}>
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Approve"}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default OAuthConsent;
