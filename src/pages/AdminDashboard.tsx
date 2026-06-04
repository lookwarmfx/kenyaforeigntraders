import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Users, DollarSign, TrendingUp, Clock, Search,
  LogOut, Shield, Loader2, Edit, Activity,
  UserCheck, CreditCard, ArrowUpRight, ArrowDownLeft,
  Check, X, CheckCircle2, Phone, Wallet, Trash2,
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { motion } from "framer-motion";

const fadeIn = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.06, duration: 0.35 },
  }),
};

interface Profile {
  user_id: string;
  display_name: string | null;
  email: string | null;
  phone: string | null;
  created_at: string;
}

interface Deposit {
  id: string;
  user_id: string;
  amount_usd: number;
  amount_kes: number;
  status: string;
  profit_amount: number;
  created_at: string;
  pesapal_merchant_reference: string;
  payment_method: string | null;
}

interface EditingDeposit extends Deposit {
  editAmountKes: string;
  editStatus: string;
}

interface Withdrawal {
  id: string;
  user_id: string;
  amount_usd: number;
  amount_kes: number;
  phone_number: string | null;
  mpesa_phone: string | null;
  paypal_email: string | null;
  paypal_payout_batch_id: string | null;
  status: string;
  admin_notes: string | null;
  created_at: string;
}

