# Privacy policy

noverview does not collect personal data, and it sends nothing to its author or to any third party.

## What it stores

These settings are saved in your browser's extension storage and never leave it:

- `enabled`: whether the extension is on.
- `linksMode`: the Links only setting.
- `extraPages`: how many extra results pages to load.
- `pageLimit`: when Google last rate-limited the extension, and the limit that applies until it expires.

Fetched results pages are cached in the tab's session storage on google.com, so going back and forward doesn't fetch them again. Pages from an earlier search are dropped the next time extra pages are fetched for a different search, and all of them are cleared when the tab is closed.

## Network requests

When **Search results** is set above about 8, the extension requests Google's next results pages for the search you made (for example `www.google.com/search?q=…&start=10`). The requests go only to Google and are sent from your browser with your existing Google cookies, the same as clicking Next. With the setting at about 8, the extension makes no requests.

## Permissions

- Storage: saves the settings listed above.
- Access to www.google.com: lets the extension change Google Search pages and fetch the extra results pages.

## Third parties

The extension does not use third-party services or APIs, and it does not load remote code.

## Changes

This policy is updated when the extension's behavior changes.
