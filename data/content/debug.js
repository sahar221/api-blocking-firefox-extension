(function () {

    var scriptGlobal = createObjectIn(unsafeWindow, {defineAs: "UICGLOBAL"});

    window.UICGLOBAL = {
        "script": scriptGlobal
    };


    /**
     * Wrapper function that'll print the given debug message to the console
     * if we're in debug mode, and otherwise will do nothing.
     *
     * @param string msg
     *   A message to send to the console if we're in debug mode.
     */
    window.UICGLOBAL.debug = (function () {

        // Save ourselves a whole lot of unnecessary hash operations
        // by just dereferencing this once and storing it in the closure.
        var isDebugMode = !!self.options.debug;

        return function (msg) {
            if (!isDebugMode) {
                return;
            }
            console.log(msg);
        };
    }());
    window.UICGLOBAL.script.debug = exportFunction(window.UICGLOBAL.debug, unsafeWindow, {
        allowCrossOriginArguments: true
    })
}());
