// Reads/writes toggle state and checks site access

const access = document.getElementById("access");

// Checkbox id -> storage key. Every setting defaults to on.
const SETTINGS = {
    toggle: "enabled",
    compact: "compact",
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

// ===== MORE PAGES =====
// Slider for extraPages (0-4, default 1). more.js writes pageLimit after a
// rate limit; positions above its cap are drawn struck out and the slider
// clamps to the cap. Reset clears pageLimit.

const slider = document.getElementById("extraPages");
const sliderValue = document.getElementById("extraPagesValue");
const ticks = document.getElementById("pageTicks");
const limitNote = document.getElementById("pageLimitNote");
const limitText = document.getElementById("pageLimitText");
const MAX_EXTRA = 4;
const DAY = 24 * 60 * 60 * 1000;

let pageLimit = null;

for (let i = 0; i <= MAX_EXTRA; i++) {
    const tick = document.createElement("span");
    tick.textContent = i;
    ticks.append(tick);
}

const clock = (t) =>
    new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });

// The cap is 4 (no limit) when unset or older than 24h
function currentCap() {
    if (!pageLimit || Date.now() - pageLimit.setAt > DAY) return MAX_EXTRA;
    return Math.min(pageLimit.cap, MAX_EXTRA);
}

function showPageLimit() {
    const cap = currentCap();
    [...ticks.children].forEach((tick, i) => {
        tick.classList.toggle("over", i > cap);
        tick.title = i > cap ? "Limited by Google" : "";
    });

    limitNote.hidden = cap === MAX_EXTRA;
    if (limitNote.hidden) return;
    let text = `Google rate-limited at ${clock(pageLimit.setAt)}. ` +
        `Limited to ${cap} ${cap === 1 ? "page" : "pages"} until tomorrow`;
    if (pageLimit.pausedUntil > Date.now()) {
        text += `, paused until ${clock(pageLimit.pausedUntil)}`;
    }
    limitText.textContent = text + ".";
}

function showSlider(value) {
    slider.value = value;
    sliderValue.textContent = value;
}

browser.storage.local.get(["extraPages", "pageLimit"]).then((state) => {
    showSlider(state.extraPages ?? 1);
    pageLimit = state.pageLimit ?? null;
    showPageLimit();
});

slider.addEventListener("input", () => {
    sliderValue.textContent = slider.value;
});

slider.addEventListener("change", () => {
    const value = Math.min(Number(slider.value), currentCap());
    showSlider(value);
    browser.storage.local.set({ extraPages: value });
});

document.getElementById("pageLimitReset").addEventListener("click", (e) => {
    e.preventDefault();
    pageLimit = null;
    showPageLimit();
    browser.storage.local.remove("pageLimit");
});

browser.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !("pageLimit" in changes)) return;
    pageLimit = changes.pageLimit.newValue ?? null;
    showPageLimit();
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
