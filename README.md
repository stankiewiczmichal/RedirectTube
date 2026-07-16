<p align="center">
   <img src="/assets/banner.png" title="RedirectTube">
   <br>
   <a href="https://addons.mozilla.org/firefox/addon/redirecttube/"><img src="https://img.shields.io/amo/rating/redirecttube%40stankiewiczm.eu?style=for-the-badge&logo=firefox&logoColor=white&label=Mozilla%20Add-ons%20Rating"></a> <a href="https://chromewebstore.google.com/detail/jpbaggklodpddjcadlebabhiopjkjfjh/"><img src="https://img.shields.io/chrome-web-store/rating/jpbaggklodpddjcadlebabhiopjkjfjh?style=for-the-badge&logo=chromewebstore&logoColor=white&label=Chrome%20Web%20Store%20Rating"></a>
   <br>
   <img src="https://app.codacy.com/project/badge/Grade/5fbd04d2b238474ca9c21fc62de6ecda"><a href="https://translate.codeberg.org/engage/redirecttube/"><img src="https://translate.codeberg.org/widget/redirecttube/ui/svg-badge.svg"></a>
</a>
</p>

## Open YouTube links in FreeTube, OpenTubeX, Invidious or Piped

RedirectTube is a browser extension that redirects YouTube links to the privacy-friendly player of your choice: [FreeTube](https://freetubeapp.io/), [OpenTubeX](https://opentubex.com/), Invidious or Piped. It is available for Firefox and Chromium-based browsers, and can be built locally for Safari on macOS.

> [!NOTE]
> RedirectTube does not yet support Firefox for Android.

## Supported players

| Player | Type | Notes |
| --- | --- | --- |
| [FreeTube](https://freetubeapp.io/) | Desktop app | Redirects via the `freetube://` link handler. |
| [OpenTubeX](https://opentubex.org/) | Desktop app | Redirects via the `opentubex://` link handler. |
| Invidious | Web instance | Redirects to your preferred Invidious instance (defaults to `yewtu.be`). |
| Piped | Web instance | Redirects to your preferred Piped instance (defaults to `piped.video`). |

> [!IMPORTANT]
> On Linux, FreeTube and OpenTubeX are not supported because of limitations in how these apps register their `freetube://` and `opentubex://` link handlers on that platform. Invidious and Piped are unaffected, since they redirect to a web instance rather than a desktop app, and work normally on Linux.

## Installation

### Mozilla Firefox

#### Method 1: Firefox Add-ons (recommended)

You can install RedirectTube from the Firefox Add-ons.

[![Get the Add-on](https://extensionworkshop.com/assets/img/documentation/publish/get-the-addon-178x60px.dad84b42.png)](https://addons.mozilla.org/pl/firefox/addon/redirecttube/)

#### Method 2: Manual Firefox installation

1. Download the latest release of RedirectTube (file that ends with `-signed.xpi`) from the [releases page](https://github.com/stankiewiczmichal/RedirectTube/releases/). If you see an alert about installing add-ons from untrusted sources, click "Continue installation" and don’t proceed with the next steps.
2. Open the downloaded file in Firefox.
3. Click "Add" to install the extension.
   And that's it! RedirectTube is now installed in your browser.

#### Method 3: Firefox developer mode

This method is for developers and advanced users.

> [!IMPORTANT]
> If you restart your browser, the extension will be disabled.

1. Clone the repository.
2. Run `node scripts/build.js --browser gecko --no-zip` to generate the Firefox bundle inside `dist/gecko`.
3. Go to `about:debugging#/runtime/this-firefox`.
4. Click "Load Temporary Add-on".
5. Select the `manifest.json` file located in `dist/gecko`.
   The extension is now installed in your browser.

### Chromium-based browsers

The Chromium package supports Chrome, Chromium, Edge, Brave, Vivaldi, and other Chromium-based browsers.

### Method 1: Chrome Web Store (recommended)
You can install RedirectTube from the Chrome Web Store.

[![Get it on Chrome Web Store](https://developer.chrome.com/static/docs/webstore/branding/image/206x58-chrome-web-bcb82d15b2486.png)](https://chromewebstore.google.com/detail/jpbaggklodpddjcadlebabhiopjkjfjh/)

#### Method 2: Manual Chromium installation via developer mode

> [!NOTE]
> The Chromium build is unsigned and must be reloaded manually whenever you download a new release.

1. Download the latest release archive that ends with `-chromium-unsigned.zip` from the [releases page](https://github.com/stankiewiczmichal/RedirectTube/releases/).
2. Extract the ZIP file to a directory you want to keep (the browser needs to access the extracted files).
3. Open `chrome://extensions` (or the equivalent extensions page in your Chromium browser).
4. Enable **Developer mode**.
5. Click **Load unpacked** and select the directory you extracted in step 2.
   The extension will appear in the toolbar once the folder is loaded.

### Safari (macOS, local install only)

> [!NOTE]
> RedirectTube is not published on the App Store for Safari. This section documents how to build and run it locally on your own Mac using Xcode — there is no signed/notarized package to download.

Prerequisites (either method): Xcode (from the Mac App Store) and an Apple ID signed into Xcode (Xcode → Settings → Accounts). A free personal Apple ID is enough for local use.

#### Method 1: Download the pre-built Xcode project (recommended)

1. Download the latest release archive that ends with `-safari-xcode-unsigned.zip` from the [releases page](https://github.com/stankiewiczmichal/RedirectTube/releases/) and extract it.
2. Continue from step 4 below.

#### Method 2: Build it yourself

1. Clone the repository and build the Safari bundle:
   ```
   node scripts/build.js --browser safari --no-zip
   ```
2. Convert it into an Xcode project (one-time step — the generated project references `dist/safari` by path, so later content edits only need step 1 again followed by step 4):
   ```
   xcrun safari-web-extension-converter dist/safari \
     --project-location dist/safari-xcode \
     --app-name "redirecttube" \
     --bundle-identifier eu.stankiewiczm.redirecttube \
     --macos-only --no-open --force
   ```

#### Finishing up (either method)

4. Open `RedirectTube/RedirectTube.xcodeproj` (inside the extracted zip, or at `dist/safari-xcode/RedirectTube/RedirectTube.xcodeproj` if you built it yourself), set your Team under **Signing & Capabilities** for both the app and extension targets, then press **Cmd+R** to build and run.
5. In Safari: **Settings → Advanced** → enable "Show features for web developers"; **Settings → Developer** → enable "Allow Unsigned Extensions"; **Settings → Extensions** → enable RedirectTube; then grant it "Always Allow on Every Website" from the toolbar icon or the Extensions settings pane (Safari defaults host permissions to "ask", unlike Chromium/Firefox).

> [!IMPORTANT]
> Without a paid Apple Developer Program membership, the app's code signature expires 7 days after building — reopen Xcode and press Cmd+R to renew it. "Allow Unsigned Extensions" also resets every time Safari fully quits and must be re-enabled each session.

> [!NOTE]
> Keep `--app-name` and `--bundle-identifier` all-lowercase, as above — `safari-web-extension-converter` can otherwise derive mismatched casing between the app and extension targets' `PRODUCT_BUNDLE_IDENTIFIER`, causing Xcode build errors like "Embedded binary is not signed with the same certificate as the parent app". If that happens anyway, check both values in `RedirectTube.xcodeproj/project.pbxproj` — the extension's must equal the app's identifier plus `.Extension` — fix any mismatch, then Product → Clean Build Folder (⇧⌘K) before rebuilding.

## Local builds

RedirectTube keeps a single shared codebase in `src/browser`. Use the provided helper to prepare browser-specific bundles:

```
node scripts/build.js
```

The script requires Node.js 16.7+ (for `fs.cp`) and the `zip` CLI. It produces unpacked bundles at `dist/chromium`, `dist/gecko`, and `dist/safari`, along with ready-to-distribute archives under `dist/packages` for chromium and gecko (the `safari` target intentionally skips archive packaging, since Safari needs an Xcode-converted project rather than a zip/xpi — see the Safari installation section above). Useful flags:

- `--browser chromium,gecko,safari` – build only the listed browsers.
- `--no-zip` – skip archive creation if you just need the unpacked directory (handy for temporary installs in Firefox/Chromium).

Once built, load the browser-specific folder from `dist/` via your browser's developer mode, or upload the generated archives wherever you distribute the extension.

## Usage

On first launch, RedirectTube walks you through choosing and setting up your preferred player (FreeTube, OpenTubeX, Invidious, or Piped). You can change this choice at any time from the options page.

### Via button or via context menu

Click the RedirectTube button in the toolbar to open the current YouTube video in your selected player. Right-click a YouTube link and select "Open with RedirectTube" to open the video in your selected player.

![](/assets/info.png)

### Keyboard shortcut

RedirectTube can redirect the current tab using a keyboard shortcut. Enable it and configure whether it replaces the current tab or opens a new one from the extension options.

### Auto-redirect
You can enable auto-redirect in the extension options. When enabled, any YouTube link you open will automatically open in your selected player instead.

### Embedded videos
When a page embeds a YouTube video, RedirectTube can replace it with a placeholder that lets you choose whether to watch it in your selected player or in the original YouTube frame. This behavior, along with which YouTube paths (videos, shorts, feeds, search, etc.) get redirected, can be customized from the options page.

## Issues

If you encounter any issues, please report them on the [issues page](https://github.com/stankiewiczmichal/RedirectTube/issues/).

<picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=stankiewiczmichal/RedirectTube&type=date&theme=dark&legend=top-left" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=stankiewiczmichal/RedirectTube&type=date&legend=top-left" />
   <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=stankiewiczmichal/RedirectTube&type=date&legend=top-left" />
 </picture>

## Translation

If your language is not yet supported by RedirectTube, you can change that! Help develop the extension by translating it into your language.
Translations are managed via [Weblate](https://hosted.weblate.org/engage/redirecttube/).

[![](https://hosted.weblate.org/widget/redirecttube/ui/multi-auto.svg)](https://hosted.weblate.org/engage/redirecttube/)

## License

RedirectTube is licensed under CC BY-NC-SA 4.0. For details, please refer to the [LICENSE](LICENSE.md).

> [!NOTE]
> **RedirectTube** is not affiliated with YouTube, FreeTube, OpenTubeX, Invidious, or Piped, or their creators. The names and logos of these apps and websites are the property of their respective creators. They may be subject to their own licenses.
