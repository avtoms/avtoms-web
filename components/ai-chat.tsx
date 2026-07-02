"use client";
// Floating AI assistant available to shop owners and the super-admin. It talks to
// the gateway's /v1/ai/chat, which runs an OpenAI tool-calling loop over a strictly
// READ-ONLY, shop-scoped tool registry (the same tools the MCP endpoint exposes).
//
// The assistant replies with a small HTML fragment. We sanitize it against a strict
// tag/attribute allowlist (no script/style/iframe/event handlers) and render it in the
// chat. Buttons carrying a data-nav="/path" attribute navigate the app in-place via the
// Next router — so the assistant can build clickable, navigable answers.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Btn, IconBtn, Spinner } from "@/components/ui";
import { Icon } from "@/components/icons";
import { useAuth, useLang, useToast } from "@/components/providers";
import { api, ApiError } from "@/lib/api";
import type { AiConversation } from "@/lib/types";

type Msg = { role: "user" | "assistant"; content: string };

// ── HTML sanitizer ─────────────────────────────────────────────────────────
const ALLOWED_TAGS = new Set([
  "div", "span", "p", "h3", "h4", "ul", "ol", "li", "table", "thead", "tbody",
  "tr", "th", "td", "strong", "em", "b", "i", "br", "hr", "small", "code", "button", "a",
]);
// Only these attributes survive. class for styling; data-nav/data-action for interactivity.
const ALLOWED_ATTRS = new Set(["class", "data-nav", "data-action"]);

// Strip a leading/trailing markdown code fence if the model wrapped its HTML in one.
function stripFence(s: string): string {
  const t = s.trim();
  const m = t.match(/^```(?:html)?\s*([\s\S]*?)\s*```$/i);
  return m ? m[1].trim() : t;
}

// sanitizeHtml parses the fragment and rebuilds it keeping only allowlisted tags and
// attributes. data-nav values must be in-app absolute paths ("/..."), never javascript: etc.
function sanitizeHtml(html: string): string {
  if (typeof document === "undefined") return "";
  const doc = new DOMParser().parseFromString(stripFence(html), "text/html");

  const walk = (node: Node) => {
    // Iterate over a static copy since we mutate children.
    Array.from(node.childNodes).forEach((child) => {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as HTMLElement;
        const tag = el.tagName.toLowerCase();
        if (!ALLOWED_TAGS.has(tag)) {
          // Drop the element but keep its (sanitized) text content.
          const text = doc.createTextNode(el.textContent || "");
          el.replaceWith(text);
          return;
        }
        // Strip every attribute except the allowlist.
        Array.from(el.attributes).forEach((attr) => {
          const name = attr.name.toLowerCase();
          if (!ALLOWED_ATTRS.has(name)) { el.removeAttribute(attr.name); return; }
          if (name === "data-nav" && !attr.value.startsWith("/")) { el.removeAttribute(attr.name); }
        });
        // Anchors never do real navigation — neutralize href, keep as styled text.
        if (tag === "a") el.removeAttribute("href");
        walk(el);
      } else if (child.nodeType !== Node.TEXT_NODE) {
        // Comments, etc. — remove.
        child.remove();
      }
    });
  };
  walk(doc.body);
  // Wrap every table so a wide one scrolls inside its own container instead of
  // shattering the chat layout.
  doc.body.querySelectorAll("table").forEach((tbl) => {
    if (!tbl.classList.contains("ai-table")) tbl.classList.add("ai-table");
    const wrap = doc.createElement("div");
    wrap.className = "ai-tablewrap";
    tbl.replaceWith(wrap);
    wrap.appendChild(tbl);
  });
  return doc.body.innerHTML;
}

// ── interactive "app" mode (games, simulations, calculators, drawings…) ──────
// When the assistant returns rich content (script/canvas/style/svg/inputs or a
// full document), we render it in a sandboxed iframe: allow-scripts WITHOUT
// allow-same-origin, so the code runs in a null origin and can never read the
// session token, cookies, or the parent DOM. The only channel back to the app is
// postMessage (navigation + auto-height), handled by the bridge injected below.
const THEME_VARS = [
  "--bg", "--surface", "--surface-2", "--surface-3", "--ink", "--ink-2", "--ink-3",
  "--line", "--line-2", "--accent", "--accent-2", "--accent-ink", "--accent-soft",
  "--ok", "--ok-soft", "--warn", "--warn-soft", "--danger", "--danger-soft",
  "--info", "--info-soft", "--radius", "--radius-sm", "--radius-lg", "--font-sans", "--font-mono",
];

