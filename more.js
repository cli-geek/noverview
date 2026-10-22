// Fetches Google's next results pages in the background and adds their web
// results under page 1. Reads ALL_TAB, ORGANIC, RESULT, INERT and root from
// content.js (same content-script scope). The MutationObserver there then
// hides AI and non-link blocks in the added pages, so none of that is done
// here. See plans/append-pages.md.

// ===== CONFIG =====

const PAGE_ATTR = 'data-noverview-page';
const MAX_EXTRA = 4;
const GAP_MS = 750;
const TIMEOUT_MS = 8000;
const PAUSE_MS = 30 * 60 * 1000;
const CAP_MS = 24 * 60 * 60 * 1000;
const CACHE_PREFIX = 'noverview-page:';

// Defaults until storage answers: a missing value always means the default
let enabled = true;
let extraPages = 1;
let pageLimit = null;

// Page 1's Next link (the start offset is recomputed from it), and the URL
// of the next page to fetch
let nextLink = null;
let fetchUrl = null;
// Set by the first failure or the end of the results: no retries per page view
let stopped = false;
let running = false;
let again = false;
let lastRequest = 0;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// ===== RATE LIMIT =====

// The cap is 4 (no limit) when unset or older than 24h
function capNow() {
    if (!pageLimit || Date.now() - pageLimit.setAt > CAP_MS) return MAX_EXTRA;
    return Math.min(pageLimit.cap, MAX_EXTRA);
}

function paused() {
    return !!pageLimit && pageLimit.pausedUntil > Date.now();
}

// Only this file writes pageLimit (the popup's Reset clears it)
function recordBlock(succeeded) {
    const now = Date.now();
    const cap = Math.max(0, Math.min(succeeded, capNow() - 1));
    pageLimit = { cap, pausedUntil: now + PAUSE_MS, setAt: now };
    browser.storage.local.set({ pageLimit });
}

// ===== FETCH =====

class Blocked extends Error {}

function wrappers() {
    return [...document.querySelectorAll(`[${PAGE_ATTR}]`)];
}

async function getHtml(url) {
    const key = CACHE_PREFIX + url;
    try {
        const cached = sessionStorage.getItem(key);
        if (cached) return { html: cached, cached: true };
    } catch {}

    const wait = lastRequest + GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequest = Date.now();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
        // content.fetch sends the request as the page in Firefox
        const win = globalThis.content ?? window;
        const res = await win.fetch(url, { signal: controller.signal });
        if (res.status === 429 || res.url.includes('/sorry/')) throw new Blocked();
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return { html: await res.text(), cached: false };
    } finally {
        clearTimeout(timer);
    }
}

// sessionStorage is shared with Google's own scripts (about 5MB per origin),
// so store pages without their scripts (most of a page's size) and drop
// pages cached for other searches
function cache(url, doc) {
    const q = new URL(url).searchParams.get('q');
    try {
        for (let i = sessionStorage.length - 1; i >= 0; i--) {
            const key = sessionStorage.key(i);
            if (!key.startsWith(CACHE_PREFIX)) continue;
            const keyQ = new URL(key.slice(CACHE_PREFIX.length)).searchParams.get('q');
            if (keyQ !== q) sessionStorage.removeItem(key);
        }
        const copy = doc.cloneNode(true);
        for (const s of copy.querySelectorAll('script')) s.remove();
        sessionStorage.setItem(CACHE_PREFIX + url, copy.documentElement.outerHTML);
    } catch {}
}

// ===== PICK RESULTS =====

function resultOf(h3) {
    return h3.closest(RESULT) ?? h3.closest('a');
}

// Climb while the wrapper holds nothing but this one result
function blockOf(result, rso) {
    let node = result;
    while (node.parentElement && node.parentElement !== rso) {
        const parent = node.parentElement;
        let kids = 0;
        for (const child of parent.children) {
            if (!INERT.has(child.tagName)) kids++;
        }
        if (kids > 1) break;
        if ([...parent.querySelectorAll(ORGANIC)].some(h => resultOf(h) !== result)) break;
        node = parent;
    }
    return node;
}

function shownHrefs() {
    const hrefs = new Set();
    for (const h3 of document.querySelectorAll('#rso ' + ORGANIC)) {
        const a = h3.closest('a');
        if (a) hrefs.add(a.href);
    }
    return hrefs;
}

function pickBlocks(doc) {
    const rso = doc.getElementById('rso');
    const seen = shownHrefs();
    const done = new Set();
    const blocks = [];
    for (const h3 of rso.querySelectorAll(ORGANIC)) {
        const result = resultOf(h3);
        if (done.has(result)) continue;
        done.add(result);
        const href = h3.closest('a')?.href;
        if (!href || seen.has(href)) continue;
        seen.add(href);
        blocks.push(blockOf(result, rso));
    }
    return blocks;
}

// ===== CLEAN =====

const UNSAFE = 'script, iframe, object, embed';
const URL_ATTRS = ['href', 'src', 'action', 'formaction', 'xlink:href'];

