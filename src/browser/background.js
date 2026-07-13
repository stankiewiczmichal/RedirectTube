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
let lastUrlAllowed = false;
let isDarkThemePreferred = false;
let currentMenuLang = null;
let urlRulesConfig = getDefaultUrlRulesConfig();
let urlRulesConfigLoaded = false;

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
        });
    }

    loadUrlRulesConfig();
    createContextMenu();
});

extensionApi.runtime.onStartup.addListener(() => {
    extensionApi.storage.local.get(
        [
            STORAGE_KEYS.extensionIcon,
            STORAGE_KEYS.selectedPlayer,
            STORAGE_KEYS.preferredInvidiousInstance,
            STORAGE_KEYS.preferredPipedInstance,
            STORAGE_KEYS.shortcutEnabled,
            STORAGE_KEYS.shortcutBehavior,
        ],
        (result = {}) => {
            cachedExtensionIcon =
                result[STORAGE_KEYS.extensionIcon] || "redirecttube-color";
            cachedSelectedPlayer =
                result[STORAGE_KEYS.selectedPlayer] || "freetube";
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
            updateActionIcon();
            // Ensure context menu reflects the loaded selected player
            try {
                createContextMenu();
            } catch (e) {
                // ignore: avoid breaking startup if i18n isn't ready yet
            }
        }
    );

    loadUrlRulesConfig();
    createContextMenu();
});

extensionApi.runtime.onMessage.addListener((request) => {
    if (request.message === RUNTIME_MESSAGES.currentUrlChanged && request.url) {
        // Ensure urlRulesConfig is loaded before evaluating the URL (avoid race with startup)
        if (!urlRulesConfigLoaded) {
            extensionApi.storage.local.get(STORAGE_KEYS.urlRulesConfig, (result = {}) => {
                urlRulesConfig = normalizeUrlRulesConfig(result[STORAGE_KEYS.urlRulesConfig]);
                urlRulesConfigLoaded = true;
                handleUrlChange(request.url);
            });
        } else {
            handleUrlChange(request.url);
        }
        return;
    }

    if (request.message === RUNTIME_MESSAGES.redirecttubeTheme) {
        isDarkThemePreferred = Boolean(request.isDark);
        updateActionIcon();
    }
});

extensionApi.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") {
        return;
    }
    if (changes[STORAGE_KEYS.urlRulesConfig]) {
        loadUrlRulesConfig();
    }

    if (changes[STORAGE_KEYS.extensionIcon]) {
        cachedExtensionIcon = changes[STORAGE_KEYS.extensionIcon].newValue || "redirecttube-color";
        updateActionIcon();
    }

    if (changes[STORAGE_KEYS.selectedPlayer]) {
        cachedSelectedPlayer =
            changes[STORAGE_KEYS.selectedPlayer].newValue || "freetube";
        // Refresh context menu so title reflects the newly selected player
        try {
            createContextMenu();
        } catch (e) {
            // ignore
        }
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
});

extensionApi.commands.onCommand.addListener((command) => {
    if (command !== "redirect-current-tab") {
        return;
    }
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
            extensionApi.tabs.create({ url: newUrl });
        } else {
            extensionApi.tabs.update(tab.id, { url: newUrl });
        }
    });
});

function handleUrlChange(url) {
    if (!url) {
        return;
    }
    lastUrlAllowed = isRedirectableYoutubeUrl(url, urlRulesConfig);
    updateActionIcon();
}

function updateActionIcon() {
    const path = getIconPath(
        cachedExtensionIcon,
        lastUrlAllowed,
        isDarkThemePreferred
    );
    try {
        const resolvedPath =
            extensionApi && extensionApi.runtime && typeof extensionApi.runtime.getURL === "function"
                ? extensionApi.runtime.getURL(path)
                : path;
        extensionApi.action.setIcon({ path: resolvedPath });
    } catch (err) {
        console.error("Failed to set action icon:", err, { path });
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

function loadUrlRulesConfig() {
    extensionApi.storage.local.get(STORAGE_KEYS.urlRulesConfig, (result = {}) => {
        urlRulesConfig = normalizeUrlRulesConfig(
            result[STORAGE_KEYS.urlRulesConfig]
        );
        urlRulesConfigLoaded = true;
    });
}

extensionApi.contextMenus.onClicked.addListener((info) => {
    if (info.menuItemId === "openInFreeTube" && info.linkUrl) {
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
            extensionApi.tabs.create({ url: newUrl });
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
    }
});

function createContextMenu() {
    const lang = getBrowserLocale();
    if (lang === currentMenuLang) {
        return;
    }
    currentMenuLang = lang;
    // Prefer a player-specific context menu title when possible
    const playerKey = (cachedSelectedPlayer || "freetube");
    const perPlayerKey = "ui.contextMenu.redirect_" + playerKey;
    // Allow i18n strings to include a placeholder like {player} or %PLAYER%.
    let title =
        getMessageByKey(perPlayerKey) || getMessageByKey("ui.contextMenu.redirect") || "Open in {player}";
    const playerLabel =
        getMessageByKey("options.playerSettings." + playerKey) ||
        (playerKey === "freetube" ? "FreeTube" : playerKey);
    // Replace common placeholder formats and any literal "FreeTube"
    title = title
        .replace(/\{player\}/g, playerLabel)
        .replace(/%PLAYER%/g, playerLabel)
        .replace(/FreeTube/g, playerLabel);

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
