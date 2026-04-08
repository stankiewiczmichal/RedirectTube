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
        if (
            url.startsWith("https://www.youtube.com/watch?v=") ||
            url.startsWith("https://www.youtube.com/playlist?list=") ||
            url.startsWith("https://www.youtube.com/@") ||
            url.startsWith("https://www.youtube.com/channel/") ||
            url.startsWith("https://www.youtube.com/live/")
        ) {
            loadOptions(url, tabs);
        } else {
            errorText.textContent =
                getMessageByKey("ui.error.e404") ||
                "Cannot open this page in FreeTube.";
            redirectButton.disabled = true;
        }
    });
});

function loadOptions(url, tabs) {
    extensionApi.storage.local.get("popupBehavior", function (result) {
        if (result && result.popupBehavior === "redirect") {
            openInFreeTube(url, tabs);
        }
    });
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
                openInFreeTube(url, tabs);
            }
        );
    }
});

optionsButton.addEventListener("click", function () {
    extensionApi.runtime.openOptionsPage();
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
        "https://github.com/MStankiewiczOfficial/RedirectTube/issues/new?assignees=MStankiewiczOfficial&labels=enhancement&projects=&template=feature-request.yml&title=%5BFR%5D%3A+"
    );
});

issueButton.addEventListener("click", function () {
    openExternalLink(
        "https://github.com/MStankiewiczOfficial/RedirectTube/issues/new?assignees=MStankiewiczOfficial&labels=bug&projects=&template=bug-report.yml&title=%5BBug%5D%3A+"
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