const AdminDashboard = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [editingDeposit, setEditingDeposit] = useState<Deposit | null>(null);
  const [profitValue, setProfitValue] = useState("");
  const [editAmountValue, setEditAmountValue] = useState("");
  const [editStatusValue, setEditStatusValue] = useState("");
  const [processingWithdrawal, setProcessingWithdrawal] = useState<string | null>(null);
  const [completingWithdrawal, setCompletingWithdrawal] = useState<string | null>(null);
  const [adminNotes, setAdminNotes] = useState("");
  const [rejectingWithdrawal, setRejectingWithdrawal] = useState<Withdrawal | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [adjustingUserId, setAdjustingUserId] = useState<string | null>(null);
  const [newBalanceValue, setNewBalanceValue] = useState("");
  const [savingBalance, setSavingBalance] = useState(false);

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate("/login"); return; }

      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", session.user.id)
        .eq("role", "admin");

      if (!roles || roles.length === 0) {
        toast.error("Access denied. Admin only.");
        navigate("/dashboard");
        return;
      }

      setIsAdmin(true);

      const [profilesRes, depositsRes, withdrawalsRes] = await Promise.all([
        supabase.from("profiles").select("*").order("created_at", { ascending: false }),
        supabase.from("deposits").select("*").order("created_at", { ascending: false }),
        supabase.from("withdrawals").select("*").order("created_at", { ascending: false }),
      ]);

      if (profilesRes.data) setProfiles(profilesRes.data);
      if (depositsRes.data) setDeposits(depositsRes.data as Deposit[]);
      if (withdrawalsRes.data) setWithdrawals(withdrawalsRes.data as Withdrawal[]);
      setLoading(false);
    };
    init();
  }, [navigate]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  const handleSaveProfit = async () => {
    if (!editingDeposit) return;
    const profit = parseFloat(profitValue);
    if (isNaN(profit)) { toast.error("Enter a valid profit number"); return; }

    const amountKes = parseFloat(editAmountValue);
    if (isNaN(amountKes) || amountKes <= 0) { toast.error("Enter a valid deposit amount"); return; }
    const amountUsd = amountKes / 150;

    const { error } = await supabase
      .from("deposits")
      .update({ profit_amount: profit, amount_kes: amountKes, amount_usd: amountUsd, status: editStatusValue })
      .eq("id", editingDeposit.id);

    if (error) {
      toast.error("Failed to update deposit");
    } else {
      setDeposits((prev) =>
        prev.map((d) => d.id === editingDeposit.id
          ? { ...d, profit_amount: profit, amount_kes: amountKes, amount_usd: amountUsd, status: editStatusValue }
          : d)
      );
      toast.success("Deposit updated successfully");
      setEditingDeposit(null);
    }
  };

  const handleMarkCompleted = async (withdrawalId: string, _amountKes: number, _userId: string) => {
    setCompletingWithdrawal(withdrawalId);
    try {
      const { error: wError } = await supabase
        .from("withdrawals")
        .update({ status: "completed" })
        .eq("id", withdrawalId);
      if (wError) throw wError;

      // Note: balance calculation already subtracts approved/completed withdrawals,
      // so we do NOT touch deposits here (that would double-deduct).

      setWithdrawals((prev) =>
        prev.map((w) => w.id === withdrawalId ? { ...w, status: "completed" } : w)
      );
      toast.success("Withdrawal marked as completed.");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to complete withdrawal");
    } finally {
      setCompletingWithdrawal(null);
    }
  };

  const handleWithdrawalAction = async (withdrawalId: string, action: "approve" | "reject", reasonOverride?: string) => {
    setProcessingWithdrawal(withdrawalId);
    try {
      if (action === "reject") {
        const reason = (reasonOverride ?? "").trim();
        if (!reason) {
          toast.error("Please provide a reason for rejection");
          return;
        }
        const { error } = await supabase
          .from("withdrawals")
          .update({ status: "rejected", admin_notes: reason })
          .eq("id", withdrawalId);
        if (error) throw error;
        setWithdrawals((prev) =>
          prev.map((w) => w.id === withdrawalId ? { ...w, status: "rejected", admin_notes: reason } : w)
        );
        toast.success("Withdrawal rejected");
        setRejectingWithdrawal(null);
        setRejectReason("");
      } else {
        // Approve = mark for manual M-Pesa send-money by admin
        const { error } = await supabase
          .from("withdrawals")
          .update({ status: "approved", admin_notes: adminNotes || null })
          .eq("id", withdrawalId);
        if (error) throw error;
        setWithdrawals((prev) =>
          prev.map((w) => w.id === withdrawalId
            ? { ...w, status: "approved", admin_notes: adminNotes || w.admin_notes }
            : w)
        );
        toast.success("Approved. Send the M-Pesa payment manually, then mark completed.");
      }
      setAdminNotes("");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to process withdrawal");
    } finally {
      setProcessingWithdrawal(null);
    }
  };

  const filteredProfiles = profiles.filter((p) => {
    const q = searchQuery.toLowerCase();
    return (
      (p.display_name?.toLowerCase().includes(q) ?? false) ||
      (p.email?.toLowerCase().includes(q) ?? false) ||
      (p.phone?.toLowerCase().includes(q) ?? false)
    );
  });

  const totalDepositsKes = deposits
    .filter((d) => d.status === "completed")
    .reduce((sum, d) => sum + Number(d.amount_kes), 0);

  const totalProfit = deposits.reduce((sum, d) => sum + Number(d.profit_amount || 0), 0);
  const pendingCount = deposits.filter((d) => d.status === "pending").length;
  const completedCount = deposits.filter((d) => d.status === "completed").length;

  const getEmailForUser = (userId: string) => {
    const p = profiles.find((pr) => pr.user_id === userId);
    return p?.email || p?.display_name || userId.slice(0, 8);
  };

  const getNameForUser = (userId: string) => {
    const p = profiles.find((pr) => pr.user_id === userId);
    return p?.display_name || p?.email?.split("@")[0] || "Unknown";
  };

  const getPhoneForUser = (userId: string) => {
    const p = profiles.find((pr) => pr.user_id === userId);
    return p?.phone || "No phone";
  };

  const getBalanceUsdForUser = (userId: string) => {
    const credits = deposits
      .filter((d) => d.user_id === userId && d.status === "completed")
      .reduce((sum, d) => sum + Number(d.amount_usd) + Number(d.profit_amount || 0), 0);
    const debits = withdrawals
      .filter((w) => w.user_id === userId && ["approved", "completed", "processing"].includes(w.status))
      .reduce((sum, w) => sum + Number(w.amount_usd), 0);
    return credits - debits;
  };

  const handleSaveBalance = async () => {
    if (!adjustingUserId) return;
    const targetKes = parseFloat(newBalanceValue);
    if (isNaN(targetKes)) { toast.error("Enter a valid KES amount"); return; }
    const targetUsd = targetKes / 150;
    const currentUsd = getBalanceUsdForUser(adjustingUserId);
    const deltaUsd = targetUsd - currentUsd;
    const deltaKes = targetKes - currentUsd * 150;
    if (Math.abs(deltaUsd) < 0.01) { toast.info("Balance unchanged"); setAdjustingUserId(null); return; }

    setSavingBalance(true);
    try {
      const { data, error } = await supabase
        .from("deposits")
        .insert({
          user_id: adjustingUserId,
          amount_usd: deltaUsd,
          amount_kes: deltaKes,
          status: "completed",
          profit_amount: 0,
          profit_applied: true,
          payment_method: "admin_adjustment",
        })
        .select()
        .single();
      if (error) throw error;
      setDeposits((prev) => [data as Deposit, ...prev]);
      toast.success(`Balance set to KSH ${targetKes.toLocaleString()}`);
      setAdjustingUserId(null);
      setNewBalanceValue("");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to adjust balance");
    } finally {
      setSavingBalance(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin) return null;

  const statCards = [
    { label: "Total Users", value: profiles.length.toString(), icon: Users, accent: "bg-[hsl(210,80%,55%)]" },
    { label: "Total Deposits", value: `KSH ${totalDepositsKes.toLocaleString()}`, icon: DollarSign, accent: "bg-primary" },
    { label: "Total Profit", value: `KSH ${totalProfit.toLocaleString()}`, icon: TrendingUp, accent: "bg-[hsl(280,70%,55%)]" },
    { label: "Pending", value: pendingCount.toString(), icon: Clock, accent: "bg-[hsl(var(--warning))]" },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Admin Header - distinct from user dashboard */}
      <nav className="sticky top-0 z-50 border-b border-border bg-card/95 backdrop-blur">
        <div className="flex items-center justify-between py-3 px-4 max-w-5xl mx-auto">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-[hsl(280,70%,55%)] rounded-xl flex items-center justify-center shadow-lg">
              <Shield className="w-4.5 h-4.5 text-primary-foreground" />
            </div>
            <div>
              <span className="text-sm font-bold text-foreground block leading-tight">Admin Panel</span>
              <span className="text-[10px] text-muted-foreground">Kenya Smart Trades</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs border-border"
              onClick={() => navigate("/dashboard")}
            >
              User View
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleLogout}>
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-4 py-5 pb-12">
        {/* Platform Overview Banner */}
        <motion.div initial="hidden" animate="visible" variants={fadeIn} custom={0} className="mb-5">
          <div className="rounded-xl bg-gradient-to-r from-[hsl(280,70%,20%)] to-[hsl(210,80%,20%)] border border-border p-4">
            <div className="flex items-center gap-2 mb-1">
              <Activity className="w-4 h-4 text-[hsl(280,70%,65%)]" />
              <span className="text-xs font-semibold text-[hsl(280,70%,75%)] uppercase tracking-wider">Platform Overview</span>
            </div>
            <p className="text-lg font-bold text-foreground">
              {profiles.length} users • {completedCount} completed trades
            </p>
          </div>
        </motion.div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3 mb-5">
          {statCards.map((stat, i) => (
            <motion.div key={stat.label} initial="hidden" animate="visible" variants={fadeIn} custom={i + 1}>
              <Card className="border-border bg-card overflow-hidden">
                <CardContent className="p-3.5 relative">
                  <div className={`absolute top-0 left-0 w-1 h-full ${stat.accent}`} />
                  <div className="pl-2">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                        {stat.label}
                      </span>
                      <div className={`w-6 h-6 rounded-lg ${stat.accent}/15 flex items-center justify-center`}>
                        <stat.icon className="w-3 h-3 text-foreground" />
                      </div>
                    </div>
                    <p className="text-lg font-bold text-foreground">{stat.value}</p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Tabs */}
        <Tabs defaultValue="users" className="space-y-4">
          <TabsList className="w-full grid grid-cols-4 bg-card border border-border h-11 rounded-xl p-1">
            <TabsTrigger value="users" className="rounded-lg text-xs font-semibold data-[state=active]:bg-[hsl(280,70%,55%)] data-[state=active]:text-primary-foreground">
              <Users className="w-3.5 h-3.5 mr-1.5" /> Users
            </TabsTrigger>
            <TabsTrigger value="deposits" className="rounded-lg text-xs font-semibold data-[state=active]:bg-[hsl(280,70%,55%)] data-[state=active]:text-primary-foreground">
              <CreditCard className="w-3.5 h-3.5 mr-1.5" /> Deposits
            </TabsTrigger>
            <TabsTrigger value="withdrawals" className="rounded-lg text-xs font-semibold data-[state=active]:bg-[hsl(280,70%,55%)] data-[state=active]:text-primary-foreground">
              <ArrowDownLeft className="w-3.5 h-3.5 mr-1.5" /> Withdrawals
            </TabsTrigger>
            <TabsTrigger value="recent" className="rounded-lg text-xs font-semibold data-[state=active]:bg-[hsl(280,70%,55%)] data-[state=active]:text-primary-foreground">
              <Activity className="w-3.5 h-3.5 mr-1.5" /> Activity
            </TabsTrigger>
          </TabsList>

          {/* Users Tab - Mobile-optimized card layout */}
          <TabsContent value="users">
            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search users..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 bg-card border-border h-10"
                />
              </div>

              {filteredProfiles.length === 0 ? (
                <Card className="border-border bg-card">
                  <CardContent className="p-8 text-center">
                    <Users className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">No users found</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2">
                  {filteredProfiles.map((p, i) => (
                    <motion.div key={p.user_id} initial="hidden" animate="visible" variants={fadeIn} custom={i * 0.5}>
                      <Card className="border-border bg-card">
                        <CardContent className="p-3.5">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-[hsl(210,80%,55%)]/15 flex items-center justify-center shrink-0">
                              <UserCheck className="w-4 h-4 text-[hsl(210,80%,55%)]" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-foreground truncate">
                                {p.display_name || "No Name"}
                              </p>
                              <p className="text-[11px] text-muted-foreground truncate">{p.email || "—"}</p>
                              <div className="flex items-center gap-1 mt-0.5">
                                <Phone className="w-3 h-3 text-primary shrink-0" />
                                <p className="text-[11px] font-medium text-primary">{p.phone || "No phone"}</p>
                              </div>
                            </div>
                            <div className="text-right shrink-0 flex flex-col items-end gap-1">
                              <div>
                                <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Balance</p>
                                <p className="text-sm font-bold text-primary">KSH {(getBalanceUsdForUser(p.user_id) * 150).toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                              </div>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-6 px-2 text-[10px] border-[hsl(280,70%,55%)] text-[hsl(280,70%,65%)] hover:bg-[hsl(280,70%,55%)] hover:text-primary-foreground"
                                onClick={() => {
                                  setAdjustingUserId(p.user_id);
                                  setNewBalanceValue((getBalanceUsdForUser(p.user_id) * 150).toFixed(0));
                                }}
                              >
                                <Wallet className="w-3 h-3 mr-1" /> Edit
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))}
                </div>
              )}
              <p className="text-[10px] text-muted-foreground text-center">
                {filteredProfiles.length} of {profiles.length} users
              </p>
            </div>
          </TabsContent>

          {/* Deposits Tab - Mobile card layout */}
          <TabsContent value="deposits">
            <div className="space-y-2">
              {deposits.length === 0 ? (
                <Card className="border-border bg-card">
                  <CardContent className="p-8 text-center">
                    <CreditCard className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">No deposits yet</p>
                  </CardContent>
                </Card>
              ) : (
                deposits.map((d, i) => (
                  <motion.div key={d.id} initial="hidden" animate="visible" variants={fadeIn} custom={i * 0.3}>
                    <Card className="border-border bg-card">
                      <CardContent className="p-3.5">
                        <div className="flex items-start justify-between mb-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-foreground truncate">
                              {getNameForUser(d.user_id)}
                            </p>
                            <p className="text-[10px] text-muted-foreground truncate">
                              {getEmailForUser(d.user_id)}
                            </p>
                            <div className="flex items-center gap-1 mt-0.5">
                              <Phone className="w-3 h-3 text-primary shrink-0" />
                              <p className="text-[10px] font-medium text-primary">{getPhoneForUser(d.user_id)}</p>
                            </div>
                          </div>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0 ml-2 ${
                            d.status === "completed"
                              ? "bg-primary/15 text-primary"
                              : d.status === "pending"
                              ? "bg-[hsl(var(--warning))]/15 text-[hsl(var(--warning))]"
                              : "bg-destructive/15 text-destructive"
                          }`}>
                            {d.status}
                          </span>
                        </div>
                        <div className="flex items-end justify-between">
                          <div className="flex gap-4">
                            <div>
                              <p className="text-[10px] text-muted-foreground uppercase">Amount</p>
                              <p className="text-sm font-bold text-foreground">
                                KSH {Number(d.amount_kes).toLocaleString()}
                              </p>
                            </div>
                            <div>
                              <p className="text-[10px] text-muted-foreground uppercase">Profit</p>
                              <p className="text-sm font-bold text-primary">
                                KSH {Number(d.profit_amount || 0).toLocaleString()}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-muted-foreground">
                              {new Date(d.created_at).toLocaleDateString()}
                            </span>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 px-2.5 text-[10px] border-border"
                              onClick={() => {
                                setEditingDeposit(d);
                                setProfitValue(String(d.profit_amount || 0));
                                setEditAmountValue(String(d.amount_kes));
                                setEditStatusValue(d.status);
                              }}
                            >
                              <Edit className="w-3 h-3 mr-1" /> Edit
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))
              )}
            </div>
          </TabsContent>

          {/* Withdrawals Tab */}
          <TabsContent value="withdrawals">
            <div className="space-y-2">
              {withdrawals.length === 0 ? (
                <Card className="border-border bg-card">
                  <CardContent className="p-8 text-center">
                    <ArrowDownLeft className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">No withdrawal requests yet</p>
                  </CardContent>
                </Card>
              ) : (
                withdrawals.map((w, i) => (
                  <motion.div key={w.id} initial="hidden" animate="visible" variants={fadeIn} custom={i * 0.3}>
                    <Card className={`border-border bg-card ${w.status === "pending" ? "ring-1 ring-[hsl(var(--warning))]/30" : ""}`}>
                      <CardContent className="p-3.5">
                        <div className="flex items-start justify-between mb-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-foreground truncate">
                              {getNameForUser(w.user_id)}
                            </p>
                            <p className="text-[10px] text-muted-foreground truncate">
                              {getEmailForUser(w.user_id)} • {w.mpesa_phone || w.paypal_email || w.phone_number || "—"}
                            </p>
                          </div>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0 ml-2 ${
                            w.status === "completed" || w.status === "approved"
                              ? "bg-primary/15 text-primary"
                              : w.status === "pending"
                              ? "bg-[hsl(var(--warning))]/15 text-[hsl(var(--warning))]"
                              : "bg-destructive/15 text-destructive"
                          }`}>
                            {w.status}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-end justify-between gap-3">
                          <div>
                            <p className="text-[10px] text-muted-foreground uppercase">Amount</p>
                            <p className="text-sm font-bold text-foreground">
                              ${Number(w.amount_usd).toFixed(2)} <span className="text-[10px] text-muted-foreground font-normal">(KSH {Number(w.amount_kes).toLocaleString()})</span>
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                              {new Date(w.created_at).toLocaleDateString()}
                            </p>
                          </div>
                          {w.status === "pending" && (
                            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
                              <Input
                                placeholder="Notes (optional)"
                                value={processingWithdrawal === w.id ? adminNotes : ""}
                                onChange={(e) => { setProcessingWithdrawal(w.id); setAdminNotes(e.target.value); }}
                                className="bg-secondary border-border h-7 text-[10px] w-full sm:w-28"
                              />
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 px-2 text-[10px] flex-1 sm:flex-none border-primary text-primary hover:bg-primary hover:text-primary-foreground"
                                onClick={() => handleWithdrawalAction(w.id, "approve")}
                                disabled={processingWithdrawal === w.id}
                              >
                                {processingWithdrawal === w.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Check className="w-3 h-3 mr-1" /> Send Payout</>}
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 px-2 text-[10px] flex-1 sm:flex-none border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
                                onClick={() => { setRejectingWithdrawal(w); setRejectReason(""); }}
                                disabled={processingWithdrawal === w.id}
                              >
                                <X className="w-3 h-3 mr-1" /> Reject
                              </Button>
                            </div>
                          )}
                          {(w.status === "approved" || w.status === "processing") && (
                            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 px-2.5 text-[10px] flex-1 sm:flex-none border-primary text-primary hover:bg-primary hover:text-primary-foreground"
                                onClick={() => handleMarkCompleted(w.id, Number(w.amount_kes), w.user_id)}
                                disabled={completingWithdrawal === w.id || processingWithdrawal === w.id}
                              >
                                {completingWithdrawal === w.id
                                  ? <Loader2 className="w-3 h-3 animate-spin" />
                                  : <><CheckCircle2 className="w-3 h-3 mr-1" /> Mark Completed</>
                                }
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 px-2 text-[10px] flex-1 sm:flex-none border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
                                onClick={() => { setRejectingWithdrawal(w); setRejectReason(""); }}
                                disabled={completingWithdrawal === w.id || processingWithdrawal === w.id}
                              >
                                <X className="w-3 h-3 mr-1" /> Reject
                              </Button>
                            </div>
                          )}
                        </div>

                        {w.admin_notes && (
                          <p className="text-[10px] text-muted-foreground mt-2 italic">Note: {w.admin_notes}</p>
                        )}
                      </CardContent>
                    </Card>
                  </motion.div>
                ))
              )}
            </div>
          </TabsContent>

          {/* Activity Tab */}
          <TabsContent value="recent">
            <Card className="border-border bg-card">
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center gap-2 mb-2">
                  <Activity className="w-4 h-4 text-[hsl(280,70%,55%)]" />
                  <h3 className="text-sm font-bold text-foreground">Recent Activity</h3>
                </div>
                {deposits.slice(0, 15).map((d) => (
                  <div key={d.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-secondary/50">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                      d.status === "completed" ? "bg-primary/15" : "bg-[hsl(var(--warning))]/15"
                    }`}>
                      <ArrowUpRight className={`w-3.5 h-3.5 ${
                        d.status === "completed" ? "text-primary" : "text-[hsl(var(--warning))]"
                      }`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">
                        {getNameForUser(d.user_id)}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {new Date(d.created_at).toLocaleDateString()} •{" "}
                        <span className={d.status === "completed" ? "text-primary" : "text-[hsl(var(--warning))]"}>
                          {d.status}
                        </span>
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold text-foreground">
                        KSH {Number(d.amount_kes).toLocaleString()}
                      </p>
                      {Number(d.profit_amount) > 0 && (
                        <p className="text-[10px] text-primary font-medium">
                          +KSH {Number(d.profit_amount).toLocaleString()}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
                {deposits.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-8">No activity yet</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Edit Deposit Dialog */}
      <Dialog open={!!editingDeposit} onOpenChange={(open) => !open && setEditingDeposit(null)}>
        <DialogContent className="bg-card border-border max-w-[calc(100%-2rem)] sm:max-w-sm rounded-xl">
          <DialogHeader>
            <DialogTitle className="text-foreground">Edit Deposit</DialogTitle>
          </DialogHeader>
          {editingDeposit && (
            <div className="space-y-3">
              <div className="bg-secondary/50 rounded-lg p-3">
                <p className="text-xs text-muted-foreground">User</p>
                <p className="text-sm font-medium text-foreground">{getNameForUser(editingDeposit.user_id)}</p>
              </div>
              <div>
                <Label htmlFor="editAmount" className="text-xs">Deposit Amount (KES)</Label>
                <Input
                  id="editAmount"
                  type="number"
                  value={editAmountValue}
                  onChange={(e) => setEditAmountValue(e.target.value)}
                  className="bg-secondary border-border mt-1"
                  placeholder="Enter deposit amount in KES"
                />
              </div>
              <div>
                <Label htmlFor="editStatus" className="text-xs">Status</Label>
                <select
                  id="editStatus"
                  value={editStatusValue}
                  onChange={(e) => setEditStatusValue(e.target.value)}
                  className="w-full mt-1 h-10 rounded-md border border-border bg-secondary px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="pending">pending</option>
                  <option value="completed">completed</option>
                  <option value="failed">failed</option>
                </select>
              </div>
              <div>
                <Label htmlFor="profit" className="text-xs">Profit Amount (KES)</Label>
                <Input
                  id="profit"
                  type="number"
                  value={profitValue}
                  onChange={(e) => setProfitValue(e.target.value)}
                  className="bg-secondary border-border mt-1"
                  placeholder="Enter profit in KES"
                />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setEditingDeposit(null)} className="border-border">
              Cancel
            </Button>
            <Button onClick={handleSaveProfit} className="bg-[hsl(280,70%,55%)] hover:bg-[hsl(280,70%,45%)]">
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Adjust User Balance Dialog */}
      <Dialog open={!!adjustingUserId} onOpenChange={(open) => { if (!open) { setAdjustingUserId(null); setNewBalanceValue(""); } }}>
        <DialogContent className="bg-card border-border max-w-[calc(100%-2rem)] sm:max-w-sm rounded-xl">
          <DialogHeader>
            <DialogTitle className="text-foreground">Edit User Balance</DialogTitle>
          </DialogHeader>
          {adjustingUserId && (
            <div className="space-y-3">
              <div className="bg-secondary/50 rounded-lg p-3">
                <p className="text-xs text-muted-foreground">User</p>
                <p className="text-sm font-medium text-foreground">{getNameForUser(adjustingUserId)}</p>
                <p className="text-[10px] text-muted-foreground mt-1">
                  Current balance: <span className="text-primary font-semibold">KSH {(getBalanceUsdForUser(adjustingUserId) * 150).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                </p>
              </div>
              <div>
                <Label htmlFor="newBalance" className="text-xs">New Balance (KES)</Label>
                <Input
                  id="newBalance"
                  type="number"
                  step="1"
                  value={newBalanceValue}
                  onChange={(e) => setNewBalanceValue(e.target.value)}
                  className="bg-secondary border-border mt-1"
                  placeholder="e.g. 22500"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  Recorded as an admin balance adjustment (principal, not profit).
                </p>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setAdjustingUserId(null)} className="border-border">Cancel</Button>
            <Button onClick={handleSaveBalance} disabled={savingBalance} className="bg-[hsl(280,70%,55%)] hover:bg-[hsl(280,70%,45%)]">
              {savingBalance ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Balance"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Withdrawal Dialog */}
      <Dialog open={!!rejectingWithdrawal} onOpenChange={(open) => { if (!open) { setRejectingWithdrawal(null); setRejectReason(""); } }}>
        <DialogContent className="bg-card border-border max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground">Reject Withdrawal</DialogTitle>
          </DialogHeader>
          {rejectingWithdrawal && (
            <div className="space-y-3">
              <div className="rounded-lg bg-secondary/50 p-3 text-xs">
                <p className="text-foreground font-semibold">{getNameForUser(rejectingWithdrawal.user_id)}</p>
                <p className="text-muted-foreground">
                  ${Number(rejectingWithdrawal.amount_usd).toFixed(2)} • KSH {Number(rejectingWithdrawal.amount_kes).toLocaleString()}
                </p>
              </div>
              <div>
                <Label htmlFor="rejectReason" className="text-xs">Reason for rejection <span className="text-destructive">*</span></Label>
                <Textarea
                  id="rejectReason"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="e.g. Insufficient balance, invalid phone number, suspicious activity..."
                  className="bg-secondary border-border mt-1 min-h-[100px]"
                  maxLength={500}
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  This reason will be saved and visible to the user.
                </p>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => { setRejectingWithdrawal(null); setRejectReason(""); }} className="border-border">Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => rejectingWithdrawal && handleWithdrawalAction(rejectingWithdrawal.id, "reject", rejectReason)}
              disabled={!rejectReason.trim() || processingWithdrawal === rejectingWithdrawal?.id}
            >
              {processingWithdrawal === rejectingWithdrawal?.id ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirm Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminDashboard;
