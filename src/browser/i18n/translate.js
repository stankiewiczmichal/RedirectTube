(() => {
    const extensionApi = typeof chrome !== "undefined" ? chrome : browser;
    const SUPPORTED_LANGS = ["en", "pl", "nl", "et"];
    const FALLBACK_LANG = "en";
    let fallbackMessages = null;
    let fallbackLoadPromise = null;

    const lang = resolveLanguage();
    document.documentElement.lang = lang;
    persistLanguage(lang);

    async function translateDocument() {
        await ensureFallbackMessages();
        const elements = document.querySelectorAll("[data-i18n]");
        elements.forEach((element) => {
            const key = element.getAttribute("data-i18n");
            const translation = getMessageByKey(key);
            if (translation) {
                element.innerHTML = translation;
            }
        });
    }

    function dispatchTranslationsLoaded() {
        document.dispatchEvent(new Event("redirecttube:translations-loaded"));
    }

    function runTranslation() {
        translateDocument()
            .catch((error) =>
                console.warn("Failed to translate document", error)
            )
            .finally(dispatchTranslationsLoaded);
    }

    if (document.readyState === "loading") {
        document.addEventListener(
            "DOMContentLoaded",
            () => {
                runTranslation();
            },
            {
                once: true,
            }
        );
    } else {
        runTranslation();
    }

    function resolveLanguage() {
        const rawLang =
            (extensionApi.i18n &&
                typeof extensionApi.i18n.getUILanguage === "function"
                ? extensionApi.i18n.getUILanguage()
                : navigator.language || "en") || "en";
        const normalized = (rawLang.split("-")[0] || "en").toLowerCase();
        return SUPPORTED_LANGS.includes(normalized) ? normalized : "en";
    }

    function persistLanguage(value) {
        if (
            extensionApi.storage &&
            extensionApi.storage.local &&
            typeof extensionApi.storage.local.set === "function"
        ) {
            extensionApi.storage.local.set({ lang: value });
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
        const translated = extensionApi.i18n.getMessage(messageName) || "";
        if (translated) {
            return translated;
        }
        return (fallbackMessages && fallbackMessages[messageName]) || "";
    }

    function toMessageName(key) {
        return key
            .split(".")
            .map((segment) => segment.trim())
            .filter(Boolean)
            .join("_")
            .replace(/[^A-Za-z0-9_]/g, "_");
    }

    async function ensureFallbackMessages() {
        if (fallbackMessages) {
            return fallbackMessages;
        }
        if (!fallbackLoadPromise) {
            fallbackLoadPromise = loadLocaleMessages(FALLBACK_LANG);
        }
        fallbackMessages = await fallbackLoadPromise;
        return fallbackMessages;
    }

    async function loadLocaleMessages(locale) {
        if (
            !extensionApi.runtime ||
            typeof extensionApi.runtime.getURL !== "function"
        ) {
            return {};
        }
        try {
            const url = extensionApi.runtime.getURL(
                `_locales/${locale}/messages.json`
            );
            const response = await fetch(url);
            if (!response.ok) {
                return {};
            }
            const data = await response.json();
            const messages = {};
            Object.entries(data || {}).forEach(([key, value]) => {
                if (value && typeof value.message === "string") {
                    messages[key] = value.message;
                }
            });
            return messages;
        } catch (error) {
            console.warn(`Unable to load fallback locale: ${locale}`, error);
            return {};
        }
    }
})();

