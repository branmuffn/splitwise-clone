import { NextResponse, type NextRequest } from "next/server";
import { categoryOf } from "@/lib/categories";
import { toCsv } from "@/lib/csv";
import { filterExpenses, filterPayments, parseFilters } from "@/lib/filters";
import { tryLoadGroup } from "@/lib/group-data";
import { toDecimalString } from "@/lib/money";

// Splitwise-style CSV: one row per expense or payment, plus one column per member showing how
// that row changed their balance (positive = they're owed). Honors the same filters as the page.
export async function GET(request: NextRequest, ctx: RouteContext<"/groups/[id]/export">) {
  const { id } = await ctx.params;
  const data = await tryLoadGroup(id);
  if (!data) return new NextResponse("Not found", { status: 404 });

  const filters = parseFilters(Object.fromEntries(request.nextUrl.searchParams));
  const { group, members, nameOf } = data;
  const people = [...new Set([...members.map((m) => m.id), ...data.expenses.flatMap((e) => [e.paid_by, ...e.splits.map((s) => s.user_id)])])];

  const header = ["Date", "Type", "Description", "Category", "Currency", "Amount", "Paid by", "Split", "Notes", ...people.map(nameOf)];
  const rows: (string | number | null)[][] = [];
  for (const e of filterExpenses(data.expenses, filters)) {
    const effect = people.map((uid) => {
      const share = e.splits.find((s) => s.user_id === uid)?.share_cents ?? 0;
      const net = (e.paid_by === uid ? e.amount_cents : 0) - share;
      return net ? toDecimalString(Math.abs(net), e.currency).replace(/^/, net < 0 ? "-" : "") : "0";
    });
    rows.push([e.expense_date, "Expense", e.description, categoryOf(e.category).label, e.currency, toDecimalString(e.amount_cents, e.currency), nameOf(e.paid_by), e.split_type, e.notes, ...effect]);
  }
  for (const p of filterPayments(data.payments, filters)) {
    const amt = toDecimalString(p.amount_cents, p.currency);
    const effect = people.map((uid) => (uid === p.from_user ? amt : uid === p.to_user ? `-${amt}` : "0"));
    rows.push([p.paid_on, "Payment", `${nameOf(p.from_user)} paid ${nameOf(p.to_user)}`, "Payment", p.currency, amt, nameOf(p.from_user), null, p.note, ...effect]);
  }
  rows.sort((a, b) => String(b[0]).localeCompare(String(a[0])));

  const filename = `${group.name.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") || "group"}-${new Date().toISOString().slice(0, 10)}.csv`;
  // BOM so Excel opens UTF-8 (e.g. €, ¥, accents) correctly.
  return new NextResponse("﻿" + toCsv([header, ...rows]), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
