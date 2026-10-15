# noverview

A browser extension that removes the AI-generated overviews from Google Search results.

> **Chrome is not supported at the moment.** The Chrome build does not work. Use Firefox.

## Features

* Removes Google AI Overviews automatically
* Runs as results load
* Lightweight, with minimal performance impact
* Toggle to turn it on or off at any time
* No data collection; everything runs locally

## Installation

### Firefox (add-ons store)

The listing is pending review by Mozilla. Once approved, install it from https://addons.mozilla.org/en-US/firefox/addon/google-ai-overview-purger/

### Firefox (manual)

1. Go to `about:addons`
2. Click the gear icon, then **Install Add-on From File**
3. Select the packaged `.zip`

### Chrome

Unsupported and not working. The extension is not on the Chrome Web Store. The manual steps below load the `main` branch for development only:

1. Clone this repository:

   ```bash
   git clone https://github.com/cli-geek/noverview.git
   ```
2. Open `chrome://extensions/`
3. Enable **Developer mode**
4. Click **Load unpacked**
5. Select the project folder

## How it works

A content script on Google Search pages watches the DOM for changes and removes AI Overview elements as they appear. All processing happens locally in your browser.

## Privacy

The extension does not collect user data, track browsing, or make any external requests. The only stored value is a local setting for turning the extension on or off.

## Development

### Project structure

```
.
├── manifest.json
├── content.js
├── background.js
├── popup.html
├── popup.js
├── browser-polyfill.js
├── icons/
```

### Cross-browser support

Each browser has its own branch:

* `main`: Chrome (Manifest V3, service worker). Currently not working.
* `firefox`: Firefox (background scripts)

The code is the same on both branches apart from `manifest.json`, which differs to meet Mozilla's and Google's manifest requirements.

## Roadmap

* Fix Chrome support
* Make selectors survive Google UI changes
* Add per-site or per-feature toggles
* Improve performance
* Improve the popup UI

## License

Mozilla Public License 2.0.

## AI usage attestation

This program and its documentation were created with AI assistance.

Requirements specified at the discretion of cli-geek.

Output reviewed and verified.

## Support

If you find this useful, consider starring the repo.
