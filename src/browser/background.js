const extensionApi = typeof chrome !== "undefined" ? chrome : browser;
if (typeof RUNTIME_MESSAGES === "undefined" && typeof importScripts === "function") {
    importScripts(extensionApi.runtime.getURL("shared.js"));
}

let cachedExtensionIcon = "redirecttube-color";
let cachedSelectedPlayer = "freetube";
let cachedPreferredInvidiousInstance = DEFAULT_PREFERRED_INVIDIOUS_INSTANCE;
let cachedPreferredPipedInstance = DEFAULT_PREFERRED_PIPED_INSTANCE;
let cachedShortcutEnabled = DEFAULT_SHORTCUT_ENABLED;
let cachedShortcutBehavior = DEFAULT_SHORTCUT_BEHAVIOR;
let cachedCloseRedirectTab = DEFAULT_CLOSE_REDIRECT_TAB;
let lastUrlAllowed = false;
let isDarkThemePreferred = false;
let currentMenuLang = null;
let urlRulesConfig = getDefaultUrlRulesConfig();
let settingsLoaded = false;
let settingsLoadPromise = null;
const tabAllowedState = new Map();

const SETTINGS_KEYS = [
    STORAGE_KEYS.extensionIcon,
    STORAGE_KEYS.selectedPlayer,
    STORAGE_KEYS.preferredInvidiousInstance,
    STORAGE_KEYS.preferredPipedInstance,
    STORAGE_KEYS.shortcutEnabled,
    STORAGE_KEYS.shortcutBehavior,
    STORAGE_KEYS.closeRedirectTab,
    STORAGE_KEYS.urlRulesConfig,
];

// buildRedirectUrl hands these two players off to a desktop app through a
// custom scheme, which leaves the tab behind empty. Invidious and Piped get an
// ordinary web page that the user wants to keep.
const APP_SCHEME_PREFIXES = [
    PLAYERS.freetube + "://",
    PLAYERS.opentubex + "://",
];
const REDIRECT_TAB_CLOSE_DELAY_MS = 1500;

// This background context is not persistent: a service worker on Chromium, an
// event page on Firefox and Safari. Either one is torn down after a short idle
// period and re-evaluated on the next event, which resets every cached value
// above to its default. runtime.onStartup only fires when the browser starts
// and storage.onChanged only fires when a value actually changes, so neither
// one runs after such a restart. The cache therefore has to be refilled from
// storage on every script load, and every listener has to wait for that read
// before acting on it — otherwise a redirect silently uses the default player
// instead of the one the user picked.
function ensureSettingsLoaded() {
    if (settingsLoaded) {
        return Promise.resolve();
    }
    if (!settingsLoadPromise) {
        settingsLoadPromise = new Promise((resolve) => {
            extensionApi.storage.local.get(SETTINGS_KEYS, (result = {}) => {
                settingsLoadPromise = null;
                if (extensionApi.runtime.lastError) {
                    // Keep the defaults out of the cache so the next listener
                    // retries instead of pinning them over the stored values.
                    resolve();
                    return;
                }
                applyLoadedSettings(result);
                settingsLoaded = true;
                resolve();
            });
        });
    }
    return settingsLoadPromise;
}

function applyLoadedSettings(result) {
    cachedExtensionIcon =
        result[STORAGE_KEYS.extensionIcon] || "redirecttube-color";
    cachedSelectedPlayer = result[STORAGE_KEYS.selectedPlayer] || "freetube";
    cachedPreferredInvidiousInstance =
        result[STORAGE_KEYS.preferredInvidiousInstance] ||
        DEFAULT_PREFERRED_INVIDIOUS_INSTANCE;
    cachedPreferredPipedInstance =
        result[STORAGE_KEYS.preferredPipedInstance] ||
        DEFAULT_PREFERRED_PIPED_INSTANCE;
    cachedShortcutEnabled =
        result[STORAGE_KEYS.shortcutEnabled] !== undefined
            ? Boolean(result[STORAGE_KEYS.shortcutEnabled])
            : DEFAULT_SHORTCUT_ENABLED;
    cachedShortcutBehavior =
        result[STORAGE_KEYS.shortcutBehavior] || DEFAULT_SHORTCUT_BEHAVIOR;
    cachedCloseRedirectTab =
        result[STORAGE_KEYS.closeRedirectTab] !== undefined
            ? Boolean(result[STORAGE_KEYS.closeRedirectTab])
            : DEFAULT_CLOSE_REDIRECT_TAB;
    urlRulesConfig = normalizeUrlRulesConfig(
        result[STORAGE_KEYS.urlRulesConfig]
    );
}

