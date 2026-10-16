import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/action-button";
import { LiveRefresh } from "@/components/live-refresh";
import { LocalTime } from "@/components/local-time";
import { PageShell } from "@/components/page-shell";
import { Avatar, BackLink, ButtonLink, Card, FormMessage, SectionTitle, formatDate } from "@/components/ui";
import { categoryOf } from "@/lib/categories";
import { loadGroup } from "@/lib/group-data";
import { formatMoney } from "@/lib/money";
import { SPLIT_TYPES } from "@/lib/splits";
import { createClient } from "@/lib/supabase/server";
import { addComment, deleteComment, deleteExpense, stopRepeating } from "../../../expense-actions";
import { CommentForm } from "../../../comment-form";
import { REPEAT_OPTIONS } from "@/lib/recurring";

export default function ExpensePage({ params, searchParams }: PageProps<"/groups/[id]/expenses/[expenseId]">) {
  return (
    <PageShell>
      <ExpenseDetail params={params} searchParams={searchParams} />
    </PageShell>
  );
}

type Details = { items?: { name: string; price_cents: number; user_ids: string[] }[]; tax_cents?: number; tip_cents?: number };

async function ExpenseDetail({ params, searchParams }: Pick<PageProps<"/groups/[id]/expenses/[expenseId]">, "params" | "searchParams">) {
  const { id, expenseId } = await params;
  const sp = await searchParams;
  const { group, expenses, youOr, user } = await loadGroup(id);
  const e = expenses.find((x) => x.id === expenseId);
  if (!e) notFound();
  const cat = categoryOf(e.category);

  const supabase = await createClient();
  const [{ data: comments }, receiptUrl] = await Promise.all([
    supabase.from("expense_comments").select("*").eq("expense_id", e.id).order("created_at"),
    e.receipt_path
      ? supabase.storage.from("receipts").createSignedUrl(e.receipt_path, 600).then((r) => r.data?.signedUrl ?? null)
      : Promise.resolve(null),
  ]);
  const isPdf = e.receipt_path?.endsWith(".pdf");
  const details = (e.split_details ?? {}) as Details;
  const source = e.recurring_source_id ? expenses.find((x) => x.id === e.recurring_source_id) : null;
  const repeatLabel = REPEAT_OPTIONS.find((o) => o.value === e.repeat_interval)?.label.toLowerCase();

  return (
    <>
      <div className="flex items-center justify-between">
        <BackLink href={`/groups/${id}`}>{group.name}</BackLink>
        <LiveRefresh groupId={id} />
      </div>
      {sp.receipt === "failed" && <FormMessage state={{ error: "The expense was saved, but the receipt couldn't be uploaded. Try again from Edit." }} />}
      {sp.stopped && <FormMessage state={{ message: "This expense will no longer repeat." }} />}

      <Card className="space-y-4">
        <div className="flex items-start gap-4">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-gray-100 text-3xl">{cat.icon}</span>
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold break-words">{e.description}</h1>
            <p className="text-3xl font-bold">{formatMoney(e.amount_cents, e.currency)}</p>
            <p className="mt-1 text-sm text-gray-500">
              {cat.label} · {formatDate(e.expense_date)}
            </p>
          </div>
        </div>
        {e.repeat_interval !== "none" && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700">
            <span>🔁 Repeats {repeatLabel}. New copies are added automatically.</span>
            <ActionButton action={stopRepeating.bind(null, id, e.id)} confirmText="Stop repeating this expense? Copies already added stay." variant="ghost" className="px-2 py-1 text-xs" pendingText="…">
              Stop repeating
            </ActionButton>
          </div>
        )}
        {e.recurring_source_id && (
          <p className="text-sm text-gray-500">
            🔁 Added automatically from a recurring expense
            {source && (
              <> (<Link href={`/groups/${id}/expenses/${source.id}`} className="text-brand-600 hover:underline">see original</Link>)</>
            )}
            .
          </p>
        )}
        <p className="text-sm text-gray-500">
          Added by {youOr(e.created_by)} on <LocalTime iso={e.created_at} />
          {new Date(e.updated_at).getTime() - new Date(e.created_at).getTime() > 1000 && (
            <> · edited <LocalTime iso={e.updated_at} /></>
          )}
        </p>
        <div className="flex flex-wrap gap-2">
          <ButtonLink href={`/groups/${id}/expenses/${e.id}/edit`} variant="secondary">Edit</ButtonLink>
          <ActionButton
            action={deleteExpense.bind(null, id, e.id)}
            confirmText={`Delete “${e.description}”? This can't be undone.`}
            variant="danger"
            pendingText="Deleting…"
          >
            Delete
          </ActionButton>
        </div>
      </Card>

      <section>
        <SectionTitle>
          Split {SPLIT_TYPES.find((t) => t.value === e.split_type)?.label.toLowerCase()}
        </SectionTitle>
        <Card className="divide-y divide-gray-100 p-0">
          <div className="flex items-center gap-3 px-5 py-3">
            <Avatar name={youOr(e.paid_by)} id={e.paid_by} />
            <span className="flex-1">
              <span className="font-medium">{youOr(e.paid_by)}</span> paid {formatMoney(e.amount_cents, e.currency)}
            </span>
          </div>
          {e.splits.map((s) => (
            <div key={s.user_id} className="flex items-center gap-3 px-5 py-3 pl-12">
              <Avatar name={youOr(s.user_id)} id={s.user_id} size="sm" />
              <span className="flex-1 text-sm">
                {youOr(s.user_id)} {s.user_id === user.id ? "owe" : "owes"}{" "}
                <span className="font-semibold">{formatMoney(s.share_cents, e.currency)}</span>
              </span>
            </div>
          ))}
        </Card>
      </section>

      {e.split_type === "itemized" && details.items && (
        <section>
          <SectionTitle>Items</SectionTitle>
          <Card className="divide-y divide-gray-100 p-0 text-sm">
            {details.items.map((item, i) => (
              <div key={i} className="flex justify-between gap-3 px-5 py-2.5">
                <span className="min-w-0">
                  <span className="font-medium">{item.name || `Item ${i + 1}`}</span>
                  <span className="block text-xs text-gray-500">{item.user_ids.map(youOr).join(", ")}</span>
                </span>
                <span className="shrink-0 tabular-nums">{formatMoney(item.price_cents, e.currency)}</span>
              </div>
            ))}
            {!!details.tax_cents && <div className="flex justify-between px-5 py-2.5 text-gray-600"><span>Tax</span><span className="tabular-nums">{formatMoney(details.tax_cents, e.currency)}</span></div>}
            {!!details.tip_cents && <div className="flex justify-between px-5 py-2.5 text-gray-600"><span>Tip</span><span className="tabular-nums">{formatMoney(details.tip_cents, e.currency)}</span></div>}
          </Card>
        </section>
      )}

      {e.notes && (
        <section>
          <SectionTitle>Notes</SectionTitle>
          <Card className="whitespace-pre-wrap text-sm">{e.notes}</Card>
        </section>
      )}

      {e.receipt_path && (
        <section>
          <SectionTitle>Receipt</SectionTitle>
          <Card>
            {!receiptUrl ? (
              <p className="text-sm text-gray-500">The receipt couldn&apos;t be loaded.</p>
            ) : isPdf ? (
              <a href={receiptUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-600 hover:underline">📄 Open receipt (PDF)</a>
            ) : (
              <a href={receiptUrl} target="_blank" rel="noopener noreferrer" className="block">
                {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL from private storage */}
                <img src={receiptUrl} alt={`Receipt for ${e.description}`} className="max-h-[32rem] w-full rounded-lg object-contain" />
              </a>
            )}
          </Card>
        </section>
      )}

      <section id="comments">
        <SectionTitle>Comments</SectionTitle>
        <Card className="space-y-4">
          {(comments ?? []).length === 0 && <p className="text-sm text-gray-500">No comments yet.</p>}
          {(comments ?? []).map((c) => (
            <div key={c.id} className="flex gap-3">
              <Avatar name={youOr(c.user_id)} id={c.user_id} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="text-xs text-gray-500">
                  <span className="font-semibold text-gray-700">{youOr(c.user_id)}</span> · <LocalTime iso={c.created_at} />
                </p>
                <p className="whitespace-pre-wrap break-words text-sm">{c.body}</p>
              </div>
              {c.user_id === user.id && (
                <ActionButton action={deleteComment.bind(null, id, e.id, c.id)} confirmText="Delete this comment?" variant="ghost" className="px-2 py-1 text-xs" pendingText="…">
                  Delete
                </ActionButton>
              )}
            </div>
          ))}
          <CommentForm action={addComment.bind(null, id, e.id)} />
        </Card>
      </section>
    </>
  );
}
