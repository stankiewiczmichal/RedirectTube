const extensionApi = typeof chrome !== "undefined" ? chrome : browser;


let redirecttubeAutoRedirect = "autoRedirectLinksNo";
let redirecttubeIframeBehavior = "iframeBehaviorReplace";
let redirecttubeIframeEnhancedPreview = false;
let redirecttubeButtonLabel =
    localStorage.getItem("redirecttubeButtonName") || getDefaultButtonLabel();
let isTopLevelDocument = false;
let iframeSettingsReady = false;
let redirecttubeUrlRulesConfig = getDefaultUrlRulesConfig();
let redirecttubeSelectedPlayer = "freetube";
let redirecttubePreferredInvidiousInstance = "https://yewtu.be";
let redirecttubePreferredPipedInstance = "https://piped.video";

const iframeMetadata = new WeakMap();
const iframePlaceholderUrl = extensionApi.runtime.getURL(
    "iframe-placeholder.html"
);
const iframePlaceholderOrigin = new URL(iframePlaceholderUrl).origin;
let iframeObserver = null;
let iframeScanScheduled = false;

try {
    isTopLevelDocument = window.top === window;
} catch (error) {
    isTopLevelDocument = true;
}

initializeIframeHandling();
window.addEventListener("message", handleIframePromptMessage, false);

if (isTopLevelDocument) {
    document.addEventListener("click", handleDocumentClick, true);
    syncThemePreference();
    loadRuntimeSettings();
    installUrlChangeTracking();
}

function normalizeIframeBehavior(value) {
    if (!value) {
        return null;
    }
    if (value === "iframeBehaviorNone" || value === "iframeBehaviorReplace") {
        return value;
    }
    if (value === "iframeBehaviorButton") {
        return "iframeBehaviorReplace";
    }
    return null;
}

function syncThemePreference() {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    function notifyBackground() {
        extensionApi.runtime.sendMessage({
            message: RUNTIME_MESSAGES.redirecttubeTheme,
            isDark: mediaQuery.matches,
        });
    }

    notifyBackground();
    if (typeof mediaQuery.addEventListener === "function") {
        mediaQuery.addEventListener("change", notifyBackground);
    } else if (typeof mediaQuery.addListener === "function") {
        mediaQuery.addListener(notifyBackground);
    }
}

function initializeIframeHandling() {
    if (document.readyState === "loading") {
        document.addEventListener(
            "DOMContentLoaded",
            () => {
                startIframeObserver();
                scheduleIframeProcessing();
            },
            { once: true }
        );
        return;
    }
    startIframeObserver();
    scheduleIframeProcessing();
}

function startIframeObserver() {
    if (iframeObserver || typeof MutationObserver !== "function") {
        return;
    }

    const target = document.body || document.documentElement;
    if (!target) {
        requestAnimationFrame(startIframeObserver);
        return;
    }

    iframeObserver = new MutationObserver((mutations) => {
        if (!isIframeMonitoringEnabled()) {
            return;
        }

        const shouldRescan = mutations.some((mutation) => {
            if (mutation.type === "attributes" &&
                mutation.target.tagName === "IFRAME") {
                return true;
            }

            if (mutation.type === "childList") {
                return nodesContainIframe(mutation.addedNodes);
            }

            return false;
        });

        if (shouldRescan) {
            scheduleIframeProcessing();
        }
    });

    iframeObserver.observe(target, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ["src"],
    });
}

function nodesContainIframe(nodes) {
    for (const node of nodes) {
        if (!node || node.nodeType !== Node.ELEMENT_NODE) {
            continue;
        }
        if (node.tagName === "IFRAME") {
            return true;
        }
        if (typeof node.querySelector === "function" &&
            node.querySelector("iframe")) {
            return true;
        }
    }
    return false;
}

function scheduleIframeProcessing() {
    if (iframeScanScheduled) {
        return;
    }
    iframeScanScheduled = true;
    setTimeout(() => {
        iframeScanScheduled = false;
        applyIframeBehavior();
    }, 50);
}

function applyIframeBehavior() {
    if (!iframeSettingsReady) {
        return;
    }
    if (isReplaceBehavior()) {
        processPlaceholderIframes();
    } else {
        restoreAllProcessedIframes();
    }
}

