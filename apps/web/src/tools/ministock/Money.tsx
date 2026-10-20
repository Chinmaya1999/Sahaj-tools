import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { formatInr, paiseToRupees, rupeesToPaise } from "@ek/shared";
import { Alert, Button, Card, Empty, Input, Select, Spinner } from "../../components/ui";
import { useToast } from "../../components/toast";
import { api, errMsg } from "../../lib/api";
import { fmtDate } from "../../lib/format";
import { ErrorNote, Rs, Sheet, monthStartIst, stat, todayIst, useMs, useRefreshAll } from "./common";

export function Money() {
  const [from, setFrom] = useState(monthStartIst()); const [to, setTo] = useState(todayIst());
  const f = useMs<any>(`/finance/summary?from=${from}&to=${to}`); const ex = useMs<any>(`/expenses?from=${from}&to=${to}`);
  const [add, setAdd] = useState(false); const [close, setClose] = useState(false);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3"><Input label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /><Input label="To" type="date" value={to} onChange={(e) => setTo(e.target.value)} /><Button variant="secondary" onClick={() => setClose(true)}>Close the day</Button></div>
      {f.isLoading ? <Spinner /> : f.error ? <Alert tone="bad">{errMsg(f.error)}</Alert> : (<>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {stat("Sales revenue", formatInr(f.data.salesRevenuePaise), { sub: "Before tax, after returns" })}{stat("Gross profit", formatInr(f.data.grossProfitPaise), { tone: f.data.grossProfitPaise < 0 ? "text-bad" : undefined, sub: `${f.data.marginPercent}% margin` })}
          {stat("Expenses", formatInr(f.data.expensesPaise))}{stat("Net profit (estimate)", formatInr(f.data.netProfitPaise), { tone: f.data.netProfitPaise < 0 ? "text-bad" : "text-ok", sub: "After expenses" })}
          {stat("Cash received", formatInr(f.data.cashReceivedPaise), { sub: "Confirmed only" })}{stat("Customers owe", formatInr(f.data.receivablesPaise))}{stat("You owe suppliers", formatInr(f.data.payablesPaise))}{stat("Stock value", formatInr(f.data.inventoryValuePaise), { sub: "At cost" })}
        </div>
        <details className="rounded-2xl border border-line bg-card p-4 text-sm text-ink-2"><summary className="cursor-pointer font-semibold text-ink">What each number means</summary><ul className="mt-2 list-disc space-y-1 pl-5">{Object.values(f.data.definitions).map((x: any) => <li key={x}>{x}</li>)}</ul><p className="mt-2">Sales revenue is never shown as profit. Tax collected ({formatInr(f.data.taxCollectedPaise)}) is not revenue.</p></details></>)}
      <div className="flex items-center justify-between"><h2 className="text-xl">Expenses</h2><Button onClick={() => setAdd(true)}>+ Add expense</Button></div>
      {ex.isLoading ? <Spinner /> : !ex.data?.expenses.length ? <Empty title="No expenses in this period" /> : <><ul className="space-y-1.5">{ex.data.expenses.map((e: any) => <li key={e.id}><Card className="flex items-center justify-between gap-2 p-3 text-sm"><span><b>{e.category}</b> <span className="text-ink-2">· {fmtDate(e.date)} · {e.account}{e.note ? ` · ${e.note}` : ""}</span></span><b>{formatInr(e.amountPaise)}</b></Card></li>)}</ul><p className="text-right text-sm font-semibold">Total {formatInr(ex.data.totalPaise)}</p></>}
      {add && <ExpenseForm categories={ex.data?.categories ?? []} onClose={() => setAdd(false)} />}
      {close && <CloseDay onClose={() => setClose(false)} />}
    </div>
  );
}
function ExpenseForm({ categories, onClose }: { categories: string[]; onClose: () => void }) {
  const refresh = useRefreshAll(); const [cat, setCat] = useState(categories[0] ?? "Miscellaneous"); const [custom, setCustom] = useState(""); const [amt, setAmt] = useState(""); const [date, setDate] = useState(todayIst()); const [account, setAccount] = useState("cash"); const [note, setNote] = useState("");
  const m = useMutation({ mutationFn: () => api("/ministock/expenses", { body: { category: custom.trim() || cat, amountPaise: rupeesToPaise(amt || "0"), date, account, note } }), onSuccess: () => { refresh(); onClose(); } });
  return <Sheet title="Add expense" onClose={onClose}><form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
    <Select label="Category" value={cat} onChange={(e) => setCat(e.target.value)}>{categories.map((c) => <option key={c}>{c}</option>)}</Select><Input label="Or your own category" value={custom} onChange={(e) => setCustom(e.target.value)} />
    <Rs label="Amount ₹" value={amt} onChange={setAmt} /><Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
    <Select label="Paid from" value={account} onChange={(e) => setAccount(e.target.value)}><option value="cash">Cash</option><option value="upi">UPI</option><option value="bank">Bank</option><option value="card">Card</option></Select><Input label="Note" value={note} onChange={(e) => setNote(e.target.value)} />
    <div className="sm:col-span-2"><ErrorNote error={m.error} /></div><Button type="submit" loading={m.isPending}>Save expense</Button></form></Sheet>;
}
function CloseDay({ onClose }: { onClose: () => void }) {
  const refresh = useRefreshAll(); const toast = useToast(); const [date, setDate] = useState(todayIst()); const pre = useMs<any>(`/finance/cash-close/preview?date=${date}`);
  const [opening, setOpening] = useState<string | null>(null); const [counted, setCounted] = useState(""); const [note, setNote] = useState("");
  const open = opening ?? (pre.data ? paiseToRupees(pre.data.openingPaise) : "0");
  const expected = pre.data ? rupeesToPaise(open || "0") + pre.data.cashInPaise - pre.data.cashOutPaise : 0; const diff = rupeesToPaise(counted || "0") - expected;
  const m = useMutation({ mutationFn: () => api("/ministock/finance/cash-close", { body: { date, openingPaise: rupeesToPaise(open || "0"), countedPaise: rupeesToPaise(counted || "0"), note } }), onSuccess: () => { refresh(); toast("Day closed", "ok"); onClose(); } });
  return <Sheet title="Close the day (cash)" onClose={onClose}>{pre.isLoading ? <Spinner /> : <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
    <Input label="Date" type="date" value={date} onChange={(e) => { setDate(e.target.value); setOpening(null); }} /><Rs label="Opening cash ₹" value={open} onChange={setOpening} />
    <div className="rounded-xl bg-paper-2/60 p-3 text-sm"><div className="flex justify-between"><span>Cash sales and receipts</span><span>+{formatInr(pre.data.cashInPaise)}</span></div><div className="flex justify-between"><span>Cash refunds and expenses</span><span>−{formatInr(pre.data.cashOutPaise)}</span></div><div className="mt-1 flex justify-between border-t border-line pt-1 font-bold"><span>Expected in the drawer</span><span>{formatInr(expected)}</span></div></div>
    <Rs label="Cash actually counted ₹" value={counted} onChange={setCounted} />{counted !== "" && <p className={`text-sm font-semibold ${diff === 0 ? "text-ok" : "text-warn"}`}>{diff === 0 ? "Matches exactly." : `${diff > 0 ? "Over" : "Short"} by ${formatInr(Math.abs(diff))}. Add a note to explain.`}</p>}
    <Input label="Note / explanation" value={note} onChange={(e) => setNote(e.target.value)} /><p className="text-xs text-ink-2">{pre.data.note}</p><ErrorNote error={m.error} /><Button type="submit" loading={m.isPending} disabled={counted === ""}>Close the day</Button></form>}</Sheet>;
}
