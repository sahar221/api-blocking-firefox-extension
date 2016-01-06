(function () {
    "use strict";

    var global = window.UICGLOBAL;
    global.featuresLoaded = false;


    self.port.on("content-receive-existing-rules", function (features) {

        var parsedFeatures = {
            event: [],
            method: [],
            promise: [],
            property: []
        };

        global.debug("content-receive-existing-rules");

        Object.keys(features).forEach(function (aName) {
            var evaledRule = eval("[" + features[aName] + "]")[0];
            parsedFeatures[evaledRule.type].push(evaledRule.feature);
        });

        global.script.features = cloneInto(parsedFeatures, unsafeWindow);

        global.featuresLoaded = true;
        if (global.instrumentTheDom) {
            global.instrumentTheDom();
        }
    });
    self.port.emit("content-request-existing-rules");

    self.port.on("content-receive-should-reload", () => {
        unsafeWindow.location.reload();
    });
}());
