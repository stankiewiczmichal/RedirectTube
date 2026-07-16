const extensionApi = typeof chrome !== "undefined" ? chrome : browser;

var popupBehavior = "showPopup";
var autoRedirectLinks = "autoRedirectLinksNo";
var iframeBehavior = "iframeBehaviorReplace";
var extensionIcon = "redirecttube-color";
var selectedPlayer = "freetube";
var preferredInvidiousInstance = "https://yewtu.be";
var preferredPipedInstance = "https://piped.video";
var shortcutEnabled = true;
var shortcutBehavior = "replaceTab";

const CATEGORY_PREFIXES = {
    watch: ["/watch", "/playlist"],
    shorts: ["/shorts/"],
    feed: ["/feed/subscriptions", "/feed/library", "/feed/you"],
    search: ["/results"],
    hashtag: ["/hashtag/", "/post/"],
    podcasts: ["/podcasts", "/gaming"],
    home: ["/"],
    profiles: ["/@", "/channel/", "/live/"],
};

const RTL_LANGS = new Set([
    "ar",
    "arc",
    "ckb",
    "dv",
    "fa",
    "he",
    "ku",
    "ps",
    "sd",
    "ug",
    "ur",
    "yi",
]);

function resolveLanguageCode() {
    const rawLanguage =
        (extensionApi.i18n && typeof extensionApi.i18n.getUILanguage === "function"
            ? extensionApi.i18n.getUILanguage()
            : navigator.language) || "en";
    return (rawLanguage.split("-")[0] || "en").toLowerCase();
}

function resolveTextDirection() {
    return RTL_LANGS.has(resolveLanguageCode()) ? "rtl" : "ltr";
}

function applyTextDirection() {
    const direction = resolveTextDirection();
    const body = document.body;
    if (!body) {
        return direction;
    }

    body.classList.toggle("dir-rtl", direction === "rtl");
    body.classList.toggle("dir-ltr", direction === "ltr");
    document.documentElement.dir = direction;

    return direction;
}

function getSelectedCategories() {
    return Array.from(
        document.querySelectorAll("#urlRulesCategoryPills .pill-toggle")
    )
        .filter((btn) => btn.classList.contains("active"))
        .map((btn) => btn.dataset.category)
        .filter(Boolean);
}

function setCategorySelection(selectedCategories) {
    const selectedSet = new Set(selectedCategories);
    document.querySelectorAll("#urlRulesCategoryPills .pill-toggle").forEach(
        (btn) => {
            const isActive = selectedSet.has(btn.dataset.category);
            btn.classList.toggle("active", isActive);
            btn.setAttribute("aria-pressed", String(isActive));
        }
    );
}

function getCustomPrefixesFromUI() {
    return Array.from(document.querySelectorAll("#urlRulesCustomList li")).map(
        (li) => li.dataset.prefix
    );
}

function renderCustomPills(prefixes) {
    const list = document.getElementById("urlRulesCustomList");
    if (!list) {
        return;
    }
    list.innerHTML = "";
    prefixes.forEach((prefix) => {
        const li = document.createElement("li");
        li.dataset.prefix = prefix;
        li.className = "pill-removable";
        const textSpan = document.createElement("span");
        textSpan.textContent = prefix;
        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "pill-remove";
        removeBtn.setAttribute("aria-label", "Remove " + prefix);
        removeBtn.textContent = "×";
        removeBtn.addEventListener("click", (event) => {
            event.preventDefault();
            li.remove();
            saveOptions(event);
        });
        li.appendChild(textSpan);
        li.appendChild(removeBtn);
        list.appendChild(li);
    });
}

function addCustomPathFromInput() {
    const input = document.getElementById("urlRulesCustomInput");
    if (!input || input.disabled) {
        return;
    }
    const raw = (input.value || "").trim();
    if (!raw) {
        return;
    }
    const { valid, errors } = parseCustomPaths(raw);
    if (errors.length || !valid.length) {
        showUrlRulesError("Invalid paths: " + errors.join(", "));
        return;
    }
    const value = valid[0];
    if (pathMatchesPrefix(value, DEFAULT_DENY_PREFIXES)) {
        showUrlRulesError("Cannot allow blocked paths: " + value);
        return;
    }
    const existing = new Set(getCustomPrefixesFromUI());
    if (existing.has(value)) {
        showUrlRulesError("");
        input.value = "";
        return;
    }
    existing.add(value);
    renderCustomPills(Array.from(existing));
    input.value = "";
    showUrlRulesError("");
    saveOptions();
}

