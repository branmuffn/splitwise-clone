// Full feature test: submits the real forms (no-JS progressive enhancement) as several users.
export const SITE = process.env.SITE ?? "http://localhost:3123";
export const run = Date.now().toString(36);
export let failures = 0;
export const check = (n, c, x = "") => { console.log(`${c ? "PASS" : "FAIL"} ${n}${x && !c ? " — " + x : ""}`); if (!c) failures++; };
export const decode = (s) => s.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
export const attr = (tag, name) => { const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tag); return m ? decode(m[1]) : null; };
// Visible text: strip scripts and tags, decode entities, collapse whitespace.
export const text = (html) => decode(html.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]+>/g, "")).replace(/\s+/g, " ");

// Apply React's streamed segment swaps ($RS("S:n","P:n")) so the HTML reads like the final DOM.
export function assemble(html) {
  for (let i = 0; i < 50; i++) {
    const m = /<div hidden id="(S:\d+)">([\s\S]*?)<\/div><script>(?:\$RS=function[^<]*?;)?\$RS\("\1","(P:\d+)"\)<\/script>/.exec(html);
    if (!m) break;
    html = html.replace(m[0], "").replace(`<template id="${m[3]}"></template>`, m[2]);
  }
  return html;
}

export class Browser {
  constructor(label) { this.label = label; this.jar = new Map(); }
  cookieHeader() { return [...this.jar].map(([k, v]) => `${k}=${v}`).join("; "); }
  store(res) {
    for (const c of res.headers.getSetCookie()) {
      const [pair, ...attrs] = c.split(";");
      const i = pair.indexOf("=");
      const k = pair.slice(0, i).trim(), v = pair.slice(i + 1);
      (attrs.some((a) => /max-age=0/i.test(a)) || v === "") ? this.jar.delete(k) : this.jar.set(k, v);
    }
  }
  async request(path, init = {}) {
    let url = new URL(path, SITE), res;
    for (let i = 0; i < 6; i++) {
      res = await fetch(url, { ...init, signal: AbortSignal.timeout(30000), redirect: "manual", headers: { ...init.headers, Cookie: this.cookieHeader() } });
      this.store(res);
      if (res.status < 300 || res.status >= 400) break;
      url = new URL(res.headers.get("location"), url);
      init = {};
    }
    const html = assemble(await res.text());
    return { status: res.status, url, html, text: text(html) };
  }
  get(path) { return this.request(path); }
  forms(html) { return [...html.matchAll(/<form\b[^>]*>[\s\S]*?<\/form>/g)].map((m) => m[0]); }
  async post(pagePath, form, fields) {
    const body = new FormData();
    for (const [tag] of form.matchAll(/<input\b[^>]*>/g)) {
      const name = attr(tag, "name");
      if (name && attr(tag, "type") === "hidden") body.append(name, attr(tag, "value") ?? "");
    }
    for (const [k, v] of Object.entries(fields)) if (v !== undefined) body.append(k, v);
    return this.request(pagePath, { method: "POST", body, headers: { Origin: SITE } });
  }
  // Submit the form that contains an input named `marker`.
  async submit(path, marker, fields = {}) {
    const page = await this.get(path);
    const form = this.forms(page.html).find((f) => f.includes(`name="${marker}"`));
    if (!form) throw new Error(`${this.label}: no form with field ${marker} on ${path}`);
    return this.post(page.url.pathname, form, fields);
  }
  // Submit the one-button form whose button text matches.
  async click(path, buttonText) {
    const page = await this.get(path);
    const forms = this.forms(page.html).filter((f) => new RegExp(`<button[^>]*>\\s*${buttonText}\\s*</button>`).test(f));
    if (!forms.length) throw new Error(`${this.label}: no "${buttonText}" button on ${path}`);
    return this.post(page.url.pathname, forms[0], {});
  }
}

// href of the <a> whose visible text includes `label`.
export const linkTo = (html, label) => [...html.replace(/<script[\s\S]*?<\/script>/g, "").matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].find((m) => text(m[2]).includes(label))?.[1];
export const isNotFound = (r) => r.html.includes("NEXT_HTTP_ERROR_FALLBACK;404") && !r.text.includes("Invite code");
export const memberIds = (html) => Object.fromEntries([...html.matchAll(/<option value="([0-9a-f-]{36})"[^>]*>([^<(]+)/g)].map((m) => [m[2].trim(), m[1]]));
export const email = (n) => `claude-e2e-${n}-${run}@example.com`;
export const step = async (name, fn) => { try { await fn(); } catch (e) { check(name, false, e.message); } };


export const failureCount = () => failures;
