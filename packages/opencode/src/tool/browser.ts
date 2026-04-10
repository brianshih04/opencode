import z from "zod"
import { Tool } from "./tool"
import DESCRIPTION from "./browser.txt"
import { Log } from "../util/log"
import path from "path"
import os from "os"

const log = Log.create({ service: "tool.browser" })

const DAEMON_PORT = parseInt(process.env.OPENCLI_DAEMON_PORT ?? "19825", 10)
const DAEMON_URL = `http://127.0.0.1:${DAEMON_PORT}`
const HEADERS = { "X-OpenCLI": "1", "Content-Type": "application/json" }

// ─── Daemon Client ─────────────────────────────────────────────────

interface DaemonResult {
  ok: boolean
  data?: unknown
  error?: string
  page?: string
}

interface DaemonStatus {
  ok: boolean
  extensionConnected: boolean
}

async function sendCommand(action: string, params: Record<string, unknown> = {}): Promise<DaemonResult> {
  const id = `oc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const body = JSON.stringify({ id, action, ...params })

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 30_000)

  try {
    const res = await fetch(`${DAEMON_URL}/command`, {
      method: "POST",
      headers: HEADERS,
      body,
      signal: controller.signal,
    })
    const result = await res.json() as DaemonResult
    return result
  } finally {
    clearTimeout(timer)
  }
}

async function checkDaemon(): Promise<DaemonStatus | null> {
  try {
    const res = await fetch(`${DAEMON_URL}/status`, {
      headers: HEADERS,
      signal: AbortSignal.timeout(3000),
    })
    if (!res.ok) return null
    return await res.json() as DaemonStatus
  } catch {
    return null
  }
}

// ─── Page State ────────────────────────────────────────────────────

// Track active page per workspace
const activePages = new Map<string, string>()
const lastUrls = new Map<string, string>()

function getPage(workspace: string): string | undefined {
  return activePages.get(workspace)
}

function setPage(workspace: string, page: string | undefined) {
  if (page) activePages.set(workspace, page)
  else activePages.delete(workspace)
}

// ─── Parameters ────────────────────────────────────────────────────

const Parameters = z.discriminatedUnion("action", [
  // Navigation
  z.object({
    action: z.literal("navigate"),
    url: z.string().describe("URL to navigate to"),
  }),
  // Click element
  z.object({
    action: z.literal("click"),
    selector: z.string().describe("CSS selector or data-opencli-ref to click"),
    ref: z.boolean().optional().describe("If true, selector is a data-opencli-ref value"),
  }),
  // Type text
  z.object({
    action: z.literal("type"),
    selector: z.string().describe("CSS selector to type into"),
    text: z.string().describe("Text to type"),
    clear: z.boolean().optional().describe("Clear existing text first (default: true)"),
  }),
  // Execute JS
  z.object({
    action: z.literal("evaluate"),
    code: z.string().describe("JavaScript code to execute"),
  }),
  // Screenshot
  z.object({
    action: z.literal("screenshot"),
    path: z.string().optional().describe("File path to save screenshot (PNG)"),
    fullPage: z.boolean().optional().describe("Capture full page (default: viewport only)"),
  }),
  // Get page content
  z.object({
    action: z.literal("content"),
    selector: z.string().optional().describe("CSS selector to extract text from (default: body)"),
  }),
  // List tabs
  z.object({
    action: z.literal("tabs"),
  }),
  // Select tab
  z.object({
    action: z.literal("select_tab"),
    index: z.number().describe("Tab index to select (0-based)"),
  }),
  // Get cookies
  z.object({
    action: z.literal("cookies"),
    domain: z.string().optional().describe("Filter cookies by domain"),
  }),
  // Scroll
  z.object({
    action: z.literal("scroll"),
    direction: z.enum(["up", "down", "top", "bottom"]).optional().describe("Scroll direction (default: down)"),
    amount: z.number().optional().describe("Pixels to scroll (default: 500)"),
  }),
  // Wait for element
  z.object({
    action: z.literal("wait"),
    selector: z.string().describe("CSS selector to wait for"),
    timeout: z.number().optional().describe("Max wait time in ms (default: 10000)"),
  }),
  // Get current URL
  z.object({
    action: z.literal("url"),
  }),
  // Check daemon status
  z.object({
    action: z.literal("status"),
  }),
])

// ─── Browser Tool ──────────────────────────────────────────────────

export const BrowserTool = Tool.define("browser", async () => {
  return {
    description: DESCRIPTION,
    parameters: Parameters,
    async execute(params, ctx) {
      const workspace = "default"

      switch (params.action) {
        case "status":
          return handleStatus()
        case "navigate":
          return handleNavigate(workspace, params.url)
        case "click":
          return handleClick(workspace, params.selector, params.ref)
        case "type":
          return handleType(workspace, params.selector, params.text, params.clear)
        case "evaluate":
          return handleEvaluate(workspace, params.code)
        case "screenshot":
          return handleScreenshot(workspace, params.path, params.fullPage)
        case "content":
          return handleContent(workspace, params.selector)
        case "tabs":
          return handleTabs(workspace)
        case "select_tab":
          return handleSelectTab(workspace, params.index)
        case "cookies":
          return handleCookies(workspace, params.domain)
        case "scroll":
          return handleScroll(workspace, params.direction, params.amount)
        case "wait":
          return handleWait(workspace, params.selector, params.timeout)
        case "url":
          return handleUrl(workspace)
        default:
          return { output: `Unknown action`, title: "Browser error", metadata: {} as Record<string, unknown> }
      }
    },
  }
})

// ─── Action Handlers ───────────────────────────────────────────────

function cmdOpts(workspace: string): Record<string, unknown> {
  const opts: Record<string, unknown> = { workspace }
  const page = getPage(workspace)
  if (page) opts.page = page
  return opts
}

async function handleStatus() {
  const status = await checkDaemon()
  if (!status) {
    return {
      output: "❌ OpenCLI daemon is not running.\nStart it with: opencli doctor\nOr: npx opencli daemon",
      title: "Browser: daemon offline",
      metadata: {} as Record<string, unknown>,
    }
  }
  const ext = status.extensionConnected ? "✅ connected" : "❌ not connected"
  return {
    output: `✅ OpenCLI daemon is running\nExtension: ${ext}`,
    title: "Browser status",
    metadata: {} as Record<string, unknown>,
  }
}

async function handleNavigate(workspace: string, url: string) {
  const result = await sendCommand("navigate", { url, ...cmdOpts(workspace) })
  if (result.page) setPage(workspace, result.page)
  lastUrls.set(workspace, url)

  // Inject stealth + wait for settle
  const stealthCode = `
    (function() {
      if (window.__opencliStealth) return 'already-injected';
      window.__opencliStealth = true;
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      if (!window.chrome) window.chrome = {};
      return 'stealth-injected';
    })();
  `
  await sendCommand("exec", { code: stealthCode, ...cmdOpts(workspace) })

  if (!result.ok) {
    return { output: `❌ Navigate failed: ${result.error}`, title: "Browser: navigate error", metadata: {} as Record<string, unknown> }
  }
  return { output: `✅ Navigated to ${url}`, title: `Browser → ${url}`, metadata: {} as Record<string, unknown> }
}

async function handleClick(workspace: string, selector: string, ref?: boolean) {
  const cssSelector = ref ? `[data-opencli-ref="${selector}"]` : selector
  const code = `
    (function() {
      const el = document.querySelector('${cssSelector.replace(/'/g, "\\'")}');
      if (!el) return { error: 'Element not found: ${selector}' };
      el.click();
      return { ok: true, tag: el.tagName, text: el.textContent?.slice(0, 200) };
    })();
  `
  const result = await sendCommand("exec", { code, ...cmdOpts(workspace) })
  return {
    output: formatResult(result, `Click ${selector}`),
    title: `Browser: click`,
    metadata: {} as Record<string, unknown>,
  }
}

async function handleType(workspace: string, selector: string, text: string, clear?: boolean) {
  const shouldClear = clear !== false
  const code = `
    (function() {
      const el = document.querySelector('${selector.replace(/'/g, "\\'")}');
      if (!el) return { error: 'Element not found: ${selector}' };
      ${shouldClear ? "el.focus(); el.value = ''; el.dispatchEvent(new Event('input', {bubbles:true}));" : ""}
      el.focus();
      el.value += ${JSON.stringify(text)};
      el.dispatchEvent(new Event('input', {bubbles:true}));
      el.dispatchEvent(new Event('change', {bubbles:true}));
      return { ok: true };
    })();
  `
  const result = await sendCommand("exec", { code, ...cmdOpts(workspace) })
  return {
    output: formatResult(result, `Type "${text}" into ${selector}`),
    title: "Browser: type",
    metadata: {} as Record<string, unknown>,
  }
}

async function handleEvaluate(workspace: string, code: string) {
  const wrappedCode = `(function() { try { const __r = (${code}); return { ok: true, result: __r }; } catch(e) { return { error: e.message }; } })();`
  const result = await sendCommand("exec", { code: wrappedCode, ...cmdOpts(workspace) })
  return {
    output: formatResult(result, "Evaluate"),
    title: "Browser: evaluate",
    metadata: {} as Record<string, unknown>,
  }
}

async function handleScreenshot(workspace: string, filePath?: string, fullPage?: boolean) {
  const result = await sendCommand("screenshot", {
    format: "png",
    fullPage: fullPage ?? false,
    ...cmdOpts(workspace),
  })

  if (!result.ok || !result.data) {
    return { output: `❌ Screenshot failed: ${result.error}`, title: "Browser: screenshot error", metadata: {} as Record<string, unknown> }
  }

  // result.data is base64 PNG
  const base64 = result.data as string
  const sizeKb = Math.round(base64.length * 0.75 / 1024)

  if (filePath) {
    const fs = await import("fs/promises")
    const absPath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath)
    await fs.mkdir(path.dirname(absPath), { recursive: true })
    await fs.writeFile(absPath, Buffer.from(base64, "base64"))
    return {
      output: `✅ Screenshot saved to ${absPath} (${sizeKb} KB)`,
      title: "Browser: screenshot",
      metadata: {} as Record<string, unknown>,
    }
  }

  return {
    output: `✅ Screenshot captured (${sizeKb} KB). Use path parameter to save to file.`,
    title: "Browser: screenshot",
    metadata: {} as Record<string, unknown>,
  }
}

async function handleContent(workspace: string, selector?: string) {
  const sel = selector ?? "body"
  const code = `
    (function() {
      const el = document.querySelector('${sel.replace(/'/g, "\\'")}');
      if (!el) return { error: 'Element not found: ${sel}' };
      return { ok: true, text: el.innerText || el.textContent, html: el.innerHTML?.slice(0, 5000) };
    })();
  `
  const result = await sendCommand("exec", { code, ...cmdOpts(workspace) })
  const data = result.data as any
  if (data?.ok) {
    return {
      output: data.text?.slice(0, 10000) ?? "(empty)",
      title: `Browser content: ${sel}`,
      metadata: {} as Record<string, unknown>,
    }
  }
  return { output: formatResult(result, `Content ${sel}`), title: "Browser: content", metadata: {} as Record<string, unknown> }
}

async function handleTabs(workspace: string) {
  const result = await sendCommand("tabs", { op: "list", workspace })
  if (!result.ok) {
    return { output: `❌ Tabs failed: ${result.error}`, title: "Browser: tabs error", metadata: {} as Record<string, unknown> }
  }
  const tabs = Array.isArray(result.data) ? result.data : []
  const output = tabs.map((t: any, i: number) => `${i}: ${t.title ?? t.url ?? "unknown"}`).join("\n")
  return { output: output || "No tabs found", title: `Browser tabs (${tabs.length})`, metadata: {} as Record<string, unknown> }
}

async function handleSelectTab(workspace: string, index: number) {
  const result = await sendCommand("tabs", { op: "select", index, workspace })
  if (result.page) setPage(workspace, result.page)
  return {
    output: formatResult(result, `Select tab ${index}`),
    title: "Browser: select tab",
    metadata: {} as Record<string, unknown>,
  }
}

async function handleCookies(workspace: string, domain?: string) {
  const opts: Record<string, unknown> = { workspace }
  if (domain) opts.domain = domain
  const result = await sendCommand("cookies", opts)
  const cookies = Array.isArray(result.data) ? result.data : []
  if (cookies.length === 0) {
    return { output: "No cookies found", title: "Browser: cookies", metadata: {} as Record<string, unknown> }
  }
  const output = cookies.slice(0, 50).map((c: any) => `${c.name}: ${c.value?.slice(0, 50)}${c.domain ? ` (${c.domain})` : ""}`).join("\n")
  return { output, title: `Browser cookies (${cookies.length})`, metadata: {} as Record<string, unknown> }
}

async function handleScroll(workspace: string, direction?: string, amount?: number) {
  const dir = direction ?? "down"
  const px = amount ?? 500
  let code: string
  switch (dir) {
    case "top": code = "window.scrollTo(0, 0)"; break
    case "bottom": code = "window.scrollTo(0, document.body.scrollHeight)"; break
    case "up": code = `window.scrollBy(0, -${px})`; break
    default: code = `window.scrollBy(0, ${px})`; break
  }
  const result = await sendCommand("exec", { code, ...cmdOpts(workspace) })
  return {
    output: `✅ Scrolled ${dir} ${dir === "top" || dir === "bottom" ? "" : px + "px"}`,
    title: "Browser: scroll",
    metadata: {} as Record<string, unknown>,
  }
}

async function handleWait(workspace: string, selector: string, timeout?: number) {
  const ms = timeout ?? 10000
  const code = `
    (function() {
      return new Promise((resolve) => {
        const el = document.querySelector('${selector.replace(/'/g, "\\'")}');
        if (el) return resolve({ ok: true, found: true });
        const observer = new MutationObserver(() => {
          if (document.querySelector('${selector.replace(/'/g, "\\'")}')) {
            observer.disconnect();
            resolve({ ok: true, found: true });
          }
        });
        observer.observe(document.body, { childList: true, subtree: true });
        setTimeout(() => { observer.disconnect(); resolve({ ok: true, found: false }); }, ${ms});
      });
    })();
  `
  const result = await sendCommand("exec", { code, ...cmdOpts(workspace) })
  const data = result.data as any
  if (data?.found) {
    return { output: `✅ Element found: ${selector}`, title: "Browser: wait", metadata: {} as Record<string, unknown> }
  }
  return { output: `⏱️ Timeout waiting for: ${selector} (${ms}ms)`, title: "Browser: wait timeout", metadata: {} as Record<string, unknown> }
}

async function handleUrl(workspace: string) {
  const url = lastUrls.get(workspace)
  const code = `(function() { return { ok: true, url: window.location.href, title: document.title }; })();`
  const result = await sendCommand("exec", { code, ...cmdOpts(workspace) })
  const data = result.data as any
  if (data?.ok) {
    return { output: `URL: ${data.url}\nTitle: ${data.title}`, title: "Browser URL", metadata: {} as Record<string, unknown> }
  }
  return { output: url ?? "No active page", title: "Browser URL", metadata: {} as Record<string, unknown> }
}

// ─── Helpers ───────────────────────────────────────────────────────

function formatResult(result: DaemonResult, label: string): string {
  if (!result.ok) return `❌ ${label} failed: ${result.error ?? "unknown error"}`
  const data = result.data
  if (typeof data === "string") return data
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>
    if (obj.error) return `❌ ${obj.error}`
    if (obj.ok) return `✅ ${label}: ${JSON.stringify(obj.result ?? obj).slice(0, 2000)}`
    return JSON.stringify(data).slice(0, 2000)
  }
  return JSON.stringify(data).slice(0, 2000)
}
