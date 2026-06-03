import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, TrendingUp, TrendingDown, Activity, Zap } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface PricePoint {
  t: number;
  price: number;
}

interface Trade {
  id: string;
  time: number;
  side: "BUY" | "SELL";
  ounces: number;
  entry: number;
  exit: number;
  pnl: number;
}

const OUNCE_TO_GRAM = 31.1034768;
const MAX_POINTS = 60;
const MAX_TRADES = 25;

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export default function GoldLive() {
  const [series, setSeries] = useState<PricePoint[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [sessionOpen, setSessionOpen] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const lastTradeRef = useRef(0);

  // Tick the clock for relative time labels
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Poll live gold price
  useEffect(() => {
    let cancelled = false;
    async function pull() {
      try {
        const res = await fetch("https://api.gold-api.com/price/XAU");
        if (!res.ok) return;
        const j = await res.json();
        const price = Number(j.price);
        if (cancelled || !Number.isFinite(price)) return;
        setSeries((prev) => {
          const next = [...prev, { t: Date.now(), price }];
          if (sessionOpen === null) setSessionOpen(price);
          return next.length > MAX_POINTS ? next.slice(-MAX_POINTS) : next;
        });
      } catch {
        /* ignore */
      }
    }
    pull();
    const id = setInterval(pull, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [sessionOpen]);

  // Simulate auto trades using real prices
  useEffect(() => {
    if (series.length < 2) return;
    const last = series[series.length - 1];
    const prev = series[series.length - 2];
    if (last.t === lastTradeRef.current) return;
    lastTradeRef.current = last.t;
    // ~70% chance to log a trade each tick
    if (Math.random() < 0.7) {
      const side: "BUY" | "SELL" = Math.random() < 0.55 ? "BUY" : "SELL";
      const ounces = +(0.1 + Math.random() * 1.4).toFixed(2);
      const entry = prev.price;
      const exit = last.price;
      const dir = side === "BUY" ? 1 : -1;
      const pnl = +((exit - entry) * ounces * dir).toFixed(2);
      const trade: Trade = { id: uid(), time: last.t, side, ounces, entry, exit, pnl };
      setTrades((t) => [trade, ...t].slice(0, MAX_TRADES));
    }
  }, [series]);

  const latest = series[series.length - 1];
  const sessionDelta = latest && sessionOpen ? latest.price - sessionOpen : 0;
  const sessionPct = latest && sessionOpen ? (sessionDelta / sessionOpen) * 100 : 0;
  const up = sessionDelta >= 0;

  const winRate = (() => {
    if (trades.length === 0) return 0;
    const wins = trades.filter((t) => t.pnl > 0).length;
    return Math.round((wins / trades.length) * 100);
  })();
  const totalPnl = trades.reduce((s, t) => s + t.pnl, 0);

  // ── Chart geometry ──
  const W = 800;
  const H = 220;
  const PAD = 8;
  const prices = series.map((p) => p.price);
  const min = prices.length ? Math.min(...prices) : 0;
  const max = prices.length ? Math.max(...prices) : 1;
  const range = Math.max(max - min, 0.5);
  const yMin = min - range * 0.15;
  const yMax = max + range * 0.15;

  const path = series
    .map((p, i) => {
      const x = PAD + (i / Math.max(series.length - 1, 1)) * (W - PAD * 2);
      const y = H - PAD - ((p.price - yMin) / (yMax - yMin)) * (H - PAD * 2);
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
  const area = path ? `${path} L${W - PAD},${H - PAD} L${PAD},${H - PAD} Z` : "";

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="mx-auto max-w-5xl flex items-center gap-3 px-4 py-3">
          <Link
            to="/dashboard"
            className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center hover:bg-secondary/70 transition-colors"
            aria-label="Back"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="w-9 h-9 rounded-xl bg-[hsl(45,90%,55%)]/15 border border-[hsl(45,90%,55%)]/30 flex items-center justify-center text-[hsl(45,90%,55%)] font-bold text-xs">
            Au
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-bold leading-tight truncate">Gold Live (XAU/USD)</h1>
            <p className="text-[10px] text-muted-foreground">Real-time spot price</p>
          </div>
          <Badge variant="outline" className="border-primary/40 text-primary bg-primary/10 text-[10px] font-bold tracking-wide">
            <span className="relative flex h-1.5 w-1.5 mr-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-primary" />
            </span>
            AUTO-TRADE ON
          </Badge>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-4 space-y-4">
        {/* Price + Chart */}
        <Card className="border-border bg-gradient-to-br from-card via-card to-[hsl(45,90%,55%)]/5 overflow-hidden">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Spot Gold</p>
                  <Badge variant="outline" className="border-primary/40 text-primary bg-primary/10 text-[9px] py-0">
                    <span className="w-1 h-1 rounded-full bg-primary mr-1 animate-pulse" /> LIVE
                  </Badge>
                </div>
                <p className="text-4xl sm:text-5xl font-bold tabular-nums tracking-tight">
                  {latest ? `$${latest.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
                  <span className="text-xs text-muted-foreground font-normal ml-2">/ oz</span>
                </p>
                <div className="flex items-center gap-3 mt-1 text-xs">
                  <span className={`font-semibold flex items-center gap-1 ${up ? "text-primary" : "text-destructive"}`}>
                    {up ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                    {up ? "+" : ""}
                    {sessionPct.toFixed(2)}% session
                  </span>
                  {latest && (
                    <span className="text-muted-foreground">
                      updated {new Date(latest.t).toLocaleTimeString()}
                    </span>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 text-right">
                <Stat label="P&L (USD)" value={`${totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(2)}`} tone={totalPnl >= 0 ? "up" : "down"} />
                <Stat label="Win Rate" value={`${winRate}%`} tone={winRate >= 50 ? "up" : "neutral"} />
                <Stat label="Trades" value={String(trades.length)} tone="neutral" />
              </div>
            </div>

            {/* Chart */}
            <div className="relative rounded-xl bg-background/40 border border-border/50 p-2">
              {series.length < 2 ? (
                <div className="h-[220px] flex items-center justify-center text-xs text-muted-foreground">
                  Streaming live gold prices…
                </div>
              ) : (
                <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[220px]" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="goldFill" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="hsl(45, 90%, 55%)" stopOpacity="0.45" />
                      <stop offset="100%" stopColor="hsl(45, 90%, 55%)" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path d={area} fill="url(#goldFill)" />
                  <path d={path} fill="none" stroke="hsl(45, 90%, 55%)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                  {latest && (
                    <circle
                      cx={W - PAD}
                      cy={H - PAD - ((latest.price - yMin) / (yMax - yMin)) * (H - PAD * 2)}
                      r="3.5"
                      fill="hsl(45, 90%, 55%)"
                    >
                      <animate attributeName="r" values="3.5;6;3.5" dur="1.6s" repeatCount="indefinite" />
                    </circle>
                  )}
                </svg>
              )}
              <div className="absolute top-2 left-3 text-[10px] text-muted-foreground tabular-nums">${yMax.toFixed(2)}</div>
              <div className="absolute bottom-2 left-3 text-[10px] text-muted-foreground tabular-nums">${yMin.toFixed(2)}</div>
              {series.length >= 2 && (
                <>
                  <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[10px] text-muted-foreground">
                    {new Date(series[0].t).toLocaleTimeString()}
                  </div>
                  <div className="absolute bottom-2 right-3 text-[10px] text-muted-foreground">
                    {new Date(series[series.length - 1].t).toLocaleTimeString()}
                  </div>
                </>
              )}
            </div>

            <div className="flex items-center gap-4 text-[11px] text-muted-foreground flex-wrap">
              <span>Per gram: <span className="text-foreground font-semibold">${latest ? (latest.price / OUNCE_TO_GRAM).toFixed(2) : "—"}</span></span>
              <span>Per kg: <span className="text-foreground font-semibold">${latest ? ((latest.price / OUNCE_TO_GRAM) * 1000).toLocaleString(undefined, { maximumFractionDigits: 0 }) : "—"}</span></span>
              <span className="flex items-center gap-1"><Activity className="w-3 h-3" /> Source: gold-api.com</span>
            </div>
          </CardContent>
        </Card>

        {/* Auto trades feed */}
        <Card className="border-border bg-card">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-primary" />
                <h2 className="text-sm font-bold">Auto Gold Trades</h2>
              </div>
              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-primary" />
                </span>
                Streaming
              </span>
            </div>

            <div className="grid grid-cols-[80px_60px_1fr_1fr_80px] gap-2 text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-2 pb-2 border-b border-border">
              <span>Time</span>
              <span>Side</span>
              <span>Ounces</span>
              <span>Entry</span>
              <span className="text-right">P&L</span>
            </div>

            {trades.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">Waiting for the next trade…</div>
            ) : (
              <div className="divide-y divide-border/50">
                <AnimatePresence initial={false}>
                  {trades.map((t) => (
                    <motion.div
                      key={t.id}
                      initial={{ opacity: 0, y: -6, backgroundColor: "hsl(var(--primary) / 0.08)" }}
                      animate={{ opacity: 1, y: 0, backgroundColor: "hsl(var(--primary) / 0)" }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.4 }}
                      className="grid grid-cols-[80px_60px_1fr_1fr_80px] gap-2 items-center px-2 py-2 text-xs tabular-nums"
                    >
                      <span className="text-muted-foreground">
                        {new Date(t.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                      </span>
                      <Badge
                        variant="outline"
                        className={
                          t.side === "BUY"
                            ? "border-primary/40 text-primary bg-primary/10 text-[10px] justify-center"
                            : "border-destructive/40 text-destructive bg-destructive/10 text-[10px] justify-center"
                        }
                      >
                        {t.side}
                      </Badge>
                      <span className="text-foreground font-medium">{t.ounces.toFixed(2)} oz</span>
                      <span className="text-foreground">${t.entry.toFixed(2)}</span>
                      <span className={`text-right font-bold ${t.pnl >= 0 ? "text-primary" : "text-destructive"}`}>
                        {t.pnl >= 0 ? "+" : ""}${t.pnl.toFixed(2)}
                      </span>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}

            <p className="text-[10px] text-muted-foreground mt-3 text-center">
              Trades are auto-generated by the bot using live spot prices. Updated every 5 seconds.
            </p>
          </CardContent>
        </Card>

        <p className="text-center text-[10px] text-muted-foreground pb-6">
          Last refresh {Math.max(0, Math.floor((now - (latest?.t ?? now)) / 1000))}s ago
        </p>
      </main>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: "up" | "down" | "neutral" }) {
  const color = tone === "up" ? "text-primary" : tone === "down" ? "text-destructive" : "text-foreground";
  return (
    <div>
      <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`text-sm font-bold tabular-nums ${color}`}>{value}</p>
    </div>
  );
}
