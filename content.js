// content.css hides the exact blocks it can match by attribute. This script
// finds the same blocks (plus any "AI Overview" heading, in case Google
// renames things), widens each to its wrapper, and marks the wrapper with
// [data-noverview-hide]. Nothing is removed from the page, so turning the
// toggle off restores everything.

const HIDE_ATTR = 'data-noverview-hide';
const HEADINGS = '[role="heading"], h1, h2, h3';
const ANCHORS = '#Odp5De, [data-initq]';

// Organic results are a link wrapping an h3. A hidden block must never
// contain one.
const ORGANIC = 'a h3';

// Heading text per UI language. Unknown languages still get the CSS rules.
const LABELS = new Set([
    'ai overview',
    'übersicht mit ki',
    'aperçu ia',
    'vista creada con ia',
    'ai による概要',
]);

const STOPS = '#rso, #center_col, #rcnt, #search, body';
const INERT = new Set(['SCRIPT', 'STYLE', 'LINK', 'TEMPLATE']);

const root = document.documentElement;

// AI blocks found so far, mapped to the wrapper currently marked for each
const anchors = new Map();

function isLabel(el) {
    const text = el.textContent.replace(/\s+/g, ' ').trim().toLowerCase();
    return text.length < 40 && LABELS.has(text);
}

function onlyChild(el) {
    let count = 0;
    for (const child of el.parentElement.children) {
        if (!INERT.has(child.tagName) && ++count > 1) return false;
    }
    return true;
}

// Climb while the wrapper holds nothing but this block. Results that load
// later can change the answer, so this is recomputed on every flush.
function blockFor(anchor) {
    let node = anchor.closest(ANCHORS) ?? anchor;
    while (
        node.parentElement &&
        !node.parentElement.matches(STOPS) &&
        onlyChild(node) &&
        !node.parentElement.querySelector(ORGANIC)
    ) {
        node = node.parentElement;
    }
    return node;
}

function collect(scope) {
    if (scope.matches(ANCHORS)) anchors.set(scope, null);
    for (const el of scope.querySelectorAll(ANCHORS)) anchors.set(el, null);

    const headings = scope.matches(HEADINGS)
        ? [scope]
        : scope.querySelectorAll(HEADINGS);
    for (const h of headings) {
        if (isLabel(h)) anchors.set(h, null);
    }
}

function mark() {
    for (const [anchor, marked] of anchors) {
        if (!anchor.isConnected) {
            marked?.removeAttribute(HIDE_ATTR);
            anchors.delete(anchor);
            continue;
        }
        const block = blockFor(anchor);
        if (block === marked) continue;

        marked?.removeAttribute(HIDE_ATTR);
        block.setAttribute(HIDE_ATTR, '');
        anchors.set(anchor, block);
    }
}

// ===== LINKS ONLY =====
// Marks every block in the results list that holds no web result (videos,
// images, People also ask, ...) with [data-noverview-extra]. The Images
// block gets the value "images" so content.css can keep it in the
// "with images" mode.

const EXTRA_ATTR = 'data-noverview-extra';

// Other tabs (Images, News, ...) have no `a h3` results and would be emptied.
// udm=14 is the "Web" tab, which is the same list.
const params = new URLSearchParams(location.search);
const ALL_TAB = !params.has('tbm') && [null, '14'].includes(params.get('udm'));

// One web result, so sitelinks with their own h3 still count once
const RESULT = '[data-rpos]';

// The Images block is the only one linking to the Images tab
function isImages(block) {
    for (const a of block.querySelectorAll('a[href*="udm=2"], a[href*="tbm=isch"]')) {
        const p = new URL(a.href, location.href).searchParams;
        if (p.get('udm') === '2' || p.get('tbm') === 'isch') return true;
    }
    return false;
}

// A child holding one result is that result; holding several, it is a group
// that may mix results with other blocks, so look inside it.
function pruneWithin(container, results) {
    for (const child of container.children) {
        if (INERT.has(child.tagName)) continue;

        let n = 0;
        for (const r of results) if (child.contains(r)) n++;
        if (n === 0) {
            child.setAttribute(EXTRA_ATTR, isImages(child) ? 'images' : '');
        } else {
            child.removeAttribute(EXTRA_ATTR);
        }
        if (n > 1) pruneWithin(child, results);
    }
}

function prune() {
    const rso = ALL_TAB && document.getElementById('rso');
    if (!rso) return;

    const results = new Set();
    for (const h3 of rso.querySelectorAll(ORGANIC)) {
        results.add(h3.closest(RESULT) ?? h3.closest('a'));
    }
    pruneWithin(rso, results);
}

// ===== OBSERVER =====
// Added nodes are queued and handled once per frame. requestAnimationFrame
// runs before paint, so a streamed-in block is hidden before it is drawn.
const pending = new Set();
let scheduled = false;

function flush() {
    scheduled = false;
    for (const node of pending) {
        if (node.isConnected) collect(node);
    }
    pending.clear();
    mark();
    prune();
}

new MutationObserver(records => {
    for (const r of records) {
        for (const node of r.addedNodes) {
            // Heading text can arrive as a bare text node after the heading
            const el = node.nodeType === Node.ELEMENT_NODE
                ? node
                : node.parentElement?.closest(HEADINGS);
            if (el) pending.add(el);
        }
    }
    // Any insertion can change a wrapper's contents, so re-check even when
    // nothing new was queued
    if (!scheduled) {
        scheduled = true;
        requestAnimationFrame(flush);
    }
}).observe(document, { childList: true, subtree: true });

// ===== SETTINGS =====
// Each storage key maps to a root attribute and a function from the stored
// value to the attribute value; null removes the attribute. A missing value
// (first run) always means the default.

// On/off settings: on by default, attribute "off" when off
const onOff = v => (v === false ? 'off' : null);

// "noImages" (default) | "withImages" | "off"; set by the popup rocker
const linksMode = v => ({ off: 'off', withImages: 'images' })[v] ?? null;

const SETTINGS = {
    enabled: { attr: 'data-noverview', value: onOff },
    linksMode: { attr: 'data-noverview-links', value: linksMode },
    extraPages: { attr: 'data-noverview-more', value: v => (v === 0 ? 'off' : null) },
};

function apply(key, stored) {
    const { attr, value } = SETTINGS[key];
    const v = value(stored);
    if (v === null) {
        root.removeAttribute(attr);
    } else {
        root.setAttribute(attr, v);
    }
}

browser.storage.local.get(Object.keys(SETTINGS)).then(res => {
    for (const key in SETTINGS) apply(key, res[key]);
});

browser.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    for (const key in changes) {
        if (key in SETTINGS) apply(key, changes[key].newValue);
    }
});
