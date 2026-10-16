"use client";

import { useEffect, useState } from "react";

// Renders a timestamp in the viewer's own timezone (falls back to UTC on the server).
export function LocalTime({ iso, withTime = true }: { iso: string; withTime?: boolean }) {
  const opts: Intl.DateTimeFormatOptions = withTime
    ? { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }
    : { month: "short", day: "numeric", year: "numeric" };
  const [text, setText] = useState(() => new Date(iso).toLocaleString("en-US", { ...opts, timeZone: "UTC" }));
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- needs the browser's timezone
    setText(new Date(iso).toLocaleString("en-US", opts));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iso, withTime]);
  return <time dateTime={iso}>{text}</time>;
}
