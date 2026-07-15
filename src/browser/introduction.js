const extensionApi =
    typeof browser !== "undefined"
        ? browser
        : typeof chrome !== "undefined"
            ? chrome
            : null;

const STORAGE_KEYS = {
    selectedPlayer: "selectedPlayer",
    preferredInvidiousInstance: "preferredInvidiousInstance",
    preferredPipedInstance: "preferredPipedInstance",
    introductionComplete: "introductionComplete",
    shortcutEnabled: "shortcutEnabled",
    shortcutBehavior: "shortcutBehavior",
};

const DEFAULT_SHORTCUT_ENABLED = true;
const DEFAULT_SHORTCUT_BEHAVIOR = "replaceTab";

const DEFAULT_INSTANCE_BY_PLAYER = {
    invidious: "https://yewtu.be",
    piped: "https://piped.video",
};

const VALIDATION_PATH_BY_PLAYER = {
    invidious: "/api/v1/stats",
    piped: "/api/v1/search?q=redirecttube",
};

const PLAYER_STORAGE_KEY_BY_PLAYER = {
    invidious: STORAGE_KEYS.preferredInvidiousInstance,
    piped: STORAGE_KEYS.preferredPipedInstance,
};

const STEPS = {
    first: document.getElementById("introduction-step-1"),
    second: document.getElementById("introduction-step-2"),
    third: document.getElementById("introduction-step-3"),
};

const CONTROLS = {
    next: document.getElementById("next"),
    back: document.getElementById("back"),
    finish: document.getElementById("finish"),
    step2Next: document.getElementById("step2Next"),
    step3Back: document.getElementById("step3Back"),
    freetubePanel: document.getElementById("setup-freetube-panel"),
    invidiousPanel: document.getElementById("setup-invidious-panel"),
    pipedPanel: document.getElementById("setup-piped-panel"),
    opentubexPanel: document.getElementById("setup-opentubex-panel"),
    invidiousInput: document.getElementById("invidiousInstanceUrl"),
    pipedInput: document.getElementById("pipedInstanceUrl"),
    invidiousCheck: document.getElementById("invidiousInstanceCheck"),
    pipedCheck: document.getElementById("pipedInstanceCheck"),
    invidiousStatus: document.getElementById("invidiousInstanceStatus"),
    pipedStatus: document.getElementById("pipedInstanceStatus"),
    downloadFreetube: document.getElementById("freetubeDownload"),
    downloadOpentubex: document.getElementById("opentubexDownload"),
    shortcutEnabled: document.getElementById("shortcutEnabled"),
    shortcutBehavior: document.getElementById("shortcutBehavior"),
    shortcutOptions: document.getElementById("shortcutOptions"),
    changeShortcutButton: document.getElementById("changeShortcutButton"),
    shortcutFirefoxHint: document.getElementById("shortcutFirefoxHint"),
};

const radios = Array.from(
    document.querySelectorAll('.player-option input[type="radio"]')
);

const validationTimers = new Map();
let currentValidationToken = 0;
const _registeredListeners = [];

function addListener(target, type, handler, options) {
    if (!target || !target.addEventListener) return;
    target.addEventListener(type, handler, options);
    _registeredListeners.push({ target, type, handler, options });
}

function cleanupEventListeners() {
    _registeredListeners.forEach(({ target, type, handler, options }) => {
        try {
            target.removeEventListener(type, handler, options);
        } catch (e) {}
    });
    _registeredListeners.length = 0;
}

function toMessageName(key) {
    return key
        .split(".")
        .map((segment) => segment.trim())
        .filter(Boolean)
        .join("_")
        .replace(/[^A-Za-z0-9_]/g, "_");
}

function getMessage(key, fallback = "") {
    if (
        !extensionApi ||
        !extensionApi.i18n ||
        typeof extensionApi.i18n.getMessage !== "function"
    ) {
        return fallback;
    }
    const messageName = toMessageName(key);
    return extensionApi.i18n.getMessage(messageName) || fallback;
}

function getSelectedPlayer() {
    const selected = document.querySelector(
        '.player-option input[type="radio"]:checked'
    );
    return selected ? selected.value : null;
}

function getRadioByPlayer(player) {
    return document.querySelector(
        '.player-option input[type="radio"][value="' + player + '"]'
    );
}

function setVisibleStep(stepNumber) {
    STEPS.first.hidden = stepNumber !== 1;
    STEPS.second.hidden = stepNumber !== 2;
    STEPS.third.hidden = stepNumber !== 3;
}

function setPanelVisibility(activePlayer) {
    CONTROLS.freetubePanel.hidden = activePlayer !== "freetube";
    CONTROLS.invidiousPanel.hidden = activePlayer !== "invidious";
    CONTROLS.pipedPanel.hidden = activePlayer !== "piped";
    CONTROLS.opentubexPanel.hidden = activePlayer !== "opentubex";
}

