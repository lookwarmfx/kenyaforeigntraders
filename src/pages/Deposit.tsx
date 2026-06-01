import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, CheckCircle2, DollarSign, Loader2, Smartphone, TrendingUp, XCircle } from "lucide-react";
import { toast } from "sonner";

const EXCHANGE_RATE = 150;
const POLL_INTERVAL_MS = 4000;
const POLL_TIMEOUT_MS = 120_000;

type Stage = "idle" | "prompting" | "success" | "failed" | "timeout";

const Deposit = () => {
  const [amountUsd, setAmountUsd] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState<Stage>("idle");
  const [statusMsg, setStatusMsg] = useState("");
  const navigate = useNavigate();
  const pollRef = useRef<number | null>(null);

  useEffect(() => () => { if (pollRef.current) window.clearInterval(pollRef.current); }, []);

  const amountKes = amountUsd ? (parseFloat(amountUsd) * EXCHANGE_RATE).toFixed(0) : "0";

  const startPolling = (reference: string) => {
    const started = Date.now();
    pollRef.current = window.setInterval(async () => {
      try {
        const { data } = await supabase.functions.invoke("lipwa-status", { body: { reference } });
        if (data?.status === "completed") {
          window.clearInterval(pollRef.current!);
          setStage("success");
          setStatusMsg("Payment received! Your deposit is now active.");
          toast.success("Payment confirmed");
          setTimeout(() => navigate("/dashboard"), 1500);
        } else if (data?.status === "failed") {
          window.clearInterval(pollRef.current!);
          setStage("failed");
          setStatusMsg("Payment failed or was cancelled.");
        } else if (Date.now() - started > POLL_TIMEOUT_MS) {
          window.clearInterval(pollRef.current!);
          setStage("timeout");
          setStatusMsg("Still waiting for confirmation. Check your dashboard shortly.");
        }
      } catch {
        // ignore transient errors
      }
    }, POLL_INTERVAL_MS) as unknown as number;
  };

  const handleDeposit = async () => {
    const usd = parseFloat(amountUsd);
    if (!usd || usd < 0.1 || usd > 200) {
      toast.error("Amount must be between $0.1 and $200");
      return;
    }
    if (!phone.trim()) {
      toast.error("Enter your M-Pesa phone number");
      return;
    }

    setLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) { toast.error("Please log in first"); navigate("/login"); return; }

      const { data, error } = await supabase.functions.invoke("lipwa-stk-push", {
        body: { amount_usd: usd, phone: phone.trim() },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (!data?.reference) throw new Error("No reference returned");

      setStage("prompting");
      setStatusMsg("Check your phone — enter your M-Pesa PIN to complete the payment.");
      toast.success("STK push sent");
      startPolling(data.reference);
    } catch (err: unknown) {
      console.error("Deposit error:", err);
      toast.error(err instanceof Error ? err.message : "Failed to initiate deposit");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <nav className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur">
        <div className="container mx-auto flex items-center justify-between py-4 px-4">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold text-foreground">Kenya Smart Trades</span>
          </Link>
          <Button variant="ghost" asChild>
            <Link to="/"><ArrowLeft className="w-4 h-4 mr-1" /> Back</Link>
          </Button>
        </div>
      </nav>

      <div className="container mx-auto px-4 py-12 max-w-md">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-primary" />
              Make a Deposit
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {stage === "idle" || stage === "failed" || stage === "timeout" ? (
              <>
                <div>
                  <Label htmlFor="amount">Amount (USD)</Label>
                  <Input
                    id="amount"
                    type="number"
                    min="0.1"
                    max="200"
                    step="0.01"
                    placeholder="Enter amount ($0.1 - $200)"
                    value={amountUsd}
                    onChange={(e) => setAmountUsd(e.target.value)}
                  />
                  {amountUsd && (
                    <p className="text-sm text-muted-foreground mt-1">
                      ≈ KES {amountKes}
                    </p>
                  )}
                </div>

                <div>
                  <Label htmlFor="phone">M-Pesa Phone Number</Label>
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="07XX XXX XXX or 2547XX XXX XXX"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>

                <div className="bg-secondary rounded-lg p-3 text-sm text-muted-foreground">
                  <p>• Min deposit: $0.1 • Max: $200</p>
                  <p>• Pay instantly via M-Pesa STK push</p>
                </div>

                {(stage === "failed" || stage === "timeout") && (
                  <div className="rounded-lg p-3 text-sm bg-destructive/10 border border-destructive/20 text-destructive">
                    {statusMsg}
                  </div>
                )}

                <Button className="w-full" size="lg" onClick={handleDeposit} disabled={loading || !amountUsd || !phone}>
                  {loading ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Sending STK push...</>
                  ) : (
                    <><Smartphone className="w-4 h-4 mr-2" /> Pay ${amountUsd || "0.00"} via M-Pesa</>
                  )}
                </Button>
              </>
            ) : stage === "prompting" ? (
              <div className="text-center py-6 space-y-3">
                <Loader2 className="w-12 h-12 mx-auto animate-spin text-primary" />
                <h3 className="text-lg font-semibold text-foreground">Awaiting confirmation</h3>
                <p className="text-sm text-muted-foreground">{statusMsg}</p>
              </div>
            ) : (
              <div className="text-center py-6 space-y-3">
                <CheckCircle2 className="w-12 h-12 mx-auto text-primary" />
                <h3 className="text-lg font-semibold text-foreground">Payment confirmed</h3>
                <p className="text-sm text-muted-foreground">{statusMsg}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Deposit;
