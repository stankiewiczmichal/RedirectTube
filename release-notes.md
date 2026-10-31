# 2.1.0 (26101)
[feature release]

## Release Notes

- Added an option to leave YouTube timestamp links alone, so a link pointing into the video you are already watching seeks in place instead of restarting it in your player.
- Added an option to close the tab opened for FreeTube or OpenTubeX once the video has been handed over to the desktop app.
- Added a Safari build for local installation on macOS, with setup instructions in the README.
- Fixed the selected player silently falling back to FreeTube after the browser restarted the extension's background context; the keyboard shortcut setting and the URL rules were reset the same way.
- Fixed Invidious and Piped redirects dropping the playback offset, so a link with a timestamp no longer starts the video from the beginning.
- Fixed the iFrame placeholder's main button reading "Watch on" with no player name when OpenTubeX was the selected player.
- Added Polish translations for the new settings.

> [!WARNING]
> For Firefox, the `-unsigned.xpi` artifact will most likely not install. Use the signed version (`-signed.xpi`) or download from the [Firefox Add-ons](https://addons.mozilla.org/firefox/addon/redirecttube/). For Chromium-based browsers, download the `-chromium-unsigned.zip` and load it unpacked in Developer Mode or download from the [Chrome Web Store](https://chromewebstore.google.com/detail/jpbaggklodpddjcadlebabhiopjkjfjh/).
