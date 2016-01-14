(function () {
    "use strict";

    var global = window.UICGLOBAL,
        parsedFeatures = {
            event: [],
            method: [],
            promise: [],
            property: []
        };
    global.featuresLoaded = false;

    self.options.features.forEach(aRule => parsedFeatures[aRule.type].push(aRule.feature));
    global.script.features = cloneInto(parsedFeatures, unsafeWindow);
    global.featuresLoaded = true;
    if (global.instrumentTheDom) {
        global.instrumentTheDom();
    }

    self.port.on("content-receive-should-reload", () => {
        unsafeWindow.location.reload();
    });
}());