function isInteractiveApp(html: string): boolean {
  return /<script\b|<canvas\b|<style\b|<svg\b|<input\b|<form\b|<textarea\b|<select\b|<!doctype|<html\b|requestAnimationFrame/i.test(stripFence(html));
}

// extractAppContent normalizes either a fragment or a full document into body-level
// content (preserving any <style> the model put in <head>).
function extractAppContent(html: string): string {
  if (typeof document === "undefined") return "";
  if (!/<html|<!doctype/i.test(html)) return html;
  const doc = new DOMParser().parseFromString(html, "text/html");
  const headStyles = Array.from(doc.head.querySelectorAll("style")).map((s) => s.outerHTML).join("");
  return headStyles + doc.body.innerHTML;
}

// buildAppDoc wraps the model's interactive content in a self-contained srcdoc:
// current theme variables + a base stylesheet + a bridge script (id-tagged so the
// host can size each app iframe independently and follow its navigation).
function buildAppDoc(html: string, id: number): string {
  if (typeof document === "undefined") return "";
  const root = getComputedStyle(document.documentElement);
  const vars = THEME_VARS.map((v) => `${v}:${root.getPropertyValue(v).trim()}`).join(";");
  const content = extractAppContent(stripFence(html));
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
:root{${vars}}
*{box-sizing:border-box}
html,body{margin:0}
body{padding:12px;background:var(--bg);color:var(--ink);font-family:var(--font-sans,system-ui),sans-serif;font-size:14px;line-height:1.5}
button{font-family:inherit;cursor:pointer}
a{color:var(--accent-2)}
canvas{max-width:100%}
::-webkit-scrollbar{width:9px;height:9px}::-webkit-scrollbar-thumb{background:var(--line-2);border-radius:6px}
</style></head><body>${content}
<script>(function(){
function send(m){parent.postMessage(Object.assign({__aichat:1,id:${id}},m),'*');}
document.addEventListener('click',function(e){var el=e.target.closest&&e.target.closest('[data-nav]');if(el){e.preventDefault();send({type:'nav',path:el.getAttribute('data-nav')});}});
function h(){send({type:'height',height:document.body.scrollHeight});}
window.addEventListener('load',h);try{new ResizeObserver(h).observe(document.body);}catch(_){}
setTimeout(h,60);setTimeout(h,400);setTimeout(h,1200);
})();</script></body></html>`;
}

// ── styling for the assistant's rendered HTML ────────────────────────────────
const AI_CSS = `
.ai-html { font-size: calc(13.5px * var(--scale)); color: var(--ink); line-height: 1.5; }
.ai-html h3 { font-size: calc(15px * var(--scale)); font-weight: 800; margin: 2px 0 8px; letter-spacing: -0.02em; }
.ai-html h4 { font-size: calc(13.5px * var(--scale)); font-weight: 700; margin: 8px 0 5px; }
.ai-html p { margin: 6px 0; }
.ai-html ul, .ai-html ol { margin: 6px 0; padding-left: 18px; }
.ai-html li { margin: 3px 0; }
.ai-html hr { border: none; border-top: 1px solid var(--line); margin: 10px 0; }
.ai-html small, .ai-html .ai-muted { color: var(--ink-3); font-size: calc(11.5px * var(--scale)); }
.ai-html code { font-family: var(--font-mono); background: var(--surface-2); padding: 1px 5px; border-radius: 5px; font-size: 0.92em; }
.ai-card { border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 11px 13px; margin: 8px 0; background: var(--surface); }
.ai-title { font-weight: 700; color: var(--ink); margin-bottom: 4px; }
.ai-kpi { font-size: calc(20px * var(--scale)); font-weight: 800; letter-spacing: -0.02em; color: var(--ink); }
.ai-tablewrap { margin: 9px 0; overflow-x: auto; border: 1px solid var(--line); border-radius: var(--radius-sm); -webkit-overflow-scrolling: touch; }
.ai-html table { width: 100%; border-collapse: collapse; font-size: calc(12.5px * var(--scale)); }
.ai-html th, .ai-html td { text-align: left; padding: 8px 11px; border-bottom: 1px solid var(--line); vertical-align: top; }
.ai-html thead th { position: sticky; top: 0; background: var(--surface-2); color: var(--ink-3); font-weight: 700; font-size: calc(10.5px * var(--scale)); text-transform: uppercase; letter-spacing: 0.04em; white-space: nowrap; }
.ai-html tbody tr:nth-child(even) td { background: color-mix(in oklch, var(--surface-2), transparent 55%); }
.ai-html tbody tr:last-child td { border-bottom: none; }
.ai-html td:not(:first-child), .ai-html th:not(:first-child) { white-space: nowrap; }
.ai-badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: calc(11px * var(--scale)); font-weight: 600; background: var(--surface-2); color: var(--ink-2); }
.ai-badge.ai-ok { background: var(--ok-soft); color: var(--ok); }
.ai-badge.ai-warn { background: var(--warn-soft); color: var(--warn); }
.ai-badge.ai-danger { background: var(--danger-soft); color: var(--danger); }
.ai-btn { display: inline-flex; align-items: center; gap: 6px; margin: 4px 6px 4px 0; padding: 7px 12px; border: 1px solid var(--line-2); border-radius: var(--radius-sm); background: var(--accent-soft); color: var(--accent-2); font-weight: 600; font-size: calc(12.5px * var(--scale)); cursor: pointer; font-family: var(--font-sans); }
.ai-btn:hover { border-color: var(--accent); }
`;

// ── component ────────────────────────────────────────────────────────────────
export function ChatWidget() {
  const { session } = useAuth();
  const { t } = useLang();
  const { toast } = useToast();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [threads, setThreads] = useState<AiConversation[]>([]);
  const [showThreads, setShowThreads] = useState(false);
  const [loadingThread, setLoadingThread] = useState(false);
  const [heights, setHeights] = useState<Record<number, number>>({}); // per-message app-iframe heights
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const isAdmin = session?.role === "admin";

  // Navigate the app, guarding cross-role links (owners → owner paths, admin → admin paths).
  const navTo = useCallback((path: string) => {
    if (!path.startsWith("/")) return;
    const adminPath = path === "/admin" || path.startsWith("/admin/");
    if (adminPath !== isAdmin) { toast(t("ai_nav_blocked"), { icon: "alert", tone: "danger" }); return; }
    router.push(path);
    setOpen(false);
  }, [isAdmin, router, t, toast]);

  // Bridge from sandboxed app iframes: in-app navigation + per-iframe auto-height.
  useEffect(() => {
    function onMsg(e: MessageEvent) {
      const d = e.data as { __aichat?: number; type?: string; path?: string; id?: number; height?: number } | null;
      if (!d || d.__aichat !== 1) return;
      if (d.type === "nav" && typeof d.path === "string") navTo(d.path);
      else if (d.type === "height" && typeof d.id === "number" && typeof d.height === "number") {
        const h = Math.max(120, Math.min(Math.round(d.height) + 4, 2000));
        setHeights((cur) => (cur[d.id!] === h ? cur : { ...cur, [d.id!]: h }));
      }
    }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [navTo]);

  // Auto-scroll to the newest message.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [msgs, sending, open]);

  const refreshThreads = useCallback(async () => {
    try { setThreads(await api.listConversations()); } catch { /* ignore */ }
  }, []);

  // Load saved threads when the panel first opens.
  useEffect(() => { if (open) refreshThreads(); }, [open, refreshThreads]);

  const newChat = () => { setMsgs([]); setConversationId(null); setShowThreads(false); setInput(""); setHeights({}); };

  const openThread = async (id: string) => {
    setShowThreads(false);
    setLoadingThread(true);
    setHeights({});
    try {
      const r = await api.getConversation(id);
      setMsgs((r.messages ?? []).map((m) => ({ role: m.role, content: m.content })));
      setConversationId(id);
    } catch {
      toast(t("ai_error"), { icon: "alert", tone: "danger" });
    } finally { setLoadingThread(false); }
  };

  const removeThread = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.deleteConversation(id);
      setThreads((cur) => cur.filter((c) => c.id !== id));
      if (conversationId === id) newChat();
    } catch { toast(t("ai_error"), { icon: "alert", tone: "danger" }); }
  };

  const send = useCallback(async (text: string) => {
    const q = text.trim();
    if (!q || sending) return;
    const next: Msg[] = [...msgs, { role: "user", content: q }];
    setMsgs(next);
    setInput("");
    setSending(true);
    const wasNew = !conversationId;
    try {
      const r = await api.aiChat(next.map((m) => ({ role: m.role, content: m.content })), conversationId ?? undefined);
      setMsgs((cur) => [...cur, { role: "assistant", content: r.reply || t("ai_no_reply") }]);
      if (r.conversationId) {
        setConversationId(r.conversationId);
        if (wasNew) refreshThreads(); // surface the freshly created thread in the list
      }
    } catch (e) {
      const em = e instanceof ApiError ? e.message : t("ai_error");
      setMsgs((cur) => [...cur, { role: "assistant", content: `<p class="ai-muted">${escapeText(em)}</p>` }]);
    } finally {
      setSending(false);
    }
  }, [msgs, sending, t, conversationId, refreshThreads]);

  // Delegated navigation for buttons inside sanitized (inline) assistant HTML.
  const onHtmlClick = (e: React.MouseEvent) => {
    const el = (e.target as HTMLElement).closest("[data-nav]") as HTMLElement | null;
    if (!el) return;
    e.preventDefault();
    navTo(el.getAttribute("data-nav") || "");
  };

  const suggestions = isAdmin
    ? [t("ai_sug_platform"), t("ai_sug_leads"), t("ai_sug_shops")]
    : [t("ai_sug_today"), t("ai_sug_profit"), t("ai_sug_reminders")];

  const btnBottom = "calc(env(safe-area-inset-bottom, 0px) + 20px)";

  return (
    <>
      <style>{AI_CSS}</style>

      {/* Launcher */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label={t("ai_assistant")}
          className="an-btn"
          style={{
            position: "fixed", right: 20, bottom: btnBottom, zIndex: 150,
            width: 56, height: 56, borderRadius: "50%", border: "none", cursor: "pointer",
            background: "var(--accent)", color: "var(--accent-ink)",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "var(--shadow-lg)",
          }}
        >
          <Icon name="sparkle" size={26} />
        </button>
      )}

      {/* Panel */}
      {open && (
        <div
          role="dialog"
          aria-label={t("ai_assistant")}
          style={{
            position: "fixed", zIndex: 210, background: "var(--surface)",
            border: "1px solid var(--line)", boxShadow: "var(--shadow-lg)",
            display: "flex", flexDirection: "column", overflow: "hidden",
            // Desktop: floating card bottom-right. Mobile: full-screen sheet.
            right: "max(env(safe-area-inset-right,0px), 16px)",
            bottom: btnBottom,
            top: "auto",
            width: "min(420px, calc(100vw - 32px))",
            height: "min(620px, calc(100vh - 96px))",
            borderRadius: "var(--radius-lg)",
          }}
        >
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderBottom: "1px solid var(--line)", background: "var(--surface)" }}>
            <div style={{ width: 32, height: 32, borderRadius: 9, background: "var(--accent-soft)", color: "var(--accent-2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon name="sparkle" size={19} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 800, color: "var(--ink)", fontSize: "calc(14.5px * var(--scale))", letterSpacing: "-0.01em" }}>{t("ai_assistant")}</div>
              <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{t("ai_readonly_note")}</div>
            </div>
            <IconBtn icon="history" size={16} active={showThreads} onClick={() => setShowThreads((v) => !v)} aria-label={t("ai_threads")} style={{ width: 34, height: 34 }} />
            <IconBtn icon="plus" size={17} onClick={newChat} aria-label={t("ai_new_chat")} style={{ width: 34, height: 34 }} />
            <IconBtn icon="x" size={17} onClick={() => setOpen(false)} aria-label={t("close")} style={{ width: 34, height: 34 }} />
          </div>

          {/* Messages */}
          <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 12, background: "var(--bg)" }}>
            {showThreads ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-3)", padding: "2px 2px 6px", textTransform: "uppercase", letterSpacing: "0.05em" }}>{t("ai_threads")}</div>
                {threads.length === 0 && <div style={{ fontSize: 13, color: "var(--ink-3)", padding: "10px 2px" }}>{t("ai_no_threads")}</div>}
                {threads.map((c) => (
                  <div key={c.id} onClick={() => openThread(c.id)} className="an-btn" style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 11px", borderRadius: "var(--radius-sm)", border: "1px solid var(--line)", background: c.id === conversationId ? "var(--accent-soft)" : "var(--surface)", cursor: "pointer" }}>
                    <Icon name="chat" size={15} style={{ color: "var(--ink-3)", flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.title || t("ai_untitled")}</div>
                    <IconBtn icon="trash" size={14} onClick={(e) => removeThread(c.id, e)} aria-label={t("ai_delete")} style={{ width: 28, height: 28 }} />
                  </div>
                ))}
              </div>
            ) : loadingThread ? (
              <div style={{ margin: "auto", color: "var(--ink-3)" }}><Spinner size={22} /></div>
            ) : (<>
            {msgs.length === 0 && (
              <div style={{ margin: "auto 0", display: "flex", flexDirection: "column", gap: 12, alignItems: "center", textAlign: "center", padding: "12px 6px" }}>
                <div style={{ width: 52, height: 52, borderRadius: 16, background: "var(--accent-soft)", color: "var(--accent-2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon name="sparkle" size={28} />
                </div>
                <div style={{ fontWeight: 700, color: "var(--ink)", fontSize: "calc(15px * var(--scale))" }}>{t("ai_greeting")}</div>
                <div style={{ fontSize: 12.5, color: "var(--ink-3)", maxWidth: 300 }}>{t("ai_greeting_sub")}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%", marginTop: 4 }}>
                  {suggestions.map((s, i) => (
                    <button key={i} onClick={() => send(s)} className="an-btn" style={{
                      textAlign: "left", padding: "10px 12px", borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--line)", background: "var(--surface)", color: "var(--ink-2)",
                      cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600,
                    }}>{s}</button>
                  ))}
                </div>
              </div>
            )}

            {msgs.map((m, i) => (
              m.role === "user" ? (
                <div key={i} style={{ alignSelf: "flex-end", maxWidth: "85%", padding: "9px 13px", borderRadius: "14px 14px 3px 14px", background: "var(--accent)", color: "var(--accent-ink)", fontSize: "calc(13.5px * var(--scale))", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                  {m.content}
                </div>
              ) : isInteractiveApp(m.content) ? (
                // Rich/interactive content (games, simulations, calculators…) runs in a
                // sandboxed iframe — isolated from the app's origin, session and cookies.
                <iframe key={i} title={t("ai_assistant")} sandbox="allow-scripts allow-pointer-lock"
                  srcDoc={buildAppDoc(m.content, i)}
                  style={{ alignSelf: "stretch", width: "100%", border: "1px solid var(--line)", borderRadius: 12, background: "var(--surface)", height: heights[i] ?? 260, maxHeight: "72vh" }}
                />
              ) : (
                <div key={i} className="ai-html" onClick={onHtmlClick}
                  style={{ alignSelf: "flex-start", maxWidth: "94%", padding: "10px 13px", borderRadius: "14px 14px 14px 3px", background: "var(--surface)", border: "1px solid var(--line)", wordBreak: "break-word" }}
                  dangerouslySetInnerHTML={{ __html: sanitizeHtml(m.content) }}
                />
              )
            ))}

            {sending && (
              <div style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 8, padding: "9px 13px", borderRadius: 12, background: "var(--surface)", border: "1px solid var(--line)", color: "var(--ink-3)", fontSize: 13 }}>
                <Spinner size={14} /> {t("ai_thinking")}
              </div>
            )}
            </>)}
          </div>

          {/* Composer */}
          {!showThreads && (
          <div style={{ borderTop: "1px solid var(--line)", padding: 10, background: "var(--surface)" }}>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
                placeholder={t("ai_placeholder")}
                rows={1}
                style={{
                  flex: 1, resize: "none", maxHeight: 120, minHeight: 40, padding: "10px 12px",
                  borderRadius: "var(--radius-sm)", border: "1px solid var(--line-2)", background: "var(--bg)",
                  color: "var(--ink)", fontFamily: "var(--font-sans)", fontSize: "calc(13.5px * var(--scale))", outline: "none",
                }}
              />
              <Btn variant="primary" icon="send" disabled={sending || !input.trim()} onClick={() => send(input)} aria-label={t("send")} style={{ height: 40 }} />
            </div>
          </div>
          )}
        </div>
      )}
    </>
  );
}

function escapeText(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] || c));
}