function parseCustomPaths(rawText) {
    const lines = (rawText || "").split(/\r?\n/);
    const valid = [];
    const errors = [];

    lines.forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed) {
            return;
        }
        if (!trimmed.startsWith("/")) {
            errors.push(trimmed);
            return;
        }
        if (trimmed.includes("://")) {
            errors.push(trimmed);
            return;
        }
        valid.push(trimmed.toLowerCase());
    });

    return { valid: normalizePrefixList(valid), errors };
}

function mergeCategorySelections(config) {
    const selectedCategories = getSelectedCategories();

    const categoryPrefixes = selectedCategories.flatMap(
        (key) => CATEGORY_PREFIXES[key] || []
    );

    const customPrefixes = getCustomPrefixesFromUI();

    const combined = normalizePrefixList([...categoryPrefixes, ...customPrefixes]);
    const denyHits = combined.filter((prefix) => pathMatchesPrefix(prefix, DEFAULT_DENY_PREFIXES));

    const errorMessages = [];
    if (denyHits.length) {
        errorMessages.push(
            "Cannot allow blocked paths: " + Array.from(new Set(denyHits)).join(", ")
        );
    }

    return { combined, errorMessages };
}

function readUrlRulesFromUI() {
    const mode = document.getElementById("urlRulesAllowAll").checked
        ? "allowAllExcept"
        : "allowList";

    const { combined, errorMessages } = mergeCategorySelections();

    if (mode === "allowList" && !combined.length) {
        errorMessages.push("Select at least one path or switch to allow all.");
    }

    return {
        config: {
            mode,
            allow: combined,
            deny: [...DEFAULT_DENY_PREFIXES],
        },
        errors: errorMessages,
    };
}

function applyUrlRulesToUI(config) {
    const normalized = normalizeUrlRulesConfig(config);

    document.getElementById("urlRulesAllowAll").checked =
        normalized.mode === "allowAllExcept";

    const allowSet = new Set(normalized.allow);
    const selectedPrefixes = new Set();

    const selectedCategories = [];
    Object.keys(CATEGORY_PREFIXES).forEach((key) => {
        const prefixes = CATEGORY_PREFIXES[key];
        const isSelected = prefixes.every((p) => allowSet.has(p));
        if (isSelected) {
            selectedCategories.push(key);
            prefixes.forEach((p) => selectedPrefixes.add(p));
        }
    });
    setCategorySelection(selectedCategories);

    const customPrefixes = normalized.allow.filter(
        (prefix) => !selectedPrefixes.has(prefix)
    );
    renderCustomPills(customPrefixes);

    setAllowListEnabled(normalized.mode !== "allowAllExcept");
}

function renderDenyList() {
    const list = document.getElementById("urlRulesDenyList");
    if (!list) {
        return;
    }
    list.innerHTML = "";
    DEFAULT_DENY_PREFIXES.forEach((prefix) => {
        const li = document.createElement("li");
        li.textContent = prefix;
        list.appendChild(li);
    });
}

function showUrlRulesError(message) {
    const el = document.getElementById("urlRulesError");
    if (el) {
        el.textContent = message || "";
    }
}

function setAllowListEnabled(enabled) {
    const container = document.getElementById("urlRulesAllowList");
    if (!container) {
        return;
    }
    container.classList.toggle("disabled", !enabled);

    const controls = container.querySelectorAll(
        "button.pill-toggle, input[type='text'], button#urlRulesCustomAdd, button.pill-remove"
    );
    controls.forEach((el) => {
        el.disabled = !enabled;
        if (!enabled) {
            el.classList.add("is-disabled");
        } else {
            el.classList.remove("is-disabled");
        }
    });
}

function setSelectedPlayer(value) {
    const normalizedValue = value || "freetube";
    const radio = document.querySelector(
        'input[name="selectedPlayer"][value="' + normalizedValue + '"]'
    );
    if (radio) {
        radio.checked = true;
    }
}

