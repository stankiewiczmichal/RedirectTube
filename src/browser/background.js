const extensionApi = typeof chrome !== "undefined" ? chrome : browser;
if (typeof RUNTIME_MESSAGES === "undefined" && typeof importScripts === "function") {
    importScripts(extensionApi.runtime.getURL("shared.js"));
}

let cachedExtensionIcon = "color";
let lastUrlAllowed = false;
let isDarkThemePreferred = false;
let currentMenuLang = null;
let urlRulesConfig = getDefaultUrlRulesConfig();

extensionApi.runtime.onInstalled.addListener((details) => {
    if (details.reason === "install") {
        extensionApi.tabs.create({ url: "introduction.html" });
        extensionApi.storage.local.set({
            extensionIcon: "color",
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
    extensionApi.storage.local.get(STORAGE_KEYS.extensionIcon, (result) => {
        cachedExtensionIcon = result[STORAGE_KEYS.extensionIcon] || "color";
        updateActionIcon();
    });

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
        cachedExtensionIcon = changes[STORAGE_KEYS.extensionIcon].newValue || "color";
        updateActionIcon();
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
    if (preference === "mono") {
        if (isDarkMode) {
            return isAllowed
                ? "img/icns/mono/white/allow/64.png"
                : "img/icns/mono/white/disallow/64.png";
        }
        return isAllowed
            ? "img/icns/mono/black/allow/64.png"
            : "img/icns/mono/black/disallow/64.png";
    }
    return isAllowed
        ? "img/icns/color/allow/64.png"
        : "img/icns/color/disallow/64.png";
}

function loadUrlRulesConfig() {
    extensionApi.storage.local.get(STORAGE_KEYS.urlRulesConfig, (result = {}) => {
        urlRulesConfig = normalizeUrlRulesConfig(
            result[STORAGE_KEYS.urlRulesConfig]
        );
    });
}

function getDefaultUrlRulesConfig() {
    return {
        mode: "allowList",
        allow: [...DEFAULT_ALLOW_PREFIXES],
        deny: [...DEFAULT_DENY_PREFIXES],
    };
}

function normalizeUrlRulesConfig(rawConfig) {
    const base = getDefaultUrlRulesConfig();
    if (!rawConfig || typeof rawConfig !== "object") {
        return base;
    }
    const mode = rawConfig.mode === "allowAllExcept" ? "allowAllExcept" : "allowList";
    const allow = Array.isArray(rawConfig.allow)
        ? normalizePrefixList(rawConfig.allow)
        : base.allow;
    return {
        mode,
        allow,
        deny: base.deny,
    };
}

function normalizePrefixList(list) {
    return Array.from(
        new Set(
            list
                .map((item) => (typeof item === "string" ? item.trim() : ""))
                .filter((item) => item.startsWith("/"))
                .map((item) => item.toLowerCase())
                .filter(Boolean)
        )
    );
}

function pathMatchesPrefix(path, prefixes) {
    return prefixes.some((prefix) => path.startsWith(prefix));
}

function isRedirectableYoutubeUrl(url, config = urlRulesConfig) {
    try {
        const parsedUrl = new URL(url);
        const host = parsedUrl.hostname.toLowerCase();

        if (host === "youtu.be") {
            return parsedUrl.pathname.length > 1;
        }

        if (!host.endsWith("youtube.com")) {
            return false;
        }

        const path = (parsedUrl.pathname || "/").toLowerCase();
        const normalizedConfig = normalizeUrlRulesConfig(config);

        if (pathMatchesPrefix(path, normalizedConfig.deny)) {
            return false;
        }

        if (normalizedConfig.mode === "allowAllExcept") {
            return true;
        }

        return pathMatchesPrefix(path, normalizedConfig.allow);
    } catch (error) {
        return false;
    }
}

extensionApi.contextMenus.onClicked.addListener((info) => {
    if (info.menuItemId === "openInFreeTube" && info.linkUrl) {
        const newUrl = "freetube://" + info.linkUrl;
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
    const title =
        getMessageByKey("ui.contextMenu.redirect") || "Open in FreeTube";

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
