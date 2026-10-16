import Link from "next/link";
import type { ComponentProps } from "react";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-semibold tracking-tight ${className}`}>
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-500 text-white text-lg font-bold">
        S
      </span>
      Splitwise<span className="font-normal opacity-70">clone</span>
    </span>
  );
}

export function Card({ className = "", ...props }: ComponentProps<"div">) {
  return (
    <div
      className={`rounded-2xl border border-black/5 bg-white p-5 shadow-sm ${className}`}
      {...props}
    />
  );
}

const fieldClass =
  "w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-base outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:bg-gray-50";

export function Input({ className = "", ...props }: ComponentProps<"input">) {
  return <input className={`${fieldClass} ${className}`} {...props} />;
}

export function Select({ className = "", ...props }: ComponentProps<"select">) {
  return <select className={`${fieldClass} ${className}`} {...props} />;
}

export function Textarea({ className = "", ...props }: ComponentProps<"textarea">) {
  return <textarea className={`${fieldClass} ${className}`} {...props} />;
}

export function Label({ className = "", ...props }: ComponentProps<"label">) {
  return <label className={`mb-1 block text-sm font-medium text-gray-700 ${className}`} {...props} />;
}

const buttonVariants = {
  primary: "bg-brand-500 text-white hover:bg-brand-600 active:bg-brand-700",
  secondary: "border border-gray-300 bg-white text-gray-800 hover:bg-gray-50",
  ghost: "text-gray-600 hover:bg-gray-100",
  danger: "border border-red-200 bg-white text-red-600 hover:bg-red-50",
  owe: "bg-owe text-white hover:brightness-95",
};
type Variant = keyof typeof buttonVariants;
const buttonBase =
  "inline-flex items-center justify-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60";

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ComponentProps<"button"> & { variant?: Variant }) {
  return <button className={`${buttonBase} ${buttonVariants[variant]} ${className}`} {...props} />;
}

export function ButtonLink({
  variant = "primary",
  className = "",
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link className={`${buttonBase} ${buttonVariants[variant]} ${className}`} {...props} />;
}

export function FormMessage({ state }: { state?: { error?: string; message?: string } }) {
  if (state?.error) {
    return <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>;
  }
  if (state?.message) {
    return <p role="status" className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700">{state.message}</p>;
  }
  return null;
}

export function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-end justify-between gap-2">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">{children}</h2>
      {action}
    </div>
  );
}

const avatarColors = ["bg-brand-500", "bg-sky-500", "bg-violet-500", "bg-amber-500", "bg-rose-500", "bg-teal-600", "bg-indigo-500"];

export function Avatar({ name, id, size = "md" }: { name: string; id: string; size?: "sm" | "md" | "lg" }) {
  const color = avatarColors[[...id].reduce((a, c) => a + c.charCodeAt(0), 0) % avatarColors.length];
  const sizes = { sm: "h-6 w-6 text-xs", md: "h-8 w-8 text-sm", lg: "h-10 w-10 text-base" };
  return (
    <span className={`grid shrink-0 place-items-center rounded-full font-semibold text-white ${color} ${sizes[size]}`}>
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="inline-block text-sm font-medium text-brand-600 hover:underline">
      ‹ {children}
    </Link>
  );
}

// "Oct 16, 2026" from a YYYY-MM-DD date column (no timezone shifting).
export function formatDate(date: string, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" }) {
  return new Date(`${date.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-US", { ...opts, timeZone: "UTC" });
}
