// Reads/writes toggle state and checks site access

const access = document.getElementById("access");

// Checkbox id -> storage key. Every setting defaults to on.
const SETTINGS = {
    toggle: "enabled",
};

// Rocker: checkbox id -> linksMode value. Checking one unchecks the other;
// unchecking the checked one turns links only off.
const LINKS_MODES = {
    linksNoImages: "noImages",
    linksWithImages: "withImages",
};

// Must match host_permissions in manifest.json. Firefox treats MV3 host
// permissions as optional, so the content script only runs on every search
// once the user has granted this.
const SITE = { origins: ["*://www.google.com/*"] };

for (const [id, key] of Object.entries(SETTINGS)) {
    const box = document.getElementById(id);

    // load initial state from storage and set the checkbox accordingly
    browser.storage.local.get(key).then((state) => {
        box.checked = state[key] ?? true;
    });

    // update storage when the checkbox is changed
    box.addEventListener("change", () => {
        browser.storage.local.set({ [key]: box.checked });
    });
}

function showLinksMode(mode) {
    for (const [id, value] of Object.entries(LINKS_MODES)) {
        document.getElementById(id).checked = value === mode;
    }
}

browser.storage.local.get("linksMode").then((state) => {
    showLinksMode(state.linksMode ?? "noImages");
});

for (const [id, value] of Object.entries(LINKS_MODES)) {
    const box = document.getElementById(id);
    box.addEventListener("change", () => {
        const mode = box.checked ? value : "off";
        showLinksMode(mode);
        browser.storage.local.set({ linksMode: mode });
    });
}

// ===== SEARCH RESULTS =====
// Four buttons that set extraPages, labelled with the estimated number of
// web results they give (about 8 per Google page). more.js writes pageLimit
// after a rate limit; buttons above its cap are disabled. Reset clears it.

const RESULTS_PER_PAGE = 8;
const PAGE_CHOICES = [0, 1, 2, 4];
const MAX_EXTRA = 4;
const DAY = 24 * 60 * 60 * 1000;

const results = document.getElementById("results");
const limitNote = document.getElementById("pageLimitNote");
const limitText = document.getElementById("pageLimitText");

const estimate = (extra) => `~${(extra + 1) * RESULTS_PER_PAGE}`;

let extraPages = 1;
let pageLimit = null;

for (const extra of PAGE_CHOICES) {
    const button = document.createElement("button");
    button.textContent = estimate(extra);
    button.addEventListener("click", () => {
        extraPages = extra;
        showResults();
        browser.storage.local.set({ extraPages });
    });
    results.append(button);
}

const clock = (t) =>
    new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });

// The cap is 4 (no limit) when unset or older than 24h
function currentCap() {
    if (!pageLimit || Date.now() - pageLimit.setAt > DAY) return MAX_EXTRA;
    return Math.min(pageLimit.cap, MAX_EXTRA);
}

// A stored value without its own button (e.g. 3 from the old slider) marks
// the largest choice below it
function showResults() {
    const cap = currentCap();
    const shown = Math.max(...PAGE_CHOICES.filter((c) => c <= Math.min(extraPages, cap)));
    [...results.children].forEach((button, i) => {
        const extra = PAGE_CHOICES[i];
        button.disabled = extra > cap;
        button.title = extra > cap ? "Limited by Google" : "";
        button.setAttribute("aria-pressed", String(extra === shown));
    });

    limitNote.hidden = cap === MAX_EXTRA;
    if (limitNote.hidden) return;
    let text = `Google rate-limited at ${clock(pageLimit.setAt)}. ` +
        `Limited to ${estimate(cap)} results until tomorrow`;
    if (pageLimit.pausedUntil > Date.now()) {
        text += `, paused until ${clock(pageLimit.pausedUntil)}`;
    }
    limitText.textContent = text + ".";
}

browser.storage.local.get(["extraPages", "pageLimit"]).then((state) => {
    extraPages = state.extraPages ?? 1;
    pageLimit = state.pageLimit ?? null;
    showResults();
});

document.getElementById("pageLimitReset").addEventListener("click", (e) => {
    e.preventDefault();
    pageLimit = null;
    showResults();
    browser.storage.local.remove("pageLimit");
});

browser.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !("pageLimit" in changes)) return;
    pageLimit = changes.pageLimit.newValue ?? null;
    showResults();
});

browser.permissions.contains(SITE).then((granted) => {
    access.hidden = granted;
});

// request() must run directly from the click to count as a user action
document.getElementById("grant").addEventListener("click", () => {
    browser.permissions.request(SITE).then((granted) => {
        access.hidden = granted;
    });
});