function isFirefox() {
    return Boolean(extensionApi.runtime.getManifest().browser_specific_settings);
}

function openShortcutsSettings() {
    if (isFirefox()) {
        // Firefox's tabs API refuses to navigate to privileged about: pages,
        // so there's no way to deep-link there — the hint text guides the user instead.
        return;
    }
    extensionApi.tabs.create({ url: "chrome://extensions/shortcuts" });
}

function applyShortcutBrowserUI() {
    const onFirefox = isFirefox();
    if (CONTROLS.changeShortcutButton) {
        CONTROLS.changeShortcutButton.hidden = onFirefox;
    }
    if (CONTROLS.shortcutFirefoxHint) {
        CONTROLS.shortcutFirefoxHint.hidden = !onFirefox;
    }
}

function setInstanceStatus(player, type, message) {
    const node =
        player === "invidious"
            ? CONTROLS.invidiousStatus
            : CONTROLS.pipedStatus;
    if (!node) {
        return;
    }
    node.classList.remove("is-ok", "is-error");
    if (type === "ok") {
        node.classList.add("is-ok");
    } else if (type === "error") {
        node.classList.add("is-error");
    }
    node.textContent = message || "";
}

function clearInstanceStatus(player) {
    setInstanceStatus(player, null, "");
}

function getInstanceInput(player) {
    return player === "invidious"
        ? CONTROLS.invidiousInput
        : CONTROLS.pipedInput;
}

function getInstanceCheckButton(player) {
    return player === "invidious"
        ? CONTROLS.invidiousCheck
        : CONTROLS.pipedCheck;
}

function getPreferredInstanceStorageKey(player) {
    return PLAYER_STORAGE_KEY_BY_PLAYER[player] || null;
}

function normalizeInstanceUrl(rawValue) {
    const trimmed = (rawValue || "").trim();
    if (!trimmed) {
        return "";
    }

    const urlWithProtocol = /^https?:\/\//i.test(trimmed)
        ? trimmed
        : `https://${trimmed}`;

    const parsed = new URL(urlWithProtocol);
    return parsed.origin;
}

async function storageGet(keys) {
    const globalStorage = (typeof window !== 'undefined' && window.storage) ? window.storage : null;
    if (globalStorage && typeof globalStorage.get === 'function') {
        try {
            return await globalStorage.get(keys);
        } catch (e) {
            return {};
        }
    }

    if (
        !extensionApi ||
        !extensionApi.storage ||
        !extensionApi.storage.local ||
        typeof extensionApi.storage.local.get !== "function"
    ) {
        return {};
    }

    return new Promise((resolve) => {
        extensionApi.storage.local.get(keys, (result) => {
            if (
                extensionApi.runtime &&
                extensionApi.runtime.lastError &&
                extensionApi.runtime.lastError.message
            ) {
                resolve({});
                return;
            }
            resolve(result || {});
        });
    });
}

async function storageSet(values) {
    const globalStorage = (typeof window !== 'undefined' && window.storage) ? window.storage : null;
    if (globalStorage && typeof globalStorage.set === 'function') {
        try {
            return await globalStorage.set(values);
        } catch (e) {
            return;
        }
    }

    if (
        !extensionApi ||
        !extensionApi.storage ||
        !extensionApi.storage.local ||
        typeof extensionApi.storage.local.set !== "function"
    ) {
        return;
    }

    return new Promise((resolve) => {
        extensionApi.storage.local.set(values, () => resolve());
    });
}

async function restoreSelectedPlayer() {
    const result = await storageGet(STORAGE_KEYS.selectedPlayer);
    const selectedPlayer = result[STORAGE_KEYS.selectedPlayer];
    if (!selectedPlayer) {
        return null;
    }

    const radio = getRadioByPlayer(selectedPlayer);
    if (radio) {
        radio.checked = true;
    }
    return selectedPlayer;
}

async function restorePreferredInstance(player) {
    const storageKey = getPreferredInstanceStorageKey(player);
    if (!storageKey) {
        return DEFAULT_INSTANCE_BY_PLAYER[player] || "";
    }

    const result = await storageGet(storageKey);
    return result[storageKey] || DEFAULT_INSTANCE_BY_PLAYER[player] || "";
}

async function saveSelectedPlayer(player) {
    await storageSet({ [STORAGE_KEYS.selectedPlayer]: player });
}

async function savePreferredInstance(player, value) {
    const storageKey = getPreferredInstanceStorageKey(player);
    if (!storageKey) {
        return;
    }
    await storageSet({ [storageKey]: value });
}

