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
    "/howyoutubeworks/",
];

function openExternalLink(url) {
    window.open(url, "_blank", "noopener,noreferrer");
}
