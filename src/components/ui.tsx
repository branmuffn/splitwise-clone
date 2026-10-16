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

export function Input({ className = "", ...props }: ComponentProps<"input">) {
  return (
    <input
      className={`w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-base outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100 ${className}`}
      {...props}
    />
  );
}

export function Label({ className = "", ...props }: ComponentProps<"label">) {
  return <label className={`mb-1 block text-sm font-medium text-gray-700 ${className}`} {...props} />;
}

const buttonVariants = {
  primary: "bg-brand-500 text-white hover:bg-brand-600 active:bg-brand-700",
  secondary: "border border-gray-300 bg-white text-gray-800 hover:bg-gray-50",
  ghost: "text-gray-600 hover:bg-gray-100",
};

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ComponentProps<"button"> & { variant?: keyof typeof buttonVariants }) {
  return (
    <button
      className={`inline-flex items-center justify-center rounded-lg px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${buttonVariants[variant]} ${className}`}
      {...props}
    />
  );
}

export function FormMessage({ state }: { state?: { error?: string; message?: string } }) {
  if (state?.error) {
    return <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>;
  }
  if (state?.message) {
    return <p className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700">{state.message}</p>;
  }
  return null;
}