function processPlaceholderIframes() {
    const iframes = document.querySelectorAll("iframe");
    iframes.forEach((iframe) => {
        if (shouldInterceptIframe(iframe)) {
            replaceIframeWithPlaceholder(iframe);
        }
    });
}

function isReplaceBehavior() {
    return redirecttubeIframeBehavior === "iframeBehaviorReplace";
}

function isIframeMonitoringEnabled() {
    return isReplaceBehavior();
}

function restoreAllProcessedIframes() {
    const placeholders = document.querySelectorAll(
        "iframe[data-redirecttube-state='placeholder']"
    );
    placeholders.forEach((iframe) => restoreIframeToOriginal(iframe));
}

function shouldInterceptIframe(iframe) {
    if (!iframe || iframe.dataset.redirecttubeBypass === "true") {
        return false;
    }
    if (iframeMetadata.has(iframe)) {
        return false;
    }
    const srcAttribute = iframe.getAttribute("src") || "";
    if (!srcAttribute) {
        return false;
    }
    if (!isYoutubeEmbedSrc(srcAttribute)) {
        return false;
    }
    if (iframe.src && iframe.src.startsWith(iframePlaceholderOrigin)) {
        return false;
    }
    return true;
}

function replaceIframeWithPlaceholder(iframe) {
    const originalSrc = iframe.getAttribute("src") || iframe.src;
    if (!originalSrc) {
        return;
    }
    const iframeTitle =
        iframe.getAttribute("title") ||
        iframe.title ||
        iframe.getAttribute("aria-label") ||
        "";

    iframeMetadata.set(iframe, {
        originalSrc,
    });
    iframe.dataset.redirecttubeState = "placeholder";

    const placeholderUrl = buildPlaceholderUrl(originalSrc, iframeTitle);
    iframe.src = placeholderUrl;
}

function buildPlaceholderUrl(videoUrl, title = "") {
    const label = redirecttubeButtonLabel || "Watch on";
    const params = new URLSearchParams({
        video: videoUrl,
        label,
        enhancedPreview: redirecttubeIframeEnhancedPreview ? "1" : "0",
    });
    if (redirecttubeIframeEnhancedPreview && title) {
        params.set("title", title);
    }
    return `${iframePlaceholderUrl}?${params.toString()}`;
}

function restoreIframeToOriginal(iframe, options = {}) {
    const metadata = iframeMetadata.get(iframe);
    if (!metadata) {
        return;
    }

    iframeMetadata.delete(iframe);

    if (options.persistBypass) {
        iframe.dataset.redirecttubeBypass = "true";
    } else {
        iframe.removeAttribute("data-redirecttube-bypass");
    }

    iframe.removeAttribute("data-redirecttube-state");

    if (iframe.getAttribute("src") !== metadata.originalSrc) {
        iframe.src = metadata.originalSrc;
    }
}

function isYoutubeEmbedSrc(src) {
    return (
        src.includes("youtube.com/embed") ||
        src.includes("youtube-nocookie.com/embed")
    );
}

function handleIframePromptMessage(event) {
    if (!event || event.origin !== iframePlaceholderOrigin) {
        return;
    }

    const data = event.data;
    if (!data || data.type !== "redirecttubeIframeAction") {
        return;
    }

    const targetIframe = findIframeByContentWindow(event.source);
    if (!targetIframe) {
        return;
    }

    const metadata = iframeMetadata.get(targetIframe);
    if (!metadata) {
        return;
    }

    if (data.action === "freetube") {
        redirecttubeOpenInSelectedPlayer(metadata.originalSrc);
        return;
    }

    if (data.action === "youtube") {
        restoreIframeToOriginal(targetIframe, { persistBypass: true });
    }
}

function findIframeByContentWindow(sourceWindow) {
    const frames = document.getElementsByTagName("iframe");
    for (const frame of frames) {
        try {
            if (frame.contentWindow === sourceWindow) {
                return frame;
            }
        } catch (error) {
            continue;
        }
    }
    return null;
}

extensionApi.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") {
        return;
    }

    const shouldNotifyCurrentUrl = Boolean(changes.urlRulesConfig);
    if (
        changes.iframeBehavior ||
        changes.iframeButton ||
        changes.iframeEnhancedPreview ||
        changes.autoRedirectLinks ||
        changes.urlRulesConfig
    ) {
        loadRuntimeSettings(shouldNotifyCurrentUrl);
    }
});

