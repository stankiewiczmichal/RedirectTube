const RUNTIME_MESSAGES = Object.freeze({
    currentUrlChanged: "currentUrlChanged",
    redirecttubeTheme: "redirecttubeTheme",
});

const STORAGE_KEYS = Object.freeze({
    extensionIcon: "extensionIcon",
    urlRulesConfig: "urlRulesConfig",
    iframeBehavior: "iframeBehavior",
    iframeButton: "iframeButton",
    iframeEnhancedPreview: "iframeEnhancedPreview",
    autoRedirectLinks: "autoRedirectLinks",
    selectedPlayer: "selectedPlayer",
    preferredInvidiousInstance: "preferredInvidiousInstance",
    preferredPipedInstance: "preferredPipedInstance",
    introductionComplete: "introductionComplete",
    shortcutEnabled: "shortcutEnabled",
    shortcutBehavior: "shortcutBehavior",
});

const DEFAULT_ALLOW_PREFIXES = [
    "/watch",
    "/playlist",
    "/@",
    "/channel/",
    "/live/",
    "/shorts/",
    "/podcasts",
    "/gaming",
    "/feed/subscriptions",
    "/feed/library",
    "/feed/you",
    "/post/",
    "/hashtag/",
    "/results",
    "/",
];

const DEFAULT_DENY_PREFIXES = [
    "/signin",
    "/logout",
    "/login",
    "/oops",
    "/error",
    "/verify",
    "/consent",
    "/account",
    "/premium",
    "/paid_memberships",
    "/s/ads",
    "/pagead",
    "/embed/",
    "/iframe_api",
    "/api/",
    "/t/terms",
    "/about/",
    "/creator/",
    "/howyoutubeworks/",
    "/studio/",
];

const PLAYERS = Object.freeze({
    freetube: "freetube",
    invidious: "invidious",
    piped: "piped",
    opentubex: "opentubex",
});

const DEFAULT_SHORTCUT_ENABLED = true;
const DEFAULT_SHORTCUT_BEHAVIOR = "replaceTab";

const DEFAULT_PREFERRED_INVIDIOUS_INSTANCE = "https://yewtu.be";
const DEFAULT_PREFERRED_PIPED_INSTANCE = "https://piped.video";

function normalizePrefixList(list) {
    return Array.from(
        new Set(
            (Array.isArray(list) ? list : [])
                .map((item) => (typeof item === "string" ? item.trim() : ""))
                .filter((item) => item.startsWith("/"))
                .map((item) => item.toLowerCase())
                .filter(Boolean)
        )
    );
}