function sanitize(wrapper) {
    for (const el of wrapper.querySelectorAll(UNSAFE)) el.remove();
    for (const el of [wrapper, ...wrapper.querySelectorAll('*')]) {
        for (const attr of [...el.attributes]) {
            const name = attr.name.toLowerCase();
            const bad = name.startsWith('on') ||
                (URL_ATTRS.includes(name) && /^[\s\u0000-\u001f]*javascript:/i.test(attr.value));
            if (bad) el.removeAttribute(attr.name);
        }
    }
}

// A selector list that styles bare elements (`div`, `body`, `table,div,span,p`
// ...) rather than classes or ids. Such sheets restyle the whole page.
const BARE_ELEMENTS = /(^|[{},])\s*(html|body|div|span|p|table|a|h3)\s*[,{]/i;

// Appended blocks can use classes whose CSS only ships with their own page.
// Only class/id-based sheets are copied: a stray global sheet (like the one
// in Google's <noscript> fallback) would blank page 1.
function copyStyles(doc) {
    const have = new Set([...document.querySelectorAll('style')].map(s => s.textContent));
    for (const style of doc.querySelectorAll('style')) {
        if (have.has(style.textContent) || BARE_ELEMENTS.test(style.textContent)) continue;
        have.add(style.textContent);
        document.head.append(document.importNode(style, true));
    }
}

// ===== INSERT =====

// After the last page-1 result, or the last appended page
function insertAfterPage1(wrapper) {
    const all = wrappers();
    if (all.length) {
        all[all.length - 1].after(wrapper);
        return;
    }
    const rso = document.getElementById('rso');
    const h3s = [...rso.querySelectorAll(ORGANIC)];
    const last = resultOf(h3s[h3s.length - 1]);
    blockOf(last, rso).after(wrapper);
}

function append(doc, blocks) {
    const wrapper = document.createElement('div');
    wrapper.setAttribute(PAGE_ATTR, String(wrappers().length + 2));
    for (const block of blocks) wrapper.append(document.importNode(block, true));
    sanitize(wrapper);
    copyStyles(doc);
    insertAfterPage1(wrapper);
}

// ===== PAGINATION =====

// Hides appended pages above the slider and points Next at the first page
// not yet shown
function syncPages() {
    let shown = 0;
    for (const w of wrappers()) {
        const hide = Number(w.getAttribute(PAGE_ATTR)) - 1 > extraPages;
        w.hidden = hide;
        if (!hide) shown++;
    }
    const next = document.getElementById('pnnext');
    if (!next || !nextLink) return;
    const url = new URL(nextLink, location.href);
    const base = Number(params.get('start')) || 0;
    url.searchParams.set('start', String(base + 10 * (shown + 1)));
    next.setAttribute('href', url.pathname + url.search);
}

// ===== RUN =====

function wanted() {
    if (!enabled || stopped) return 0;
    return Math.min(extraPages, capNow());
}

async function run() {
    if (running) {
        again = true;
        return;
    }
    if (!ALL_TAB || document.hidden) return;
    if (paused() || !document.getElementById('rso')) return;
    const link = document.getElementById('pnnext');
    if (!link) return;
    nextLink ??= link.getAttribute('href');
    // Page 1's link first, then the link in each fetched page
    fetchUrl ??= new URL(nextLink, location.href).href;

    running = true;
    try {
        syncPages();
        let have = wrappers().length;
        while (have < wanted() && !paused()) {
            const { html, cached } = await getHtml(fetchUrl);
            const doc = new DOMParser().parseFromString(html, 'text/html');
            // DOMParser runs with scripting off, so <noscript> content (Google's
            // "table,div,span,p{display:none}" fallback) parses as live markup
            for (const n of doc.querySelectorAll('noscript')) n.remove();
            if (!doc.getElementById('rso')) throw new Blocked();
            if (!cached) cache(fetchUrl, doc);

            const blocks = pickBlocks(doc);
            if (!blocks.length) {
                stopped = true;
                break;
            }
            append(doc, blocks);
            have++;

            const next = doc.getElementById('pnnext');
            if (!next) {
                stopped = true;
                break;
            }
            fetchUrl = new URL(next.getAttribute('href'), location.href).href;
            syncPages();
        }
    } catch (err) {
        stopped = true;
        if (err instanceof Blocked) recordBlock(wrappers().length);
    } finally {
        running = false;
        syncPages();
    }
    if (again) {
        again = false;
        run();
    }
}

// ===== SETTINGS =====

browser.storage.local.get(['enabled', 'extraPages', 'pageLimit']).then(res => {
    enabled = res.enabled ?? true;
    extraPages = res.extraPages ?? 1;
    pageLimit = res.pageLimit ?? null;
    start();
});

browser.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if ('enabled' in changes) enabled = changes.enabled.newValue ?? true;
    if ('extraPages' in changes) extraPages = changes.extraPages.newValue ?? 1;
    if ('pageLimit' in changes) pageLimit = changes.pageLimit.newValue ?? null;
    start();
});

// Waits for the DOM and for the tab to be visible
function start() {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start, { once: true });
    } else if (document.hidden) {
        document.addEventListener('visibilitychange', start, { once: true });
    } else {
        run();
    }
}