function loadRuntimeSettings(shouldNotifyCurrentUrl = false) {
    extensionApi.storage.local.get(
        [
            STORAGE_KEYS.iframeBehavior,
            STORAGE_KEYS.iframeButton,
            STORAGE_KEYS.iframeEnhancedPreview,
            STORAGE_KEYS.autoRedirectLinks,
            STORAGE_KEYS.urlRulesConfig,
            STORAGE_KEYS.selectedPlayer,
            STORAGE_KEYS.preferredInvidiousInstance,
            STORAGE_KEYS.preferredPipedInstance,
        ],
        (result = {}) => {
            const previousBehavior = redirecttubeIframeBehavior;
            const normalizedBehavior =
                normalizeIframeBehavior(result[STORAGE_KEYS.iframeBehavior]) ||
                normalizeIframeBehavior(result[STORAGE_KEYS.iframeButton]) ||
                "iframeBehaviorReplace";

            redirecttubeIframeBehavior = normalizedBehavior;
            redirecttubeIframeEnhancedPreview =
                result[STORAGE_KEYS.iframeEnhancedPreview] === true;
            redirecttubeAutoRedirect =
                result[STORAGE_KEYS.autoRedirectLinks] || "autoRedirectLinksNo";

            redirecttubeUrlRulesConfig = normalizeUrlRulesConfig(
                result[STORAGE_KEYS.urlRulesConfig]
            );

            redirecttubeSelectedPlayer =
                result[STORAGE_KEYS.selectedPlayer] || "freetube";
            redirecttubePreferredInvidiousInstance =
                result[STORAGE_KEYS.preferredInvidiousInstance] || "https://yewtu.be";
            redirecttubePreferredPipedInstance =
                result[STORAGE_KEYS.preferredPipedInstance] || "https://piped.video";

            const shouldRefresh =
                !iframeSettingsReady ||
                redirecttubeIframeBehavior !== previousBehavior;
            iframeSettingsReady = true;
            if (shouldRefresh) {
                scheduleIframeProcessing();
            }

            if (shouldNotifyCurrentUrl && isTopLevelDocument) {
                notifyCurrentUrl();
            }
        }
    );
}

function installUrlChangeTracking() {
    notifyCurrentUrl();

    window.addEventListener("popstate", notifyCurrentUrl);
    window.addEventListener("hashchange", notifyCurrentUrl);
    window.addEventListener("pageshow", notifyCurrentUrl);

    patchHistoryMethod("pushState");
    patchHistoryMethod("replaceState");
}

function patchHistoryMethod(methodName) {
    if (methodName === "pushState") {
        const originalMethod = history.pushState;
        if (typeof originalMethod !== "function") {
            return;
        }

        history.pushState = function () {
            const result = originalMethod.apply(this, arguments);
            notifyCurrentUrl();
            return result;
        };
        return;
    }

    if (methodName === "replaceState") {
        const originalMethod = history.replaceState;
        if (typeof originalMethod !== "function") {
            return;
        }

        history.replaceState = function () {
            const result = originalMethod.apply(this, arguments);
            notifyCurrentUrl();
            return result;
        };
    }
}

function notifyCurrentUrl() {
    if (!isTopLevelDocument) {
        return;
    }

    extensionApi.runtime.sendMessage({
        message: RUNTIME_MESSAGES.currentUrlChanged,
        url: window.location.href,
    });
}

function handleDocumentClick(event) {
    if (redirecttubeAutoRedirect !== "autoRedirectLinksYes") {
        return;
    }
    if (event.defaultPrevented || event.button !== 0) {
        return;
    }
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
    }

    const anchor = event.target.closest("a[href]");
    if (!anchor) {
        return;
    }

    if (anchor.hasAttribute("download")) {
        return;
    }

    const targetAttribute =
        (anchor.getAttribute("target") || "").toLowerCase();
    if (targetAttribute &&
        targetAttribute !== "_self" &&
        targetAttribute !== "_top" &&
        targetAttribute !== "_parent") {
        return;
    }

    const resolvedUrl = resolveAbsoluteUrl(anchor.getAttribute("href"));
    if (!resolvedUrl || !shouldRedirectUrl(resolvedUrl)) {
        return;
    }

    event.preventDefault();
    event.stopPropagation();
    redirecttubeOpenInSelectedPlayer(resolvedUrl);
}

