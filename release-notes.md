# 2.0.0 (26071)
[feature release]

## Release Notes

- Refreshed the icons to reflect the new branding.
- Added support for OpenTubeX, Invidious and Piped, with the option to choose between them or FreeTube as the default redirection target.
- Added an optional keyboard shortcut to redirect the current tab, configurable to replace the tab or open a new one.
- Refined the options, popup, and introduction layouts with shared component styles.
- Added a direct Options button to the introduction screen and social links in the popup footer.
- Added Finnish (by Ricky-Tigg) localization and refreshed Estonian and Dutch strings for the updated URL rules UI.
- Improved YouTube URL and embed detection to correctly match subdomains instead of relying on substring checks.
- Made context menu redirects, icon updates, and URL rule loading more reliable on startup.
- Hardened the iframe placeholder against unsafe HTML in replacement text.

> [!WARNING]
> For Firefox, the `-unsigned.xpi` artifact will most likely not install. Use the signed version (`-signed.xpi`) or download from the [Firefox Add-ons](https://addons.mozilla.org/firefox/addon/redirecttube/). For Chromium-based browsers, download the `-chromium-unsigned.zip` and load it unpacked in Developer Mode or download from the [Chrome Web Store](https://chromewebstore.google.com/detail/jpbaggklodpddjcadlebabhiopjkjfjh/).
