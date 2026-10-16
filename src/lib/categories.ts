export const CATEGORIES = [
  { value: "general", label: "General", icon: "🧾" },
  { value: "food", label: "Food & drink", icon: "🍽️" },
  { value: "groceries", label: "Groceries", icon: "🛒" },
  { value: "transport", label: "Transport", icon: "🚕" },
  { value: "housing", label: "Rent & housing", icon: "🏠" },
  { value: "utilities", label: "Utilities", icon: "💡" },
  { value: "entertainment", label: "Entertainment", icon: "🎬" },
  { value: "travel", label: "Travel", icon: "✈️" },
  { value: "shopping", label: "Shopping", icon: "🛍️" },
  { value: "health", label: "Health", icon: "💊" },
  { value: "gifts", label: "Gifts", icon: "🎁" },
  { value: "other", label: "Other", icon: "📦" },
] as const;

export type Category = (typeof CATEGORIES)[number]["value"];

export function categoryOf(value: string) {
  return CATEGORIES.find((c) => c.value === value) ?? CATEGORIES[0];
}