function pathMatchesPrefix(path, prefixes) {
    return (Array.isArray(prefixes) ? prefixes : []).some((prefix) =>
        path.startsWith(prefix)
    );
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
    const mode =
        rawConfig.mode === "allowAllExcept" ? "allowAllExcept" : "allowList";
    const allow = Array.isArray(rawConfig.allow)
        ? normalizePrefixList(rawConfig.allow)
        : base.allow;
    const deny = Array.isArray(rawConfig.deny)
        ? normalizePrefixList(rawConfig.deny)
        : base.deny;

    return {
        mode,
        allow,
        deny,
    };
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

function isSameOrSubdomain(hostname, baseDomain) {
    const host = (hostname || "").toLowerCase();
    return host === baseDomain || host.endsWith("." + baseDomain);
}

function isRedirectableYoutubeUrl(url, config = getDefaultUrlRulesConfig()) {
    try {
        const parsedUrl = new URL(url);
        const host = parsedUrl.hostname.toLowerCase();

        if (host === "youtu.be") {
            return parsedUrl.pathname.length > 1;
        }

        if (!isSameOrSubdomain(host, "youtube.com")) {
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

function convertYouTubeToInstance(youtubeUrl, instanceUrl) {
    const instanceBase = new URL(instanceUrl).origin;

    const url = new URL(youtubeUrl);
    const params = url.searchParams;

    if (url.pathname.includes("/watch") && params.has("v")) {
        const videoId = params.get("v");
        const listId = params.get("list");

        let targetUrl = instanceBase + "/watch?v=" + videoId;
        if (listId) {
            targetUrl += "&list=" + listId;
        }
        return targetUrl;
    }

    if (url.pathname.includes("/playlist") && params.has("list")) {
        const listId = params.get("list");
        return instanceBase + "/playlist?list=" + listId;
    }

    if (url.hostname.includes("youtu.be") && url.pathname.length > 1) {
        const videoId = url.pathname.substring(1).split(/[?#]/)[0];
        if (videoId) {
            let targetUrl = instanceBase + "/watch?v=" + videoId;
            if (params.has("list")) {
                targetUrl += "&list=" + params.get("list");
            }
            return targetUrl;
        }
    }

    const suffix = (url.pathname || "") + (url.search || "");
    return instanceBase + suffix;
}

function convertYouTubeToInvidious(youtubeUrl, instanceUrl) {
    try {
        return convertYouTubeToInstance(youtubeUrl, instanceUrl);
    } catch (error) {
        console.error("Error converting to Invidious URL:", error);
        return youtubeUrl;
    }
}

function convertYouTubeToPiped(youtubeUrl, instanceUrl) {
    try {
        return convertYouTubeToInstance(youtubeUrl, instanceUrl);
    } catch (error) {
        console.error("Error converting to Piped URL:", error);
        return youtubeUrl;
    }
}

function buildRedirectUrl(
    youtubeUrl,
    selectedPlayer,
    preferredInvidiousInstance,
    preferredPipedInstance
) {
    const normalizedPlayer =
        typeof selectedPlayer === "string" ? selectedPlayer.toLowerCase() : "";

    if (normalizedPlayer === PLAYERS.invidious) {
        return convertYouTubeToInvidious(
            youtubeUrl,
            preferredInvidiousInstance || DEFAULT_PREFERRED_INVIDIOUS_INSTANCE
        );
    }
    if (normalizedPlayer === PLAYERS.piped) {
        return convertYouTubeToPiped(
            youtubeUrl,
            preferredPipedInstance || DEFAULT_PREFERRED_PIPED_INSTANCE
        );
    }
    if (normalizedPlayer === PLAYERS.opentubex) {
        return "opentubex://" + youtubeUrl;
    }
    return "freetube://" + youtubeUrl;
}

function openExternalLink(url) {
    if (typeof window !== "undefined" && typeof window.open === "function") {
        window.open(url, "_blank", "noopener,noreferrer");
        return;
    }
    // service worker context: try clients.openWindow if available
    if (typeof clients !== "undefined" && typeof clients.openWindow === "function") {
        try {
            clients.openWindow(url);
        } catch (e) {
            // ignore
        }
    }
}

const storage = {
    get(keys) {
        return new Promise((resolve) => {
            const api = typeof chrome !== 'undefined' ? chrome : (typeof browser !== 'undefined' ? browser : null);
            if (!api || !api.storage || !api.storage.local || typeof api.storage.local.get !== 'function') {
                resolve({});
                return;
            }
            api.storage.local.get(keys, (result) => {
                if (api.runtime && api.runtime.lastError) {
                    resolve({});
                    return;
                }
                resolve(result || {});
            });
        });
    },
    set(values) {
        return new Promise((resolve) => {
            const api = typeof chrome !== 'undefined' ? chrome : (typeof browser !== 'undefined' ? browser : null);
            if (!api || !api.storage || !api.storage.local || typeof api.storage.local.set !== 'function') {
                resolve();
                return;
            }
            api.storage.local.set(values, () => resolve());
        });
    },
};

// Expose to global scope for pages that include shared.js — prefer globalThis/self/window
const _root = (typeof globalThis !== 'undefined'
    ? globalThis
    : typeof self !== 'undefined'
    ? self
    : typeof window !== 'undefined'
    ? window
    : {});
if (!_root.storage) {
    try {
        _root.storage = storage;
    } catch (e) {
        // ignore if environment prevents assignment
    }
}
