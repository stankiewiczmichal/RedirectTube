const extensionApi = typeof chrome !== "undefined" ? chrome : browser;
if (typeof RUNTIME_MESSAGES === "undefined" && typeof importScripts === "function") {
    importScripts(extensionApi.runtime.getURL("shared.js"));
}

let cachedExtensionIcon = "redirecttube-color";
let cachedSelectedPlayer = "freetube";
let cachedPreferredInvidiousInstance = DEFAULT_PREFERRED_INVIDIOUS_INSTANCE;
let cachedPreferredPipedInstance = DEFAULT_PREFERRED_PIPED_INSTANCE;
let lastUrlAllowed = false;
let isDarkThemePreferred = false;
let currentMenuLang = null;
let urlRulesConfig = getDefaultUrlRulesConfig();

extensionApi.runtime.onInstalled.addListener((details) => {
    if (details.reason === "install") {
        extensionApi.tabs.create({ url: "introduction.html" });
        extensionApi.storage.local.set({
            extensionIcon: "redirecttube-color",
            autoRedirectLinks: "autoRedirectLinksNo",
            iframeBehavior: "iframeBehaviorReplace",
            iframeEnhancedPreview: false,
            urlRulesConfig: getDefaultUrlRulesConfig(),
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
            updateActionIcon();
        }
    );

    loadUrlRulesConfig();
    createContextMenu();
});

extensionApi.runtime.onMessage.addListener((request) => {
    if (request.message === RUNTIME_MESSAGES.currentUrlChanged && request.url) {
        handleUrlChange(request.url);
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
    extensionApi.action.setIcon({ path });
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

        if (typeof info.tabId === "number") {
            extensionApi.tabs.update(info.tabId, { url: newUrl });
        } else {
            extensionApi.tabs.update({ url: newUrl });
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
    const perPlayerKey = "ui.contextMenu.redirect_" + (cachedSelectedPlayer || "freetube");
    let title = getMessageByKey(perPlayerKey) || getMessageByKey("ui.contextMenu.redirect") || "Open in FreeTube";
    const playerLabel = getMessageByKey("options.playerSettings." + (cachedSelectedPlayer || "freetube")) || (cachedSelectedPlayer || "freetube");
    title = title.replace(/FreeTube/g, playerLabel);

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

function normalizeIframeBehavior(value) {
    if (!value) {
        return null;
    }
    if (value === "iframeBehaviorReplace" || value === "iframeBehaviorNone") {
        return value;
    }
    if (value === "iframeBehaviorButton" || value === "iframeButtonYes") {
        return "iframeBehaviorReplace";
    }
    if (value === "iframeButtonNo") {
        return "iframeBehaviorNone";
    }
    return null;
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
