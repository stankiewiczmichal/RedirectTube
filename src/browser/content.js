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
    const newUrl = buildRedirectUrl(
        youtubeUrl,
        redirecttubeSelectedPlayer,
        redirecttubePreferredInvidiousInstance,
        redirecttubePreferredPipedInstance
    );
    window.location.assign(newUrl);
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