function setPreferredInstanceVisibility(player) {
    const invidiousRow = document
        .querySelector('label[for="preferredInvidiousInstance"]')
        ?.closest(".flex-row");
    const pipedRow = document
        .querySelector('label[for="preferredPipedInstance"]')
        ?.closest(".flex-row");
    const playerPrefSection = document.getElementById("playerPrefferedSection");
    const playerInstanceSection = document.getElementById("playerInstanceSection");
    const showInvidious = player === "invidious";
    const showPiped = player === "piped";

    if (invidiousRow) {
        invidiousRow.hidden = !showInvidious;
    }
    if (pipedRow) {
        pipedRow.hidden = !showPiped;
    }
    
    if (playerPrefSection) {
        playerPrefSection.classList.toggle("player-instance-section-active", showInvidious || showPiped);
    }
    
    if (playerInstanceSection) {
        playerInstanceSection.hidden = !(showInvidious || showPiped);
    }
}

function setShortcutOptionsVisibility(enabled) {
    const shortcutOptions = document.getElementById("shortcutOptions");
    const shortcutKeySection = document.getElementById("shortcutKeySection");
    const shortcutEnabledSection = document.getElementById("shortcutEnabledSection");
    if (shortcutOptions) {
        shortcutOptions.hidden = !enabled;
    }
    if (shortcutKeySection) {
        shortcutKeySection.hidden = !enabled;
    }
    if (shortcutEnabledSection) {
        shortcutEnabledSection.classList.toggle("shortcut-group-connected", enabled);
    }
}

function getBrowserKind() {
    const bss = extensionApi.runtime.getManifest().browser_specific_settings || {};
    if (bss.gecko) return "firefox";
    if (bss.safari) return "safari";
    return "chromium";
}

function openShortcutsSettings() {
    const kind = getBrowserKind();
    if (kind !== "chromium") {
        // Firefox and Safari have no deep-link URL for shortcut settings —
        // the corresponding hint text guides the user instead.
        return;
    }
    extensionApi.tabs.create({ url: "chrome://extensions/shortcuts" });
}

function applyShortcutBrowserUI() {
    const button = document.getElementById("changeShortcutButton");
    const firefoxHint = document.getElementById("shortcutFirefoxHint");
    const safariHint = document.getElementById("shortcutSafariHint");
    const kind = getBrowserKind();
    if (button) {
        button.hidden = kind !== "chromium";
    }
    if (firefoxHint) {
        firefoxHint.hidden = kind !== "firefox";
    }
    if (safariHint) {
        safariHint.hidden = kind !== "safari";
    }
}

function getSelectedPlayerFromUI() {
    const selected = document.querySelector(
        'input[name="selectedPlayer"]:checked'
    );
    return selected ? selected.value : "freetube";
}

function syncPreferredInstanceVisibility() {
    setPreferredInstanceVisibility(getSelectedPlayerFromUI());
}

function saveOptions(e) {
    if (e && typeof e.preventDefault === "function") {
        e.preventDefault();
    }

    const urlRulesResult = readUrlRulesFromUI();
    if (urlRulesResult.errors.length) {
        showUrlRulesError(urlRulesResult.errors[0]);
        return;
    }
    showUrlRulesError("");

    extensionApi.storage.local.set({
        popupBehavior: document.getElementById("popupBehavior").value,
        autoRedirectLinks: document.getElementById("autoRedirectLinks").value,
        iframeBehavior: document.getElementById("iframeBehavior").value,
        iframeEnhancedPreview:
            document.getElementById("iframeEnhancedPreview").value === "1",
        extensionIcon: document.querySelector(
            'input[name="extensionIcon"]:checked'
        ).value,
        selectedPlayer: getSelectedPlayerFromUI(),
        preferredInvidiousInstance: document.getElementById(
            "preferredInvidiousInstance"
        ).value.trim(),
        preferredPipedInstance: document.getElementById(
            "preferredPipedInstance"
        ).value.trim(),
        urlRulesConfig: urlRulesResult.config,
        shortcutEnabled: document.getElementById("shortcutEnabled").checked,
        shortcutBehavior: document.getElementById("shortcutBehavior").value,
    });
}

