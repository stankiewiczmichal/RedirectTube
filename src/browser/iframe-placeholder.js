(function () {
    const extensionApi = typeof chrome !== "undefined" ? chrome : browser;
    const SUPPORTED_LANGS = ["en", "pl", "nl", "fi", "fr", "it", "lv"];

    const params = new URLSearchParams(window.location.search || "");
    const videoUrl = params.get("video") || "";
    const providedLabel = sanitizeLabel(params.get("label"));
    const enhancedPreviewEnabled = params.get("enhancedPreview") === "1";
    const providedTitle = sanitizeLabel(params.get("title"));

    const buttons = document.querySelectorAll("[data-action]");
    const warning = document.getElementById("warning");
    const settingsLink = document.getElementById("settingsLink");
    const mediaLayer = document.getElementById("mediaLayer");
    const videoTitle = document.getElementById("videoTitle");
    const header = document.querySelector(".header");
    const previewThumbnailCache = new Map();
    const previewTitleCache = new Map();
    const MAX_PREVIEW_CACHE_SIZE = 25;

    init();

    function init() {
        const lang = resolveLanguage();
        document.documentElement.lang = lang;

        const defaultLabel =
            getMessageByKey("ui.iframeButton.redirect") || "Watch on";
        const resolvedLabel = providedLabel || defaultLabel;

        const translated = applyTranslations({ label: resolvedLabel });
        if (!translated) {
            applyLabelFallback(resolvedLabel);
        }

        setupSettingsLink();
        applyVideoTitle();

        // Set dynamic label for the main action according to selected player
        try {
            const freetubeLabel = document.getElementById("freetubeLabel");
            if (freetubeLabel && extensionApi && extensionApi.storage && extensionApi.storage.local) {
                extensionApi.storage.local.get([STORAGE_KEYS.selectedPlayer], (res = {}) => {
                    const selected = (res[STORAGE_KEYS.selectedPlayer] || "freetube").toLowerCase();
                    const dynamicKey = "ui.button.redirect_" + selected;
                    const label = getMessageByKey(dynamicKey) || getMessageByKey("ui.iframeButton.redirect") || freetubeLabel.textContent;
                    freetubeLabel.textContent = label;
                });
            }
        } catch (e) {
            // ignore storage failures
        }

        if (!videoUrl) {
            showWarning();
            return;
        }

        setupEnhancedPreview();

        buttons.forEach((button) => {
            button.addEventListener("click", (event) => {
                event.preventDefault();
                postAction(button.dataset.action);
            });
        });
    }

    function setupSettingsLink() {
        if (!settingsLink) {
            return;
        }

        const optionsUrl =
            extensionApi &&
            extensionApi.runtime &&
            typeof extensionApi.runtime.getURL === "function"
                ? extensionApi.runtime.getURL("options.html")
                : null;

        if (optionsUrl) {
            settingsLink.setAttribute("href", optionsUrl);
            settingsLink.setAttribute("target", "_blank");
            settingsLink.setAttribute("rel", "noreferrer noopener");
        }

        settingsLink.addEventListener("click", (event) => {
            event.preventDefault();
            openExtensionOptions();
        });
    }

    function openExtensionOptions() {
        if (!extensionApi || !extensionApi.runtime) {
            return;
        }

        if (typeof extensionApi.runtime.openOptionsPage === "function") {
            extensionApi.runtime.openOptionsPage();
            return;
        }

        if (typeof extensionApi.runtime.getURL === "function") {
            const url = extensionApi.runtime.getURL("options.html");
            if (url) {
                openExternalLink(url);
            }
        }
    }

    function showWarning() {
        if (warning) {
            warning.hidden = false;
        }
        buttons.forEach((button) => {
            button.disabled = true;
        });
    }

    function applyVideoTitle(title = providedTitle) {
        if (!videoTitle) {
            return;
        }
        const resolvedTitle = sanitizeLabel(title);
        if (!enhancedPreviewEnabled || !resolvedTitle) {
            videoTitle.hidden = true;
            videoTitle.textContent = "";
            if (header) {
                header.classList.add("no-title");
            }
            return;
        }

        videoTitle.textContent = resolvedTitle;
        videoTitle.hidden = false;
        if (header) {
            header.classList.remove("no-title");
        }
    }

    function setupEnhancedPreview() {
        if (!enhancedPreviewEnabled || !videoUrl || !mediaLayer) {
            return;
        }

        const videoId = extractVideoId(videoUrl);
        if (!videoId) {
            return;
        }

        const thumbnailUrls = [
            `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
            `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
            `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
        ];

        Promise.all([
            getCachedPreviewValue(previewThumbnailCache, videoId, () =>
                fetchThumbnailUrl(thumbnailUrls)
            ),
            providedTitle
                ? Promise.resolve("")
                : getCachedPreviewValue(previewTitleCache, videoId, () =>
                      fetchVideoTitle(videoId)
                  ),
        ])
            .then(([thumbnailUrl, fetchedTitle]) => {
                if (thumbnailUrl) {
                    mediaLayer.style.backgroundImage = `url("${thumbnailUrl}")`;
                }
                if (!providedTitle && fetchedTitle) {
                    applyVideoTitle(fetchedTitle);
                }
            })
            .catch(() => {
                // Keep placeholder minimal when preview lookup fails.
            });
    }

    async function fetchVideoTitle(videoId) {
        if (!videoId) {
            return "";
        }

        const watchUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
        const endpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl)}&format=json`;

        const response = await fetch(endpoint, { method: "GET" });
        if (!response.ok) {
            return "";
        }

        const data = await response.json();
        return data && typeof data.title === "string" ? data.title : "";
    }

    async function fetchThumbnailUrl(urls) {
        for (const candidateUrl of urls) {
            if (await probeImage(candidateUrl)) {
                return candidateUrl;
            }
        }

        return "";
    }

    function probeImage(url) {
        return new Promise((resolve) => {
            const probe = new Image();
            probe.referrerPolicy = "no-referrer";
            probe.onload = () => resolve(true);
            probe.onerror = () => resolve(false);
            probe.src = url;
        });
    }

    function getCachedPreviewValue(cache, key, loader) {
        if (cache.has(key)) {
            const cachedValue = cache.get(key);
            return cachedValue instanceof Promise
                ? cachedValue
                : Promise.resolve(cachedValue);
        }

        const pendingValue = loader()
            .then((value) => {
                cache.set(key, value);
                trimPreviewCache(cache);
                return value;
            })
            .catch((error) => {
                cache.delete(key);
                throw error;
            });

        cache.set(key, pendingValue);
        return pendingValue;
    }

    function trimPreviewCache(cache) {
        while (cache.size > MAX_PREVIEW_CACHE_SIZE) {
            const oldestKey = cache.keys().next().value;
            cache.delete(oldestKey);
        }
    }

    function extractVideoId(url) {
        if (!url) {
            return "";
        }
        const embedMatch = url.match(/\/embed\/([^/?&#]+)/i);
        if (embedMatch && embedMatch[1]) {
            return embedMatch[1];
        }
        return "";
    }

    function postAction(action) {
        if (!action) {
            return;
        }
        window.parent.postMessage(
            {
                type: "redirecttubeIframeAction",
                action,
                video: videoUrl,
            },
            "*"
        );
    }

    function resolveLanguage() {
        const fallback = detectNavigatorLanguage();
        const uiLanguage =
            (extensionApi.i18n &&
                typeof extensionApi.i18n.getUILanguage === "function"
                ? extensionApi.i18n.getUILanguage()
                : null) || fallback;
        const normalized = (uiLanguage.split("-")[0] || "en").toLowerCase();
        return SUPPORTED_LANGS.includes(normalized) ? normalized : fallback;
    }

    function detectNavigatorLanguage() {
        const browserLang = ((navigator.language || "en").split("-")[0] || "en").toLowerCase();
        return SUPPORTED_LANGS.includes(browserLang) ? browserLang : "en";
    }

    function applyTranslations(replacements = {}) {
        let applied = false;
        document.querySelectorAll("[data-i18n]").forEach((element) => {
            const key = element.dataset.i18n;
            const template = getMessageByKey(key);
            if (typeof template === "string" && template.length) {
                element.innerHTML = interpolate(template, replacements);
                applied = true;
            }
        });
        return applied;
    }

    function applyLabelFallback(label) {
        const fallbackLabel = label || "Watch on";
        const headline = document.getElementById("headline");
        const message = document.getElementById("message");
        const freetubeLabel = document.getElementById("freetubeLabel");
        const youtubeLabel = document.getElementById("youtubeLabel");

        if (headline) {
            headline.textContent = `${fallbackLabel} or YouTube`;
        }
        if (message) {
            message.textContent = "RedirectTube lets you decide how to open embedded videos.";
        }
        if (freetubeLabel) {
            freetubeLabel.textContent = `${fallbackLabel}`;
        }
        if (youtubeLabel) {
            youtubeLabel.textContent = `${fallbackLabel} YouTube`;
        }
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

    function interpolate(template, replacements) {
        if (typeof template !== "string") {
            return template;
        }
        return template.replace(/{{\s*(\w+)\s*}}/g, (match, token) => {
            if (Object.prototype.hasOwnProperty.call(replacements, token)) {
                return escapeHtml(replacements[token]);
            }
            return match;
        });
    }

    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function sanitizeLabel(raw) {
        if (!raw) {
            return "";
        }
        return raw.replace(/[<>]/g, "").trim();
    }
})();