function resolveAbsoluteUrl(href) {
    if (!href) {
        return null;
    }
    try {
        return new URL(href, window.location.href).toString();
    } catch (error) {
        return null;
    }
}

function shouldRedirectUrl(url) {
    return isRedirectableYoutubeUrl(url, redirecttubeUrlRulesConfig);
}

function redirecttubeOpenInSelectedPlayer(youtubeUrl) {
    let newUrl;
    
    switch (redirecttubeSelectedPlayer) {
        case "invidious":
            newUrl = convertYouTubeToInvidious(youtubeUrl, redirecttubePreferredInvidiousInstance);
            break;
        case "piped":
            newUrl = convertYouTubeToPiped(youtubeUrl, redirecttubePreferredPipedInstance);
            break;
        case "freetube":
        default:
            newUrl = "freetube://" + youtubeUrl;
            break;
    }
    
    window.location.assign(newUrl);
}

function convertYouTubeToInvidious(youtubeUrl, instanceUrl) {
    try {
        const url = new URL(youtubeUrl);
        const params = url.searchParams;
        const instanceBase = new URL(instanceUrl).origin;
        
        // Handle /watch?v=XXX
        if (url.pathname.includes("/watch") && params.has("v")) {
            const videoId = params.get("v");
            const listId = params.get("list");
            
            let invidiousUrl = instanceBase + "/watch?v=" + videoId;
            if (listId) {
                invidiousUrl += "&list=" + listId;
            }
            return invidiousUrl;
        }
        
        // Handle /playlist?list=XXX
        if (url.pathname.includes("/playlist") && params.has("list")) {
            const listId = params.get("list");
            return instanceBase + "/playlist?list=" + listId;
        }
        
        // Handle youtu.be/videoId (short URL)
        if (url.hostname.includes("youtu.be") && url.pathname.length > 1) {
            const videoId = url.pathname.substring(1).split(/[?#]/)[0];
            if (videoId) {
                let invidiousUrl = instanceBase + "/watch?v=" + videoId;
                if (params.has("list")) {
                    invidiousUrl += "&list=" + params.get("list");
                }
                return invidiousUrl;
            }
        }
        
        // If URL is recognized but has no video/playlist ID, return instance URL
            // For other cases (channels, users, @handles, etc.), preserve path and query
            const suffix = (url.pathname || "") + (url.search || "");
            return instanceBase + suffix;
    } catch (error) {
        console.error("Error converting to Invidious URL:", error);
        return youtubeUrl;
    }
}

function convertYouTubeToPiped(youtubeUrl, instanceUrl) {
    try {
        const url = new URL(youtubeUrl);
        const params = url.searchParams;
        const instanceBase = new URL(instanceUrl).origin;
        
        // Handle /watch?v=XXX
        if (url.pathname.includes("/watch") && params.has("v")) {
            const videoId = params.get("v");
            const listId = params.get("list");
            
            let pipedUrl = instanceBase + "/watch?v=" + videoId;
            if (listId) {
                pipedUrl += "&list=" + listId;
            }
            return pipedUrl;
        }
        
        // Handle /playlist?list=XXX
        if (url.pathname.includes("/playlist") && params.has("list")) {
            const listId = params.get("list");
            return instanceBase + "/playlist?list=" + listId;
        }
        
        // Handle youtu.be/videoId (short URL)
        if (url.hostname.includes("youtu.be") && url.pathname.length > 1) {
            const videoId = url.pathname.substring(1).split(/[?#]/)[0];
            if (videoId) {
                let pipedUrl = instanceBase + "/watch?v=" + videoId;
                if (params.has("list")) {
                    pipedUrl += "&list=" + params.get("list");
                }
                return pipedUrl;
            }
        }
        
        // For other cases (channels, users, @handles, etc.), preserve path and query
        const suffix = (url.pathname || "") + (url.search || "");
        return instanceBase + suffix;
    } catch (error) {
        console.error("Error converting to Piped URL:", error);
        return youtubeUrl;
    }
}

function getDefaultButtonLabel() {
    if (
        extensionApi.i18n &&
        typeof extensionApi.i18n.getMessage === "function"
    ) {
        return (
            extensionApi.i18n.getMessage("ui_iframeButton_redirect") ||
            "Watch on"
        );
    }
    return "Watch on";
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

function isRedirectableYoutubeUrl(url, config = redirecttubeUrlRulesConfig) {
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

