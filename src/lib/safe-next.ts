// Where /auth/callback may send the user after signing them in.
// `next` comes from the URL, so anyone can set it. Resolve it the way a browser would and only
// keep it if it stays on our own origin; anything else (other hosts, "//evil.com", "/\evil.com",
// tabs or newlines, "javascript:") falls back to "/".
export function safeNextPath(next: string | null | undefined, base: string | URL): string {
  if (!next) return "/";
  let target: URL;
  let origin: string;
  try {
    origin = new URL(base).origin;
    target = new URL(next, base);
  } catch {
    return "/";
  }
  if (target.origin !== origin) return "/";
  // Dot segments can collapse into a leading "//" (e.g. "/.//evil.com"), which would point at
  // another host once the caller resolves the path again.
  if (target.pathname.startsWith("//")) return "/";
  return target.pathname + target.search + target.hash;
}
