## Problem

The Reject button exists in the code, but on the admin withdrawals card it's the last item in a single horizontal row (`flex items-end justify-between` → amount on the left, then a row containing a Notes input + Approve + Reject). On the current viewport (and any narrow screen), that row overflows the card and the Reject button gets pushed off the right edge, so it's invisible.

## Fix

Restructure the pending-withdrawal action area in `src/pages/AdminDashboard.tsx` (lines ~585–622):

1. Stack the amount block above the action block on narrow widths instead of side-by-side — change the outer `flex items-end justify-between` to wrap (`flex-wrap gap-3`), and let the action group take full width on mobile.
2. Inside the action group, allow buttons to wrap (`flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end`), and widen the Notes input or move it onto its own line so Approve + Reject always fit.
3. Make the two action buttons share the row equally on mobile (`flex-1 sm:flex-none`) so both are always visible and tappable.

No business-logic, state, or dialog changes — the reject dialog itself is already wired up correctly.

## Verification

- On `/admin` Withdrawals tab at 871px viewport: pending rows show both **Send Payout** and **Reject** buttons without horizontal clipping.
- Clicking Reject opens the existing rejection dialog.