const extensionApi = typeof chrome !== "undefined" ? chrome : browser;

var errorText = document.getElementById("errorText");
var redirectButton = document.getElementById("redirectButton");
var optionsButton = document.getElementById("optionsButton");
var opinionButton = document.getElementById("opinionButton");
var suggestionButton = document.getElementById("suggestionButton");
var issueButton = document.getElementById("issueButton");

document.addEventListener("DOMContentLoaded", function () {
    extensionApi.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        var url = tabs[0].url;
        // Load url rules config and decide if redirect is allowed for this URL
        extensionApi.storage.local.get([STORAGE_KEYS.urlRulesConfig], function (result = {}) {
            const normalized = normalizeUrlRulesConfig(result[STORAGE_KEYS.urlRulesConfig]);
            if (isRedirectableYoutubeUrl(url, normalized)) {
                loadOptions(url, tabs);
            } else {
                errorText.textContent =
                    getMessageByKey("ui.error.e404") ||
                    "Cannot open this page in FreeTube.";
                redirectButton.disabled = true;
            }
        });
    });
});

// Helper functions for URL rule normalization and detection (mirrors background/content logic)
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

function normalizeUrlRulesConfig(rawConfig) {
    const base = {
        mode: "allowList",
        allow: Array.isArray(DEFAULT_ALLOW_PREFIXES) ? DEFAULT_ALLOW_PREFIXES : [],
        deny: Array.isArray(DEFAULT_DENY_PREFIXES) ? DEFAULT_DENY_PREFIXES : [],
    };
    if (!rawConfig || typeof rawConfig !== "object") {
        return base;
    }
    const mode = rawConfig.mode === "allowAllExcept" ? "allowAllExcept" : "allowList";
    const allow = Array.isArray(rawConfig.allow) ? normalizePrefixList(rawConfig.allow) : base.allow;
    return {
        mode,
        allow,
        deny: base.deny,
    };
}

function pathMatchesPrefix(path, prefixes) {
    return prefixes.some((prefix) => path.startsWith(prefix));
}

function isRedirectableYoutubeUrl(url, config) {
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

function loadOptions(url, tabs) {
    extensionApi.storage.local.get(
        ["popupBehavior", "selectedPlayer", "preferredInvidiousInstance", "preferredPipedInstance"],
        function (result) {
            const selectedPlayer = (result && result.selectedPlayer) || "freetube";
            // Set button text according to selected player
            const dynamicKey = "ui.button.redirect_" + selectedPlayer;
            const label = getMessageByKey(dynamicKey) || getMessageByKey("ui.button.redirect");
            redirectButton.textContent = label;

            if (result && result.popupBehavior === "redirect") {
                openInSelectedPlayer(url, tabs, result);
            }
        }
    );
}

function openInSelectedPlayer(url, tabs, storageResult) {
    const selectedPlayer = storageResult.selectedPlayer || "freetube";
    const preferredInvidiousInstance = storageResult.preferredInvidiousInstance || "https://yewtu.be";
    const preferredPipedInstance = storageResult.preferredPipedInstance || "https://piped.video";
    
    let finalUrl;
    
    switch (selectedPlayer) {
        case "invidious":
            finalUrl = convertYouTubeToInvidious(url, preferredInvidiousInstance);
            break;
        case "piped":
            finalUrl = convertYouTubeToPiped(url, preferredPipedInstance);
            break;
        case "freetube":
        default:
            finalUrl = "freetube://" + url;
            break;
    }
    
    extensionApi.tabs.update(tabs[0].id, { url: finalUrl });
    window.close();
}

function convertYouTubeToInvidious(youtubeUrl, instanceUrl) {
    try {
        const url = new URL(youtubeUrl);
        const params = url.searchParams;
        const instanceBase = new URL(instanceUrl).origin;
        
        if (url.pathname.includes("/watch") && params.has("v")) {
            const videoId = params.get("v");
            const listId = params.get("list");
            
            let invidiousUrl = instanceBase + "/watch?v=" + videoId;
            if (listId) {
                invidiousUrl += "&list=" + listId;
            }
            return invidiousUrl;
        }
        
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
        
        // Preserve path and query for channel/user pages or other YouTube paths
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
        
        if (url.pathname.includes("/watch") && params.has("v")) {
            const videoId = params.get("v");
            const listId = params.get("list");
            
            let pipedUrl = instanceBase + "/watch?v=" + videoId;
            if (listId) {
                pipedUrl += "&list=" + listId;
            }
            return pipedUrl;
        }
        
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
        
        // Preserve path and query for channel/user pages or other YouTube paths
        const suffix = (url.pathname || "") + (url.search || "");
        return instanceBase + suffix;
    } catch (error) {
        console.error("Error converting to Piped URL:", error);
        return youtubeUrl;
    }
}

function openInFreeTube(url, tabs) {
    var freeTubeUrl = "freetube://" + url;
    extensionApi.tabs.update(tabs[0].id, { url: freeTubeUrl });
    window.close();
}

redirectButton.addEventListener("click", function () {
    if (redirectButton.disabled === false) {
        extensionApi.tabs.query(
            { active: true, currentWindow: true },
            function (tabs) {
                var url = tabs[0].url;
                extensionApi.storage.local.get(
                    ["selectedPlayer", "preferredInvidiousInstance", "preferredPipedInstance"],
                    function (result) {
                        openInSelectedPlayer(url, tabs, result);
                    }
                );
            }
        );
    }
});

optionsButton.addEventListener("click", function () {
    window.open('options.html');
});

opinionButton.addEventListener("click", function () {
    if (extensionApi.runtime.getManifest().browser_specific_settings) {
        var website =
            "https://addons.mozilla.org/firefox/addon/redirecttube/reviews/";
    } else {
        var website =
            "https://chromewebstore.google.com/detail/redirecttube/jpbaggklodpddjcadlebabhiopjkjfjh/reviews";
    }
    openExternalLink(website);
});

suggestionButton.addEventListener("click", function () {
    openExternalLink(
        "https://github.com/stankiewiczmichal/RedirectTube/issues/new?assignees=stankiewiczmichal&labels=enhancement&projects=&template=feature-request.yml&title=%5BFR%5D%3A+"
    );
});

issueButton.addEventListener("click", function () {
    openExternalLink(
        "https://github.com/stankiewiczmichal/RedirectTube/issues/new?assignees=stankiewiczmichal&labels=bug&projects=&template=bug-report.yml&title=%5BBug%5D%3A+"
    );
});

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
