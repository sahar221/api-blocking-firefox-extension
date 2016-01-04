(function () {
    "use strict";

    var uicGlobal = window.UICGLOBAL;

    uicGlobal.features = {};
    uicGlobal.featuresLoaded = false;

    self.port.on("content-receive-existing-rules", features => {
        uicGlobal.debug("content-receive-existing-rules");
        Object.keys(features).forEach(aName => {
            uicGlobal.features[aName] = eval("[" + features[aName] + "]")[0];
        });
        uicGlobal.featuresLoaded = true;
        if (uicGlobal.instrumentTheDom) {
            uicGlobal.instrumentTheDom();
        }
    });
    self.port.emit("content-request-existing-rules");

    self.port.on("content-receive-should-reload", () => {
        window.location.reload();
    });
}());
