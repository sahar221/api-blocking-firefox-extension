(function () {
    "use strict";

    var featuresTableBody = document.getElementById("features-existing-table-body"),
        reloadButton = document.getElementById("features-existing-reload"),
        newFeatureInput,
        newFeatureButton,
        keyPathToClassName,
        reloadCallback;


    keyPathToClassName = function (aKeyPath) {
        return "feature-" + aKeyPath.toLowerCase().replace(".", "-");
    };


    reloadCallback = function () {
        var bodyCell = document.createElement("TD");
        bodyCell.colspan = "4";
        bodyCell.innerHTML = "Reloading…";

        featuresTableBody.innerHTML = "";
        reloadButton.disabled = "disabled";
        featuresTableBody.appendChild(bodyCell);

        self.port.emit("pref-page-request-features-update");
    };
    reloadButton.addEventListener("click", reloadCallback, false);


    self.port.on("pref-page-receive-delete-feature", function (message) {

        var [featureName, wasDeleted] = message,
            featureNameAsClass = keyPathToClassName(featureName),
            deletedRow;

        if (!wasDeleted) {
            alert("Unable to delete a preference for feature '" + featureName + "'");
            return;
        }

        deletedRow = document.getElementsByClassName(featureNameAsClass);
        if (deletedRow.length > 0) {
            deletedRow[0].parentNode.removeChild(deletedRow[0]);
        }

        reloadCallback();
    });


    self.port.on("pref-page-receive-features-update", allFeatures => {

        // Map the keypath -> object pairs of feature preferences into
        // an array of feature preferences, in alphabetical order.
        allFeatures.sort((a, b) => a.feature.localeCompare(b.feature));

        featuresTableBody.innerHTML = "";
        reloadButton.disabled = "";

        allFeatures.forEach(function (aFeature) {

            var featureNameCell = document.createElement("TD"),
                typeCell = document.createElement("TD"),
                timesSeenCell = document.createElement("TD"),
                actionCell = document.createElement("TD"),
                actionButton = document.createElement("BUTTON"),
                rowElm = document.createElement("TR"),
                domainsSeenCell = document.createElement("TD");

            featureNameCell.innerHTML = aFeature.feature;
            typeCell.innerHTML = aFeature.type;
            timesSeenCell.innerHTML = aFeature.count;
            domainsSeenCell.innerHTML = aFeature.domainCount;


            actionButton.innerHTML = "Delete";
            actionButton.addEventListener("click", () => {
                self.port.emit("pref-page-request-delete-feature", aFeature.feature);
                actionButton.disabled = "disabled";
            }, false);
            actionCell.appendChild(actionButton);


            [featureNameCell, typeCell, timesSeenCell, domainsSeenCell, actionCell].forEach(aCell => {
                rowElm.appendChild(aCell);
            });
            rowElm.className = keyPathToClassName(aFeature.feature);

            featuresTableBody.appendChild(rowElm);
        });
    });


    newFeatureInput = document.getElementById("features-new-input");
    newFeatureButton = document.getElementById("features-new-submit");
    newFeatureButton.addEventListener("click", event => {
        self.port.emit("pref-page-request-add-features", newFeatureInput.value);
        newFeatureButton.disabled = "disabled";
        newFeatureInput.disabled = "disabled";
        event.preventDefault();
    }, false);


    self.port.on("pref-page-receive-add-features", badRules => {

        if (badRules.length > 0) {
            alert("One or more of the entered feature rules could not be parsed.  Un-parseable ones have been left in the textarea.");
        }

        newFeatureInput.value = "";
        badRules.forEach(aRule => newFeatureInput.value += aRule + "\n");

        newFeatureButton.disabled = "";
        newFeatureInput.disabled = "";

        reloadCallback();
    });

    reloadCallback();
}());