function restoreOptions() {
    function setCurrentChoice(result) {
        document.getElementById("popupBehavior").value =
            result.popupBehavior || popupBehavior;
        document.getElementById("autoRedirectLinks").value =
            result.autoRedirectLinks || autoRedirectLinks;
        const storedIframeBehavior =
            normalizeIframeBehavior(result.iframeBehavior) ||
            normalizeIframeBehavior(result.iframeButton) ||
            iframeBehavior;
        document.getElementById("iframeBehavior").value = storedIframeBehavior;
        document.getElementById("iframeEnhancedPreview").value =
            (result.iframeEnhancedPreview ?? false) ? "1" : "0";
        document.querySelector(
            'input[name="extensionIcon"][value="' +
                (result.extensionIcon || extensionIcon) +
                '"]'
        ).checked = true;

        setSelectedPlayer(result.selectedPlayer || selectedPlayer);
        document.getElementById("preferredInvidiousInstance").value =
            result.preferredInvidiousInstance || preferredInvidiousInstance;
        document.getElementById("preferredPipedInstance").value =
            result.preferredPipedInstance || preferredPipedInstance;

        applyUrlRulesToUI(result.urlRulesConfig);
        syncPreferredInstanceVisibility();
        updateIframeEnhancedPreviewVisibility();

        document.getElementById("shortcutEnabled").checked =
            result.shortcutEnabled ?? shortcutEnabled;
        document.getElementById("shortcutBehavior").value =
            result.shortcutBehavior || shortcutBehavior;
        setShortcutOptionsVisibility(document.getElementById("shortcutEnabled").checked);
    }

    function onError(error) {
        console.log(`Error: ${error}`);
    }

    extensionApi.storage.local.get(
        [
            "popupBehavior",
            "autoRedirectLinks",
            "iframeBehavior",
            "iframeEnhancedPreview",
            "extensionIcon",
            "selectedPlayer",
            "preferredInvidiousInstance",
            "preferredPipedInstance",
            "urlRulesConfig",
            "shortcutEnabled",
            "shortcutBehavior",
        ],
        function (result) {
            if (extensionApi.runtime.lastError) {
                onError(extensionApi.runtime.lastError);
                return;
            }
            setCurrentChoice(result || {});
        }
    );
}

if (opinionButton && getBrowserKind() === "safari") {
    opinionButton.hidden = true;
}

opinionButton?.addEventListener("click", function () {
    var website =
        getBrowserKind() === "firefox"
            ? "https://addons.mozilla.org/firefox/addon/redirecttube/reviews/"
            : "https://chromewebstore.google.com/detail/redirecttube/jpbaggklodpddjcadlebabhiopjkjfjh/reviews";
    openExternalLink(website);
});

suggestionButton?.addEventListener("click", function () {
    openExternalLink(
        "https://github.com/stankiewiczmichal/RedirectTube/issues/new?assignees=stankiewiczmichal&labels=enhancement&projects=&template=feature-request.yml&title=%5BFR%5D%3A+"
    );
});

issueButton?.addEventListener("click", function () {
    openExternalLink(
        "https://github.com/stankiewiczmichal/RedirectTube/issues/new?assignees=stankiewiczmichal&labels=bug&projects=&template=bug-report.yml&title=%5BBug%5D%3A+"
    );
});

function updateVersion() {
    const versionElement = document.querySelector("#version");
    if (!versionElement) {
        return;
    }

    versionElement.textContent = extensionApi.runtime.getManifest().version;
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", updateVersion, { once: true });
} else {
    updateVersion();
}

document.addEventListener("redirecttube:translations-loaded", updateVersion);

// Navigation handler for sidebar categories
function switchCategory(categoryId) {
    // Hide all categories
    document.querySelectorAll(".category").forEach((cat) => {
        cat.style.display = "none";
    });
    
    // Deactivate all nav buttons
    document.querySelectorAll("#sidebar nav button").forEach((btn) => {
        btn.classList.remove("active");
    });
    
    // Show selected category
    const categoryElement = document.getElementById(categoryId);
    if (categoryElement) {
        categoryElement.style.display = "block";
    }
    
    // Activate clicked button and update category name
    const navButtons = document.querySelectorAll("#sidebar nav button");
    const categoryMap = {
        generalCategory: 0,
        advancedCategory: 1,
        helpCategory: 2
    };
    const buttonIndex = categoryMap[categoryId];
    if (navButtons[buttonIndex]) {
        navButtons[buttonIndex].classList.add("active");
        // Update category name display
        const categoryNameElement = document.getElementById("categoryName");
        if (categoryNameElement) {
            categoryNameElement.textContent = navButtons[buttonIndex].textContent;
        }
    }
}

