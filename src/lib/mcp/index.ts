import { auth, defineMcp } from "@lovable.dev/mcp-js";
import getBalance from "./tools/get-balance";
import listDeposits from "./tools/list-deposits";
import listWithdrawals from "./tools/list-withdrawals";
import getGoldPrice from "./tools/get-gold-price";
import requestWithdrawal from "./tools/request-withdrawal";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "kenya-smart-trades-mcp",
  title: "Kenya Smart Trades",
  version: "0.1.0",
  instructions:
    "Tools for the Kenya Smart Trades trading app. Callers act as the signed-in user. Use `get_balance`, `list_deposits`, and `list_withdrawals` to inspect the account, `get_gold_price` for the live XAU/USD spot price, and `request_withdrawal` to submit an M-Pesa payout request.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [getBalance, listDeposits, listWithdrawals, getGoldPrice, requestWithdrawal],
});
