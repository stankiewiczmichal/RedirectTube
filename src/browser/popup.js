const extensionApi = typeof chrome !== "undefined" ? chrome : browser;

var errorText = document.getElementById("errorText");
var redirectButton = document.getElementById("redirectButton");
var optionsButton = document.getElementById("optionsButton");
var opinionButton = document.getElementById("opinionButton");
var suggestionButton = document.getElementById("suggestionButton");
var issueButton = document.getElementById("issueButton");

let cachedPopupSettings = null;

document.addEventListener("DOMContentLoaded", function () {
    extensionApi.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        var url = tabs[0].url;
        extensionApi.storage.local.get(
            [
                STORAGE_KEYS.urlRulesConfig,
                "popupBehavior",
                STORAGE_KEYS.selectedPlayer,
                STORAGE_KEYS.preferredInvidiousInstance,
                STORAGE_KEYS.preferredPipedInstance,
            ],
            function (result = {}) {
                const normalizedRules = normalizeUrlRulesConfig(
                    result[STORAGE_KEYS.urlRulesConfig]
                );

                cachedPopupSettings = result;
                const selectedPlayer = (result && result[STORAGE_KEYS.selectedPlayer]) || "freetube";
                updateRedirectButtonLabel(selectedPlayer);

                if (!isRedirectableYoutubeUrl(url, normalizedRules)) {
                    errorText.textContent = getBlockedMessage(selectedPlayer);
                    redirectButton.disabled = true;
                    return;
                }

                if (result && result.popupBehavior === "redirect") {
                    openInSelectedPlayer(url, tabs, result);
                }
            }
        );
    });
});

function openInSelectedPlayer(url, tabs, storageResult) {
    const selectedPlayer = storageResult[STORAGE_KEYS.selectedPlayer] || "freetube";
    const preferredInvidiousInstance =
        storageResult[STORAGE_KEYS.preferredInvidiousInstance] ||
        DEFAULT_PREFERRED_INVIDIOUS_INSTANCE;
    const preferredPipedInstance =
        storageResult[STORAGE_KEYS.preferredPipedInstance] ||
        DEFAULT_PREFERRED_PIPED_INSTANCE;

    const finalUrl = buildRedirectUrl(
        url,
        selectedPlayer,
        preferredInvidiousInstance,
        preferredPipedInstance
    );

    extensionApi.tabs.update(tabs[0].id, { url: finalUrl });
    window.close();
}

function updateRedirectButtonLabel(selectedPlayer) {
    const dynamicKey = "ui.button.redirect_" + selectedPlayer;
    let label = getMessageByKey(dynamicKey) || getMessageByKey("ui.button.redirect");
    if (!label) {
        return;
    }

    const playerLabel =
        getMessageByKey("options.playerSettings." + selectedPlayer) || selectedPlayer;
    label = label.replace(/FreeTube/g, playerLabel);
    redirectButton.textContent = label;
}

function getBlockedMessage(selectedPlayer) {
    const perPlayerKey = "ui.error.e404_" + selectedPlayer;
    let message = getMessageByKey(perPlayerKey) || getMessageByKey("ui.error.e404");
    if (!message) {
        message = "Cannot open this page in FreeTube.";
    }

    const playerLabel =
        getMessageByKey("options.playerSettings." + selectedPlayer) || selectedPlayer;
    return message.replace(/FreeTube/g, playerLabel);
}

redirectButton.addEventListener("click", function () {
    if (redirectButton.disabled === false) {
        extensionApi.tabs.query(
            { active: true, currentWindow: true },
            function (tabs) {
                var url = tabs[0].url;
                if (cachedPopupSettings) {
                    openInSelectedPlayer(url, tabs, cachedPopupSettings);
                    return;
                }
                extensionApi.storage.local.get(
                    [
                        STORAGE_KEYS.selectedPlayer,
                        STORAGE_KEYS.preferredInvidiousInstance,
                        STORAGE_KEYS.preferredPipedInstance,
                    ],
                    function (result = {}) {
                        cachedPopupSettings = result;
                        openInSelectedPlayer(url, tabs, result);
                    }
                );
            }
        );
    }
});

optionsButton.addEventListener("click", function () {
    window.open("options.html");
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