// Function to set document.title to "RedirectTube / <Options translated>"
function setPageTitle() {
    try {
        const baseTitleEl = document.querySelector('title');
        const base = 'RedirectTube';
        const optionsEl = document.querySelector('[data-i18n="options.options.title"]');
        const optionsText = (optionsEl && optionsEl.textContent && optionsEl.textContent.trim()) || 'Options';
        document.title = `${base} / ${optionsText}`;
    } catch (e) {
        // ignore
    }
}

document.addEventListener("DOMContentLoaded", () => {
    applyTextDirection();
    renderDenyList();
    restoreOptions();
    applyShortcutBrowserUI();

    // Setup navbar navigation
    const navButtons = document.querySelectorAll("#sidebar nav button");
    navButtons.forEach((button, index) => {
        button.addEventListener("click", () => {
            const categories = ["generalCategory", "advancedCategory", "helpCategory"];
            switchCategory(categories[index]);
        });
    });
    
    // Set initial active category and category name
    switchCategory("generalCategory");
    
    // Update category name display and page title after translations are likely applied
    setTimeout(() => {
        const activeButton = document.querySelector("#sidebar nav button.active");
        if (activeButton && document.getElementById("categoryName")) {
            document.getElementById("categoryName").textContent = activeButton.textContent;
        }
        setPageTitle();
    }, 150);
    
    // Fallback: update title again shortly after in case translations finish later
    setTimeout(() => setPageTitle(), 500);
});
document
    .querySelector("#popupBehavior")
    ?.addEventListener("change", saveOptions);
document
    .querySelector("#autoRedirectLinks")
    ?.addEventListener("change", saveOptions);
document.querySelector("#iframeBehavior")?.addEventListener("change", function() {
    updateIframeEnhancedPreviewVisibility();
    saveOptions();
});
document
    .querySelector("#iframeEnhancedPreview")
    ?.addEventListener("change", saveOptions);
document.querySelectorAll('input[name="extensionIcon"]').forEach((input) => {
    input.addEventListener("change", saveOptions);
});
document.querySelectorAll('input[name="selectedPlayer"]').forEach((input) => {
    input.addEventListener("change", saveOptions);
    input.addEventListener("change", syncPreferredInstanceVisibility);
});
document
    .querySelector("#preferredInvidiousInstance")
    ?.addEventListener("change", saveOptions);
document
    .querySelector("#preferredPipedInstance")
    ?.addEventListener("change", saveOptions);
document.querySelector("#shortcutEnabled")?.addEventListener("change", (event) => {
    setShortcutOptionsVisibility(Boolean(event.target.checked));
    saveOptions(event);
});
document
    .querySelector("#shortcutBehavior")
    ?.addEventListener("change", saveOptions);
document
    .querySelector("#changeShortcutButton")
    ?.addEventListener("click", openShortcutsSettings);
document.querySelector("#urlRulesAllowAll")?.addEventListener("change", (event) => {
    const isAllowAll = Boolean(event.target.checked);
    setAllowListEnabled(!isAllowAll);
    saveOptions(event);
});
document
    .querySelectorAll("#urlRulesCategoryPills .pill-toggle")
    .forEach((btn) => {
        btn.addEventListener("click", (event) => {
            if (btn.disabled) {
                return;
            }
            btn.classList.toggle("active");
            btn.setAttribute("aria-pressed", btn.classList.contains("active"));
            saveOptions(event);
        });
    });

const customAddBtn = document.getElementById("urlRulesCustomAdd");
if (customAddBtn) {
    customAddBtn.addEventListener("click", (event) => {
        event.preventDefault();
        addCustomPathFromInput();
    });
}

const customInput = document.getElementById("urlRulesCustomInput");
if (customInput) {
    customInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            addCustomPathFromInput();
        }
    });
}

const urlRulesResetBtn = document.getElementById("urlRulesReset");
if (urlRulesResetBtn) {
    urlRulesResetBtn.addEventListener("click", (event) => {
        event.preventDefault();
        applyUrlRulesToUI(getDefaultUrlRulesConfig());
        showUrlRulesError("");
        saveOptions(event);
    });
}

function updateIframeEnhancedPreviewVisibility() {
    const iframeBehaviorValue = document.getElementById("iframeBehavior").value;
    const enhancedPreviewSection = document.getElementById("iframeEnhancedPreviewSection");

    if (iframeBehaviorValue === "iframeBehaviorNone") {
        enhancedPreviewSection.classList.add("hidden");
    } else {
        enhancedPreviewSection.classList.remove("hidden");
    }
}
