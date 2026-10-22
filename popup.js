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

browser.permissions.contains(SITE).then((granted) => {
    access.hidden = granted;
});

// request() must run directly from the click to count as a user action
document.getElementById("grant").addEventListener("click", () => {
    browser.permissions.request(SITE).then((granted) => {
        access.hidden = granted;
    });
});