function safeCreateContextMenu() {
    try {
        createContextMenu();
    } catch (error) {
        // ignore: avoid breaking startup if i18n isn't ready yet
    }
}

// Warm the cache as early as possible on every script load.
ensureSettingsLoaded();

extensionApi.runtime.onInstalled.addListener((details) => {
    if (details.reason === "install") {
        extensionApi.tabs.create({ url: "introduction.html" });
        extensionApi.storage.local.set({
            extensionIcon: "redirecttube-color",
            autoRedirectLinks: "autoRedirectLinksNo",
            iframeBehavior: "iframeBehaviorReplace",
            iframeEnhancedPreview: false,
            urlRulesConfig: getDefaultUrlRulesConfig(),
            shortcutEnabled: DEFAULT_SHORTCUT_ENABLED,
            shortcutBehavior: DEFAULT_SHORTCUT_BEHAVIOR,
            timestampLinks: DEFAULT_TIMESTAMP_LINKS,
            closeRedirectTab: DEFAULT_CLOSE_REDIRECT_TAB,
        });
    }

    ensureSettingsLoaded().then(safeCreateContextMenu);
});

extensionApi.runtime.onStartup.addListener(() => {
    ensureSettingsLoaded().then(() => {
        updateActionIcon();
        // Ensure context menu reflects the loaded selected player
        safeCreateContextMenu();
    });
});

extensionApi.runtime.onMessage.addListener((request, sender) => {
    const tabId = sender && sender.tab && typeof sender.tab.id === "number"
        ? sender.tab.id
        : undefined;

    if (request.message === RUNTIME_MESSAGES.currentUrlChanged && request.url) {
        // Ensure urlRulesConfig is loaded before evaluating the URL
        ensureSettingsLoaded().then(() => handleUrlChange(request.url, tabId));
        return;
    }

    if (request.message === RUNTIME_MESSAGES.redirecttubeTheme) {
        isDarkThemePreferred = Boolean(request.isDark);
        ensureSettingsLoaded().then(() => updateActionIcon(tabId));
    }
});

extensionApi.tabs.onActivated.addListener(({ tabId }) => {
    ensureSettingsLoaded().then(() => {
        if (tabAllowedState.has(tabId)) {
            updateActionIcon(tabId);
            return;
        }
        extensionApi.tabs.get(tabId, (tab) => {
            if (extensionApi.runtime.lastError || !tab || !tab.url) {
                return;
            }
            tabAllowedState.set(
                tabId,
                isRedirectableYoutubeUrl(tab.url, urlRulesConfig)
            );
            updateActionIcon(tabId);
        });
    });
});

extensionApi.tabs.onRemoved.addListener((tabId) => {
    tabAllowedState.delete(tabId);
});

