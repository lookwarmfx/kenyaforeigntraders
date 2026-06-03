import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, Activity } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface GoldPrice {
  price: number;
  updatedAt: string;
}

const OUNCE_TO_GRAM = 31.1034768;

export const GoldTicker = () => {
  const [data, setData] = useState<GoldPrice | null>(null);
  const [prev, setPrev] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const lastPriceRef = useRef<number | null>(null);

  const fetchPrice = async () => {
    try {
      const res = await fetch("https://api.gold-api.com/price/XAU");
      if (!res.ok) throw new Error("bad");
      const json = await res.json();
      const price = Number(json.price);
      if (lastPriceRef.current !== null) setPrev(lastPriceRef.current);
      lastPriceRef.current = price;
      setData({ price, updatedAt: json.updatedAt });
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPrice();
    const id = setInterval(fetchPrice, 15000);
    return () => clearInterval(id);
  }, []);

  const delta = data && prev !== null ? data.price - prev : 0;
  const up = delta >= 0;
  const pct = data && prev ? (delta / prev) * 100 : 0;

  return (
    <Card className="border-border bg-gradient-to-br from-card via-card to-secondary/30 overflow-hidden relative">
      <div className="absolute top-0 right-0 w-32 h-32 bg-[hsl(45,90%,55%)]/10 rounded-full blur-3xl pointer-events-none" />
      <CardContent className="p-4 relative">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-[hsl(45,90%,55%)]/20 flex items-center justify-center">
              <span className="text-sm">🥇</span>
            </div>
            <div>
              <p className="text-xs font-bold text-foreground">Gold (XAU/USD)</p>
              <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-primary" />
                </span>
                LIVE • Updates every 15s
              </p>
            </div>
          </div>
          <Activity className="w-4 h-4 text-muted-foreground" />
        </div>

        {loading ? (
          <div className="h-12 flex items-center text-xs text-muted-foreground">Loading live price…</div>
        ) : error ? (
          <div className="h-12 flex items-center text-xs text-destructive">Unable to load live price</div>
        ) : data ? (
          <motion.div
            key={data.price}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-1"
          >
            <div className="flex items-baseline gap-2 flex-wrap">
              <p className="text-2xl font-bold text-foreground tabular-nums">
                ${data.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <span className="text-[10px] text-muted-foreground">/ oz</span>
              {prev !== null && (
                <span
                  className={`text-xs font-semibold flex items-center gap-0.5 ${
                    up ? "text-primary" : "text-destructive"
                  }`}
                >
                  {up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  {up ? "+" : ""}
                  {delta.toFixed(2)} ({pct.toFixed(3)}%)
                </span>
              )}
            </div>
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span>
                Per gram: <span className="text-foreground font-medium tabular-nums">
                  ${(data.price / OUNCE_TO_GRAM).toFixed(2)}
                </span>
              </span>
              <span>
                {new Date(data.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </span>
            </div>
          </motion.div>
        ) : null}
      </CardContent>
    </Card>
  );
};

export default GoldTicker;
