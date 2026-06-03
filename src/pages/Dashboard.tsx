import { useEffect, useState, useRef, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import {
  TrendingUp, Bell, LogOut, ArrowUpRight,
  Clock, DollarSign, BarChart3, Shield, Loader2,
  Wallet, ChevronRight, CreditCard,
  ArrowDownLeft, History, User, Zap, Timer, Bot,
} from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";

const PROFIT_RATE = 0.5;       // 50%
const PROFIT_DELAY_MS = 30 * 60 * 1000; // 30 minutes in ms

const fadeIn = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.08, duration: 0.4, ease: [0, 0, 0.2, 1] as const },
  }),
};

/** Returns seconds remaining until profit unlocks (0 if already unlocked) */
function secondsUntilProfit(createdAt: string): number {
  const elapsed = Date.now() - new Date(createdAt).getTime();
  const remaining = PROFIT_DELAY_MS - elapsed;
  return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
}

function formatCountdown(secs: number): string {
  const m = Math.floor(secs / 60).toString().padStart(2, "0");
  const s = (secs % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

/** Compute expected profit for a completed deposit (50% of amount_kes) */
function expectedProfit(amountKes: number): number {
  return Math.round(amountKes * PROFIT_RATE);
}

const Dashboard = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<{ email?: string; full_name?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [deposits, setDeposits] = useState<any[]>([]);
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [depositAmount, setDepositAmount] = useState(""); // USD
  const [depositPhone, setDepositPhone] = useState("");
  const [depositLoading, setDepositLoading] = useState(false);
  const [depositStage, setDepositStage] = useState<"idle" | "prompting" | "success" | "failed">("idle");
  const [depositStatusMsg, setDepositStatusMsg] = useState("");
  const depositPollRef = useRef<number | null>(null);
  const [withdrawAmount, setWithdrawAmount] = useState(""); // USD
  const [withdrawMpesaPhone, setWithdrawMpesaPhone] = useState("");
  const [withdrawLoading, setWithdrawLoading] = useState(false);
  const [now, setNow] = useState(Date.now());
  const applyingRef = useRef<Set<string>>(new Set());

  // Tick every second for live countdowns
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  /**
   * For each completed deposit where:
   * - 30 min have passed since created_at
   * - profit_amount is 0 or not yet set to the expected 50%
   * → write the profit to DB once
   */
  const applyAutoProfits = useCallback(async (deps: any[]) => {
    const eligible = deps.filter((d) => {
      if (d.status !== "completed") return false;
      const elapsed = Date.now() - new Date(d.created_at).getTime();
      if (elapsed < PROFIT_DELAY_MS) return false;
      const expected = expectedProfit(Number(d.amount_kes));
      const current = Number(d.profit_amount || 0);
      // Only apply if profit hasn't been set to expected value yet
      return current < expected;
    });

    for (const dep of eligible) {
      if (applyingRef.current.has(dep.id)) continue;
      applyingRef.current.add(dep.id);

      const profit = expectedProfit(Number(dep.amount_kes));
      const { error } = await supabase
        .from("deposits")
        .update({ profit_amount: profit })
        .eq("id", dep.id);

      if (!error) {
        setDeposits((prev) =>
          prev.map((d) => d.id === dep.id ? { ...d, profit_amount: profit } : d)
        );
      }
      applyingRef.current.delete(dep.id);
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate("/login"); return; }
      const meta = session.user.user_metadata;
      setUser({
        email: session.user.email,
        full_name: meta?.full_name || meta?.first_name || session.user.email?.split("@")[0],
      });
      const [depositsRes, withdrawalsRes] = await Promise.all([
        supabase.from("deposits").select("*").order("created_at", { ascending: false }),
        supabase.from("withdrawals").select("*").order("created_at", { ascending: false }),
      ]);
      const deps = depositsRes.data || [];
      setDeposits(deps);
      if (withdrawalsRes.data) setWithdrawals(withdrawalsRes.data);
      setLoading(false);
      // Apply profits for any deposit that already matured
      await applyAutoProfits(deps);
    };
    init();

    const channel = supabase
      .channel("dashboard-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "deposits" }, (payload) => {
        if (payload.eventType === "INSERT") {
          setDeposits((prev) => {
            const updated = [payload.new as any, ...prev];
            applyAutoProfits(updated);
            return updated;
          });
        } else if (payload.eventType === "UPDATE") {
          setDeposits((prev) =>
            prev.map((d) => d.id === (payload.new as any).id ? payload.new as any : d)
          );
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "withdrawals" }, (payload) => {
        if (payload.eventType === "INSERT") {
          setWithdrawals((prev) => [payload.new as any, ...prev]);
        } else if (payload.eventType === "UPDATE") {
          setWithdrawals((prev) =>
            prev.map((w) => w.id === (payload.new as any).id ? payload.new as any : w)
          );
        } else if (payload.eventType === "DELETE") {
          setWithdrawals((prev) => prev.filter((w) => w.id !== (payload.old as any).id));
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [navigate, applyAutoProfits]);

  // Re-check every 10 s so profits are applied promptly when the timer fires
  useEffect(() => {
    if (deposits.length === 0) return;
    applyAutoProfits(deposits);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Math.floor(now / 10000)]); // runs every ~10 s

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  const startDepositPoll = useCallback((reference: string) => {
    const started = Date.now();
    depositPollRef.current = window.setInterval(async () => {
      try {
        const { data } = await supabase.functions.invoke("lipwa-status", { body: { reference } });
        if (data?.status === "completed") {
          window.clearInterval(depositPollRef.current!);
          setDepositStage("success");
          setDepositStatusMsg("Payment received! Your deposit is now active.");
          toast.success("Payment confirmed");
          setDepositAmount("");
          setDepositPhone("");
        } else if (data?.status === "failed") {
          window.clearInterval(depositPollRef.current!);
          setDepositStage("failed");
          setDepositStatusMsg("Payment failed or was cancelled.");
        } else if (Date.now() - started > 120_000) {
          window.clearInterval(depositPollRef.current!);
          setDepositStage("idle");
          setDepositStatusMsg("Still waiting — your deposit will appear once confirmed.");
        }
      } catch { /* transient */ }
    }, 4000) as unknown as number;
  }, []);

  const handleDeposit = async () => {
    const usd = parseFloat(depositAmount);
    if (!usd || usd < 0.1 || usd > 200) {
      toast.error("Amount must be between $0.1 and $200");
      return;
    }
    if (!depositPhone.trim()) {
      toast.error("Enter your M-Pesa phone number");
      return;
    }
    setDepositLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) { toast.error("Please log in first"); navigate("/login"); return; }
      const { data, error } = await supabase.functions.invoke("lipwa-stk-push", {
        body: { amount_usd: usd, phone: depositPhone.trim() },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (!data?.reference) throw new Error("No reference returned");
      setDepositStage("prompting");
      setDepositStatusMsg("Check your phone — enter your M-Pesa PIN to complete the payment.");
      toast.success("STK push sent");
      startDepositPoll(data.reference);
    } catch (err: unknown) {
      console.error("Deposit error:", err);
      toast.error(err instanceof Error ? err.message : "Failed to initiate deposit");
    } finally {
      setDepositLoading(false);
    }
  };

  const handleWithdraw = async () => {
    const usd = parseFloat(withdrawAmount);

    if (!usd || usd <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    if (!withdrawMpesaPhone.trim()) {
      toast.error("Enter your M-Pesa phone number");
      return;
    }
    setWithdrawLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) { toast.error("Please log in"); navigate("/login"); return; }

      const amountKes = usd * 150;
      const { error } = await supabase.from("withdrawals").insert({
        user_id: sessionData.session.user.id,
        amount_usd: usd,
        amount_kes: amountKes,
        mpesa_phone: withdrawMpesaPhone.trim(),
        status: "approved",
      });

      if (error) throw error;
      toast.success("Withdrawal approved! Funds will be sent to your M-Pesa shortly.");
      setWithdrawAmount("");
      setWithdrawMpesaPhone("");

      const { data } = await supabase.from("withdrawals").select("*").order("created_at", { ascending: false });
      if (data) setWithdrawals(data);
    } catch (err: unknown) {
      console.error("Withdrawal error:", err);
      toast.error(err instanceof Error ? err.message : "Failed to submit withdrawal");
    } finally {
      setWithdrawLoading(false);
    }
  };

  // ── Derived values ──────────────────────────────────────────────────────────
  const completedDeposits = deposits.filter((d) => d.status === "completed");
  const totalDeposits = completedDeposits.reduce((sum, d) => sum + Number(d.amount_kes), 0);
  const totalProfit = deposits.reduce((sum, d) => sum + Number(d.profit_amount || 0), 0);
  const pendingTrades = deposits.filter((d) => d.status === "pending").reduce((sum, d) => sum + Number(d.amount_kes), 0);
  const totalCredits = totalDeposits + totalProfit;
  const totalDebits = withdrawals
    .filter((w: any) => ["approved", "processing", "completed"].includes(w.status))
    .reduce((sum: number, w: any) => sum + Number(w.amount_kes), 0);
  const availableBalance = Math.max(0, totalCredits - totalDebits);

  // Deposits waiting for their 30-min timer
  const pendingProfitDeposits = completedDeposits.filter((d) => {
    const secs = secondsUntilProfit(d.created_at);
    return secs > 0 && Number(d.profit_amount || 0) < expectedProfit(Number(d.amount_kes));
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const statCards = [
    { label: "Total Deposits", value: `KSH ${totalDeposits.toLocaleString()}`, icon: Wallet, color: "text-primary" },
    { label: "Total Profit", value: `KSH ${totalProfit.toLocaleString()}`, icon: ArrowUpRight, color: "text-primary" },
    { label: "Pending Trades", value: `KSH ${pendingTrades.toLocaleString()}`, icon: Clock, color: "text-[hsl(var(--warning))]" },
    { label: "Available Balance", value: `KSH ${availableBalance.toLocaleString()}`, icon: DollarSign, color: "text-primary" },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <nav className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur">
        <div className="flex items-center justify-between py-3 px-4 max-w-lg mx-auto">
          <Link to="/dashboard" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="text-base font-bold text-foreground">Kenya Smart Trades</span>
          </Link>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <Bell className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleLogout}>
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </nav>

      <div className="max-w-lg mx-auto px-4 py-5 pb-12">
        {/* Welcome */}
        <motion.div initial="hidden" animate="visible" variants={fadeIn} custom={0} className="mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
              <User className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground">
                Welcome back, {user?.full_name || "Trader"}!
              </h1>
              <p className="text-xs text-muted-foreground">Here's your account summary</p>
            </div>
          </div>
        </motion.div>

        {/* Active profit countdown banners */}
        {pendingProfitDeposits.map((d) => {
          const secs = secondsUntilProfit(d.created_at);
          const elapsed = PROFIT_DELAY_MS - secs * 1000;
          const progress = Math.min(100, (elapsed / PROFIT_DELAY_MS) * 100);
          const profitKes = expectedProfit(Number(d.amount_kes));
          return (
            <motion.div
              key={d.id}
              initial="hidden" animate="visible" variants={fadeIn} custom={0.5}
              className="mb-3"
            >
              <div className="rounded-xl border border-[hsl(var(--warning))]/40 bg-[hsl(var(--warning))]/8 p-3.5">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Timer className="w-4 h-4 text-[hsl(var(--warning))]" />
                    <span className="text-xs font-semibold text-[hsl(var(--warning))]">
                      Profit generating…
                    </span>
                  </div>
                  <span className="text-sm font-bold text-[hsl(var(--warning))] tabular-nums">
                    {formatCountdown(secs)}
                  </span>
                </div>
                {/* Progress bar */}
                <div className="h-1.5 bg-[hsl(var(--warning))]/20 rounded-full overflow-hidden mb-2">
                  <div
                    className="h-full bg-[hsl(var(--warning))] rounded-full transition-all duration-1000"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Deposit: <span className="font-medium text-foreground">KSH {Number(d.amount_kes).toLocaleString()}</span>
                  {" "}→ Profit on unlock:{" "}
                  <span className="font-semibold text-[hsl(var(--warning))]">+KSH {profitKes.toLocaleString()}</span>
                </p>
              </div>
            </motion.div>
          );
        })}

        {/* Stat Cards */}
        <div className="grid grid-cols-2 gap-3 mb-5">
          {statCards.map((stat, i) => (
            <motion.div key={stat.label} initial="hidden" animate="visible" variants={fadeIn} custom={i + 1}>
              <Card className="border-border bg-card hover:bg-accent/50 transition-colors">
                <CardContent className="p-3.5">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                      {stat.label}
                    </span>
                    <stat.icon className={`w-3.5 h-3.5 ${stat.color}`} />
                  </div>
                  <p className="text-xl font-bold text-foreground">{stat.value}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Tabs */}
        <motion.div initial="hidden" animate="visible" variants={fadeIn} custom={5}>
          <Tabs defaultValue="trades" className="mb-6">
            <TabsList className="w-full grid grid-cols-4 bg-secondary h-10 rounded-xl">
              <TabsTrigger value="trades" className="rounded-lg text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                Trades
              </TabsTrigger>
              <TabsTrigger value="deposit" className="rounded-lg text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                Deposit
              </TabsTrigger>
              <TabsTrigger value="withdraw" className="rounded-lg text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                Withdraw
              </TabsTrigger>
              <TabsTrigger value="history" className="rounded-lg text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                History
              </TabsTrigger>
            </TabsList>

            {/* ── Trades Tab ── */}
            <TabsContent value="trades">
              <Card className="border-border bg-card">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <BarChart3 className="w-4 h-4 text-primary" />
                    <h3 className="text-sm font-bold text-foreground">Active Trades & Profit</h3>
                  </div>
                  {completedDeposits.length === 0 ? (
                    <div className="text-center py-10">
                      <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center mx-auto mb-3">
                        <BarChart3 className="w-6 h-6 text-muted-foreground" />
                      </div>
                      <p className="text-sm text-muted-foreground">No trades yet.</p>
                      <p className="text-xs text-muted-foreground mt-1">Make a deposit to get started!</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {completedDeposits.map((d) => {
                        const secs = secondsUntilProfit(d.created_at);
                        const profit = Number(d.profit_amount || 0);
                        const profitUnlocked = secs === 0;
                        const progress = profitUnlocked ? 100 : Math.min(100,
                          ((PROFIT_DELAY_MS - secs * 1000) / PROFIT_DELAY_MS) * 100
                        );
                        return (
                          <div key={d.id} className="p-2.5 rounded-lg bg-secondary/50 space-y-2">
                            <div className="flex justify-between items-center">
                              <div>
                                <p className="text-xs font-medium text-foreground">Trade Deposit</p>
                                <p className="text-[10px] text-muted-foreground">
                                  {new Date(d.created_at).toLocaleDateString()} •{" "}
                                  {new Date(d.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="text-sm font-semibold text-foreground">
                                  KSH {Number(d.amount_kes).toLocaleString()}
                                </p>
                                {profitUnlocked && profit > 0 ? (
                                  <p className="text-xs font-bold text-primary flex items-center gap-1 justify-end">
                                    <Zap className="w-3 h-3" />
                                    +KSH {profit.toLocaleString()}
                                  </p>
                                ) : !profitUnlocked ? (
                                  <p className="text-[10px] text-[hsl(var(--warning))] tabular-nums font-mono">
                                    {formatCountdown(secs)}
                                  </p>
                                ) : null}
                              </div>
                            </div>
                            {/* Progress bar */}
                            <div className="h-1 bg-border rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-1000 ${profitUnlocked ? "bg-primary" : "bg-[hsl(var(--warning))]"}`}
                                style={{ width: `${progress}%` }}
                              />
                            </div>
                            {!profitUnlocked && (
                              <p className="text-[10px] text-muted-foreground">
                                50% profit (+KSH {expectedProfit(Number(d.amount_kes)).toLocaleString()}) unlocks in {formatCountdown(secs)}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── Deposit Tab ── */}
            <TabsContent value="deposit">
              <Card className="border-border bg-card">
                <CardContent className="p-4 space-y-3">
                  {/* 50% profit info banner */}
                  <div className="rounded-lg bg-primary/10 border border-primary/20 p-3 flex items-start gap-2.5">
                    <Zap className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs font-semibold text-foreground">50% Profit in 30 Minutes</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Every deposit earns 50% profit automatically after 30 minutes. Deposit KSH 100 → receive KSH 50 profit.
                      </p>
                    </div>
                  </div>
                  {depositStage === "prompting" ? (
                    <div className="text-center py-6 space-y-2">
                      <Loader2 className="w-10 h-10 mx-auto animate-spin text-primary" />
                      <p className="text-sm font-semibold text-foreground">Awaiting confirmation</p>
                      <p className="text-[11px] text-muted-foreground">{depositStatusMsg}</p>
                    </div>
                  ) : depositStage === "success" ? (
                    <div className="text-center py-6 space-y-2">
                      <Zap className="w-10 h-10 mx-auto text-primary" />
                      <p className="text-sm font-semibold text-foreground">Payment confirmed</p>
                      <p className="text-[11px] text-muted-foreground">{depositStatusMsg}</p>
                      <Button variant="outline" size="sm" className="mt-2" onClick={() => setDepositStage("idle")}>Make another deposit</Button>
                    </div>
                  ) : (
                    <>
                      <div>
                        <Label htmlFor="depositAmount" className="text-xs">Amount (USD)</Label>
                        <Input
                          id="depositAmount"
                          type="number"
                          min="0.1"
                          max="200"
                          step="0.01"
                          placeholder="$0.1 - $200"
                          value={depositAmount}
                          onChange={(e) => setDepositAmount(e.target.value)}
                          className="bg-secondary border-border"
                        />
                        {depositAmount && parseFloat(depositAmount) >= 0.1 && (
                          <p className="text-[11px] text-primary mt-1">
                            ≈ KSH {(parseFloat(depositAmount) * 150).toLocaleString()} • You'll receive <span className="font-bold">+${(parseFloat(depositAmount) * 0.5).toFixed(2)}</span> profit after 30 min
                          </p>
                        )}
                      </div>
                      <div>
                        <Label htmlFor="depositPhone" className="text-xs">M-Pesa Phone Number</Label>
                        <Input
                          id="depositPhone"
                          type="tel"
                          placeholder="07XX XXX XXX"
                          value={depositPhone}
                          onChange={(e) => setDepositPhone(e.target.value)}
                          className="bg-secondary border-border"
                        />
                      </div>
                      <div className="bg-secondary rounded-lg p-3 text-xs text-muted-foreground space-y-1">
                        <p>• Min deposit: $0.1 • Max: $200</p>
                        <p>• Pay instantly via M-Pesa STK push</p>
                        <p className="text-primary font-medium">• 50% profit credited after 30 minutes</p>
                      </div>
                      {depositStage === "failed" && (
                        <div className="rounded-lg p-2.5 text-[11px] bg-destructive/10 border border-destructive/20 text-destructive">
                          {depositStatusMsg}
                        </div>
                      )}
                      <Button
                        className="w-full"
                        onClick={handleDeposit}
                        disabled={depositLoading || !depositAmount || !depositPhone}
                      >
                        {depositLoading ? (
                          <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Sending STK push...</>
                        ) : (
                          <>
                            <CreditCard className="w-4 h-4 mr-2" />
                            Pay ${depositAmount || "0.00"} via M-Pesa
                          </>
                        )}
                      </Button>
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── Withdraw Tab ── */}
            <TabsContent value="withdraw">
              <Card className="border-border bg-card">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center gap-2 mb-1">
                    <ArrowDownLeft className="w-4 h-4 text-primary" />
                    <h3 className="text-sm font-bold text-foreground">Instant Withdrawal</h3>
                  </div>
                  <div className="bg-secondary rounded-lg p-3 text-xs text-muted-foreground">
                    <p className="font-medium text-foreground text-sm mb-1">
                      Available balance: KSH {availableBalance.toLocaleString()}
                    </p>
                    <p>• Sent instantly to your M-Pesa number</p>
                    <p>• Withdraw deposits and profits — no waiting</p>
                  </div>
                  <>
                    <div>
                      <Label htmlFor="wAmount" className="text-xs">Amount (USD)</Label>
                      <Input
                        id="wAmount"
                        type="number"
                        min="0.1"
                        step="0.01"
                        placeholder="Enter amount in USD"
                        value={withdrawAmount}
                        onChange={(e) => setWithdrawAmount(e.target.value)}
                        className="bg-secondary border-border"
                      />
                    </div>
                    <div>
                      <Label htmlFor="wPhone" className="text-xs">M-Pesa Phone Number</Label>
                      <Input
                        id="wPhone"
                        type="tel"
                        placeholder="07XX XXX XXX"
                        value={withdrawMpesaPhone}
                        onChange={(e) => setWithdrawMpesaPhone(e.target.value)}
                        className="bg-secondary border-border"
                      />
                    </div>
                    <Button
                      className="w-full"
                      onClick={handleWithdraw}
                      disabled={withdrawLoading || !withdrawAmount || !withdrawMpesaPhone}
                    >
                      {withdrawLoading ? (
                        <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Processing...</>
                      ) : (
                        <>
                          <ArrowDownLeft className="w-4 h-4 mr-2" />
                          Withdraw {withdrawAmount ? `$${parseFloat(withdrawAmount).toFixed(2)}` : ""}
                        </>
                      )}
                    </Button>
                  </>

                  {withdrawals.length > 0 && (
                    <div className="mt-3 space-y-2">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Recent Withdrawals</p>
                      {withdrawals.slice(0, 5).map((w: any) => (
                        <div key={w.id} className="flex justify-between items-center p-2.5 rounded-lg bg-secondary/50">
                          <div>
                            <p className="text-xs font-medium text-foreground">Withdrawal</p>
                            <p className="text-[10px] text-muted-foreground">
                              {new Date(w.created_at).toLocaleDateString()} •{" "}
                              <span className={
                                w.status === "completed" ? "text-primary" :
                                w.status === "approved" ? "text-[hsl(210,80%,55%)]" :
                                w.status === "rejected" ? "text-destructive" :
                                "text-[hsl(var(--warning))]"
                              }>
                                {w.status}
                              </span>
                            </p>
                          </div>
                          <p className="text-sm font-semibold text-foreground">
                            KSH {Number(w.amount_kes).toLocaleString()}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── History Tab ── */}
            <TabsContent value="history">
              <Card className="border-border bg-card">
                <CardContent className="p-4">
                  {deposits.length === 0 ? (
                    <div className="text-center py-10">
                      <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center mx-auto mb-3">
                        <History className="w-6 h-6 text-muted-foreground" />
                      </div>
                      <p className="text-sm text-muted-foreground">No transaction history yet.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {deposits.map((d) => {
                        const profit = Number(d.profit_amount || 0);
                        const secs = d.status === "completed" ? secondsUntilProfit(d.created_at) : -1;
                        return (
                          <div key={d.id} className="p-2.5 rounded-lg bg-secondary/50">
                            <div className="flex justify-between items-center">
                              <div>
                                <p className="text-xs font-medium text-foreground">Deposit</p>
                                <p className="text-[10px] text-muted-foreground">
                                  {new Date(d.created_at).toLocaleDateString()} •{" "}
                                  <span className={d.status === "completed" ? "text-primary" : "text-[hsl(var(--warning))]"}>
                                    {d.status}
                                  </span>
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="text-sm font-semibold text-foreground">
                                  KSH {Number(d.amount_kes).toLocaleString()}
                                </p>
                                {profit > 0 && (
                                  <p className="text-[11px] text-primary font-medium">
                                    +KSH {profit.toLocaleString()} profit
                                  </p>
                                )}
                                {d.status === "completed" && secs > 0 && (
                                  <p className="text-[10px] text-[hsl(var(--warning))] tabular-nums">
                                    ⏱ {formatCountdown(secs)}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </motion.div>

        {/* Info Cards */}
        <motion.div initial="hidden" animate="visible" variants={fadeIn} custom={6} className="space-y-2.5">
          <Card className="border-border bg-card hover:bg-accent/50 transition-colors">
            <CardContent className="p-3.5 flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                <Zap className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="text-xs font-semibold text-foreground">Automatic 50% Profit</p>
                <p className="text-[10px] text-muted-foreground">Credited 30 minutes after deposit confirmation</p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground ml-auto" />
            </CardContent>
          </Card>
          <Card className="border-border bg-card hover:bg-accent/50 transition-colors">
            <CardContent className="p-3.5 flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                <Shield className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="text-xs font-semibold text-foreground">Loss Protection</p>
                <p className="text-[10px] text-muted-foreground">Your deposit is refunded if a trade loses</p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground ml-auto" />
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
};

export default Dashboard;