extensionApi.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") {
        return;
    }
    if (changes[STORAGE_KEYS.urlRulesConfig]) {
        urlRulesConfig = normalizeUrlRulesConfig(
            changes[STORAGE_KEYS.urlRulesConfig].newValue
        );
    }

    if (changes[STORAGE_KEYS.extensionIcon]) {
        cachedExtensionIcon = changes[STORAGE_KEYS.extensionIcon].newValue || "redirecttube-color";
        updateActionIcon();
        tabAllowedState.forEach((_isAllowed, tabId) => updateActionIcon(tabId));
    }

    if (changes[STORAGE_KEYS.selectedPlayer]) {
        cachedSelectedPlayer =
            changes[STORAGE_KEYS.selectedPlayer].newValue || "freetube";
        // Refresh context menu so title reflects the newly selected player
        safeCreateContextMenu();
    }
    if (changes[STORAGE_KEYS.preferredInvidiousInstance]) {
        cachedPreferredInvidiousInstance =
            changes[STORAGE_KEYS.preferredInvidiousInstance].newValue ||
            DEFAULT_PREFERRED_INVIDIOUS_INSTANCE;
    }
    if (changes[STORAGE_KEYS.preferredPipedInstance]) {
        cachedPreferredPipedInstance =
            changes[STORAGE_KEYS.preferredPipedInstance].newValue ||
            DEFAULT_PREFERRED_PIPED_INSTANCE;
    }
    if (changes[STORAGE_KEYS.shortcutEnabled]) {
        cachedShortcutEnabled = Boolean(changes[STORAGE_KEYS.shortcutEnabled].newValue);
    }
    if (changes[STORAGE_KEYS.shortcutBehavior]) {
        cachedShortcutBehavior =
            changes[STORAGE_KEYS.shortcutBehavior].newValue || DEFAULT_SHORTCUT_BEHAVIOR;
    }
    if (changes[STORAGE_KEYS.closeRedirectTab]) {
        cachedCloseRedirectTab = Boolean(
            changes[STORAGE_KEYS.closeRedirectTab].newValue
        );
    }
});

extensionApi.commands.onCommand.addListener((command) => {
    if (command !== "redirect-current-tab") {
        return;
    }
    ensureSettingsLoaded().then(() => {
        if (!cachedShortcutEnabled) {
            return;
        }
        extensionApi.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const tab = tabs && tabs[0];
            if (!tab || !tab.url) {
                return;
            }
            if (!isRedirectableYoutubeUrl(tab.url, urlRulesConfig)) {
                return;
            }
            const newUrl = buildRedirectUrl(
                tab.url,
                cachedSelectedPlayer,
                cachedPreferredInvidiousInstance,
                cachedPreferredPipedInstance
            );
            if (cachedShortcutBehavior === "newTab") {
                openRedirectTab(newUrl);
            } else {
                extensionApi.tabs.update(tab.id, { url: newUrl });
            }
        });
    });
});

// A custom-scheme navigation hands the link to the desktop app without ever
// committing a document, so the tab RedirectTube opened for it stays behind
// empty. No API reports the app window opening, so the tab is closed after a
// short delay instead — and only when the user asked for it, because on Firefox
// the external-protocol confirmation dialog belongs to this tab and closing it
// would cancel the launch.
function openRedirectTab(url) {
    if (!cachedCloseRedirectTab || !isAppHandoffUrl(url)) {
        extensionApi.tabs.create({ url });
        return;
    }

    extensionApi.tabs.create({ url }, (tab) => {
        if (
            extensionApi.runtime.lastError ||
            !tab ||
            typeof tab.id !== "number"
        ) {
            return;
        }
        setTimeout(
            () => closeRedirectTab(tab.id, url),
            REDIRECT_TAB_CLOSE_DELAY_MS
        );
    });
}

function closeRedirectTab(tabId, redirectUrl) {
    extensionApi.tabs.get(tabId, (tab) => {
        if (extensionApi.runtime.lastError || !tab) {
            return;
        }
        // Anything other than a blank tab means the user navigated it
        // somewhere, so it is no longer ours to close.
        const currentUrl = tab.url || "";
        if (
            currentUrl &&
            currentUrl !== "about:blank" &&
            currentUrl !== redirectUrl
        ) {
            return;
        }
        extensionApi.tabs.remove(tabId);
    });
}

function isAppHandoffUrl(url) {
    return APP_SCHEME_PREFIXES.some((prefix) => url.startsWith(prefix));
}

function handleUrlChange(url, tabId) {
    if (!url) {
        return;
    }
    const isAllowed = isRedirectableYoutubeUrl(url, urlRulesConfig);
    lastUrlAllowed = isAllowed;
    if (typeof tabId === "number") {
        tabAllowedState.set(tabId, isAllowed);
    }
    updateActionIcon(tabId);
}