async function validateInstance(player, rawValue) {
    const normalizedValue = normalizeInstanceUrl(rawValue);
    if (!normalizedValue) {
        throw new Error("missing-instance");
    }

    const validationPath = VALIDATION_PATH_BY_PLAYER[player];
    const validationUrl = new URL(validationPath, normalizedValue).toString();
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 8000);

    try {
        const response = await fetch(validationUrl, {
            method: "GET",
            cache: "no-store",
            redirect: "follow",
            signal: controller.signal,
        });

        if (!response.ok) {
            throw new Error(`http-${response.status}`);
        }

        return normalizedValue;
    } finally {
        window.clearTimeout(timeoutId);
    }
}

function setStep2NextEnabled(enabled) {
    CONTROLS.step2Next.disabled = !enabled;
}

function setFinishEnabled(enabled) {
    CONTROLS.finish.disabled = !enabled;
}

function setNextEnabled(enabled) {
    if (CONTROLS.next) {
        CONTROLS.next.disabled = !enabled;
    }
}

function cancelPendingValidations() {
    validationTimers.forEach((timerId) => {
        window.clearTimeout(timerId);
    });
    validationTimers.clear();
    currentValidationToken += 1;
}

function openExternalLink(url) {
    window.open(url, "_blank", "noopener,noreferrer");
}

async function runInstanceValidation(player) {
    const input = getInstanceInput(player);
    const checkButton = getInstanceCheckButton(player);
    if (!input || !checkButton) {
        return;
    }

    const token = ++currentValidationToken;
    const rawValue = input.value;
    const checkingMessage = getMessage(
        "introduction.step2.instance.checking",
        "Checking instance..."
    );
    const validMessage = getMessage(
        "introduction.step2.instance.valid",
        "The instance looks valid."
    );
    const invalidMessage = getMessage(
        "introduction.step2.instance.invalid",
        "This instance could not be verified."
    );
    const requiredMessage = getMessage(
        "introduction.step2.instance.required",
        "Enter an instance URL to continue."
    );

    checkButton.disabled = true;
    setStep2NextEnabled(false);

    try {
        if (!rawValue.trim()) {
            throw new Error("missing-instance");
        }

        setInstanceStatus(player, null, checkingMessage);
        const normalizedValue = await validateInstance(player, rawValue);

        if (token !== currentValidationToken) {
            return;
        }

        input.value = normalizedValue;
        await savePreferredInstance(player, normalizedValue);
        setInstanceStatus(player, "ok", validMessage);
        setStep2NextEnabled(true);
    } catch (error) {
        if (token !== currentValidationToken) {
            return;
        }

        const isMissing = error && error.message === "missing-instance";
        setInstanceStatus(player, "error", isMissing ? requiredMessage : invalidMessage);
        setStep2NextEnabled(false);
    } finally {
        if (token === currentValidationToken) {
            checkButton.disabled = false;
        }
    }
}

function scheduleInstanceValidation(player, delay = 500) {
    const existingTimer = validationTimers.get(player);
    if (existingTimer) {
        window.clearTimeout(existingTimer);
    }

    const timerId = window.setTimeout(() => {
        validationTimers.delete(player);
        runInstanceValidation(player);
    }, delay);

    validationTimers.set(player, timerId);
}

async function renderStep2() {
    const player = getSelectedPlayer();
    if (!player) {
        return;
    }

    setVisibleStep(2);
    setPanelVisibility(player);

    if (player === "freetube" || player === "opentubex") {
        setStep2NextEnabled(true);
        return;
    }

    const input = getInstanceInput(player);
    if (!input) {
        return;
    }

    const preferredInstance = await restorePreferredInstance(player);
    input.value = preferredInstance;
    setStep2NextEnabled(false);
    scheduleInstanceValidation(player, 0);
}

async function renderStep3() {
    setVisibleStep(3);

    const result = await storageGet([
        STORAGE_KEYS.shortcutEnabled,
        STORAGE_KEYS.shortcutBehavior,
    ]);
    const isEnabled =
        result[STORAGE_KEYS.shortcutEnabled] !== undefined
            ? Boolean(result[STORAGE_KEYS.shortcutEnabled])
            : DEFAULT_SHORTCUT_ENABLED;
    const behavior =
        result[STORAGE_KEYS.shortcutBehavior] || DEFAULT_SHORTCUT_BEHAVIOR;

    CONTROLS.shortcutEnabled.checked = isEnabled;
    CONTROLS.shortcutBehavior.value = behavior;
    CONTROLS.shortcutOptions.hidden = !isEnabled;

    setFinishEnabled(true);
}

function handleStep2Next() {
    if (CONTROLS.step2Next.disabled) {
        return;
    }
    renderStep3();
}