function updateActionIcon(tabId) {
    const isAllowed =
        typeof tabId === "number" && tabAllowedState.has(tabId)
            ? tabAllowedState.get(tabId)
            : lastUrlAllowed;
    const path = getIconPath(
        cachedExtensionIcon,
        isAllowed,
        isDarkThemePreferred
    );
    try {
        const resolvedPath =
            extensionApi && extensionApi.runtime && typeof extensionApi.runtime.getURL === "function"
                ? extensionApi.runtime.getURL(path)
                : path;
        const details = { path: resolvedPath };
        if (typeof tabId === "number") {
            details.tabId = tabId;
        }
        extensionApi.action.setIcon(details);
    } catch (err) {
        console.error("Failed to set action icon:", err, { path, tabId });
    }
}

function getIconPath(preference, isAllowed, isDarkMode) {
    if (preference === "redirecttube-color") {
        return isAllowed
            ? "img/icns/redirecttube/color/allow/64.png"
            : "img/icns/redirecttube/color/disallow/64.png";
    }
    if (preference === "mono") {
        if (isDarkMode) {
            return isAllowed
                ? "img/icns/freetube/mono/white/allow/64.png"
                : "img/icns/freetube/mono/white/disallow/64.png";
        }
        return isAllowed
            ? "img/icns/freetube/mono/black/allow/64.png"
            : "img/icns/freetube/mono/black/disallow/64.png";
    }
    return isAllowed
        ? "img/icns/freetube/color/allow/64.png"
        : "img/icns/freetube/color/disallow/64.png";
}

extensionApi.contextMenus.onClicked.addListener((info) => {
    if (info.menuItemId !== "openInFreeTube" || !info.linkUrl) {
        return;
    }

    ensureSettingsLoaded().then(() => {
        const newUrl = buildRedirectUrl(
            info.linkUrl,
            cachedSelectedPlayer,
            cachedPreferredInvidiousInstance,
            cachedPreferredPipedInstance
        );

        // Open the redirect URL in a new tab to ensure the target player handles it.
        // Using tabs.create avoids potential failures when updating the originating tab
        // to a custom scheme (eg. freetube://) which some browsers may ignore.
        try {
            openRedirectTab(newUrl);
        } catch (err) {
            // Fallback: try updating the current tab if create failed
            try {
                if (typeof info.tabId === "number") {
                    extensionApi.tabs.update(info.tabId, { url: newUrl });
                } else {
                    extensionApi.tabs.update({ url: newUrl });
                }
            } catch (err2) {
                console.error("Failed to open redirect URL from context menu", err2, { newUrl });
            }
        }
    });
});

function createContextMenu() {
    const lang = getBrowserLocale();
    if (lang === currentMenuLang) {
        return;
    }
    currentMenuLang = lang;
    // ui.contextMenu.redirect names the extension rather than the selected
    // player, so the title depends only on the UI language and the guard above
    // keeps it current on its own.
    const title =
        getMessageByKey("ui.contextMenu.redirect") || "Open with RedirectTube";

    extensionApi.contextMenus.removeAll(() => {
        extensionApi.contextMenus.create({
            id: "openInFreeTube",
            title,
            contexts: ["link"],
            targetUrlPatterns: [
                "*://www.youtube.com/*",
                "*://youtube.com/*",
                "*://youtu.be/*",
            ],
        });
    });
}

function getBrowserLocale() {
    const raw =
        (extensionApi.i18n &&
            typeof extensionApi.i18n.getUILanguage === "function"
            ? extensionApi.i18n.getUILanguage()
            : navigator.language || "en") || "en";
    return (raw.split("-")[0] || "en").toLowerCase();
}

function getMessageByKey(key) {
    if (
        !key ||
        !extensionApi.i18n ||
        typeof extensionApi.i18n.getMessage !== "function"
    ) {
        return "";
    }
    const messageName = toMessageName(key);
    if (!messageName) {
        return "";
    }
    return extensionApi.i18n.getMessage(messageName) || "";
}

function toMessageName(key) {
    return key
        .split(".")
        .map((segment) => segment.trim())
        .filter(Boolean)
        .join("_")
        .replace(/[^A-Za-z0-9_]/g, "_");
}