function handleStep3Back() {
    setVisibleStep(2);
}

function handlePlayerChange(event) {
    const radio = event.currentTarget;
    if (!radio || !radio.checked) {
        return;
    }

    setNextEnabled(true);
    saveSelectedPlayer(radio.value);
}



function handleNext() {
    const selectedPlayer = getSelectedPlayer();
    if (!selectedPlayer) {
        return;
    }

    renderStep2();
}

function handleBack() {
    cancelPendingValidations();
    clearInstanceStatus("invidious");
    clearInstanceStatus("piped");
    setVisibleStep(1);
    setStep2NextEnabled(false);
}

function initPlayerSelection() {
    radios.forEach((radio) => {
        addListener(radio, "change", handlePlayerChange);
    });

    document.querySelectorAll(".player-option").forEach((label) => {
        const keyHandler = (event) => {
            if (event.key === "Enter" || event.key === " " || event.code === "Space") {
                event.preventDefault();
                const input = label.querySelector('input[type="radio"]');
                if (input) {
                    input.checked = true;
                    input.dispatchEvent(new Event("change", { bubbles: true }));
                }
            }
        };
        addListener(label, "keydown", keyHandler);
    });
}

function initStep2Controls() {
    if (CONTROLS.invidiousInput) {
        addListener(CONTROLS.invidiousInput, "input", () => scheduleInstanceValidation("invidious"));
        addListener(CONTROLS.invidiousInput, "blur", () => scheduleInstanceValidation("invidious", 0));
    }

    if (CONTROLS.pipedInput) {
        addListener(CONTROLS.pipedInput, "input", () => scheduleInstanceValidation("piped"));
        addListener(CONTROLS.pipedInput, "blur", () => scheduleInstanceValidation("piped", 0));
    }

    if (CONTROLS.invidiousCheck) {
        addListener(CONTROLS.invidiousCheck, "click", () => runInstanceValidation("invidious"));
    }

    if (CONTROLS.pipedCheck) {
        addListener(CONTROLS.pipedCheck, "click", () => runInstanceValidation("piped"));
    }

    if (CONTROLS.downloadFreetube) {
        addListener(CONTROLS.downloadFreetube, "click", (event) => {
            event.preventDefault();
            openExternalLink("https://freetubeapp.io/");
        });
    }

    if (CONTROLS.downloadOpentubex) {
        addListener(CONTROLS.downloadOpentubex, "click", (event) => {
            event.preventDefault();
            openExternalLink("https://opentubex.org/");
        });
    }
}

function initStep3Controls() {
    if (CONTROLS.shortcutEnabled) {
        addListener(CONTROLS.shortcutEnabled, "change", (event) => {
            CONTROLS.shortcutOptions.hidden = !event.target.checked;
        });
    }

    if (CONTROLS.changeShortcutButton) {
        addListener(CONTROLS.changeShortcutButton, "click", openShortcutsSettings);
    }

    applyShortcutBrowserUI();
}

async function init() {
    if (CONTROLS.next) {
        addListener(CONTROLS.next, "click", handleNext);
    }

    if (CONTROLS.back) {
        addListener(CONTROLS.back, "click", handleBack);
    }

    if (CONTROLS.step2Next) {
        addListener(CONTROLS.step2Next, "click", handleStep2Next);
    }

    if (CONTROLS.step3Back) {
        addListener(CONTROLS.step3Back, "click", handleStep3Back);
    }

    if (CONTROLS.finish) {
        addListener(CONTROLS.finish, "click", handleFinish);
    }

    initPlayerSelection();
    initStep2Controls();
    initStep3Controls();

    await restoreSelectedPlayer();
    setVisibleStep(1);
    setNextEnabled(!!getSelectedPlayer());
    setStep2NextEnabled(false);

    const selectedPlayer = getSelectedPlayer();
    if (selectedPlayer) {
        saveSelectedPlayer(selectedPlayer);
    }
}

document.addEventListener("redirecttube:translations-loaded", () => {
    const selectedPlayer = getSelectedPlayer();
    if (selectedPlayer) {
        saveSelectedPlayer(selectedPlayer);
    }
});

// cleanup listeners on finish/back
async function handleFinish() {
    if (CONTROLS.finish.disabled) {
        return;
    }

    await storageSet({
        [STORAGE_KEYS.introductionComplete]: true,
        [STORAGE_KEYS.shortcutEnabled]: CONTROLS.shortcutEnabled.checked,
        [STORAGE_KEYS.shortcutBehavior]: CONTROLS.shortcutBehavior.value,
    });

    cleanupEventListeners();
    cancelPendingValidations();
    window.close();
}

// override previous binding of handleFinish in case we redefined it above


init().catch((error) => {
    console.error("Failed to initialize introduction", error);
});