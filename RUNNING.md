# Feature Blocking Extension

## Prerequisites
 1. Download / install [Firefox](https://www.mozilla.org/en-US/firefox/all/#en-US).
 2. Install [node](https://nodejs.org/en/) and [npm](https://www.npmjs.com/), which will be something like `brew install node` or `apt-get install nodejs npm`.
 3. Install [JPM](https://developer.mozilla.org/en-US/Add-ons/SDK/Tools/jpm#Installation) (the Firefox extension bootstrapping library).  This should just be `npm install jpm --global`.

## Running The Extension
In the root of this repo, run `jpm run` to launch a new version of Firefox
with the extension running.  You should see a new, clean version of Firefox
with no extensions installed.  You'll know the extension is running if there
is an errant Firefox logo (hence forth EFL, since I don't know what to call it)
in the location bar.

## Adding Rules
If you click the EFL, you'll see a page that shows all the blocking rules
currently installed, along with a text area at the bottom where you can
copy-paste new rules into the browser describing features that should be
blocked.

Rules on what features to block are defined through javascript objects 
with two keys:

  * "type": A string describing the type of the feature being blocked.  Should
            be one of the following strings: "event", "method", "promise",
            "property"
  * "feature": If the feature being blocked is an event, this must be
               a string, giving the name of the event to be blocked, such
               as "click".  For all other features, this is an array
               giving a keypath of where the given feature is located
               in the DOM, such as `["Document", "prototype", "getElementById"]`.

Below are some examples of valid rules, describing features to block:

    {"type": "event", "feature": "mouseup"}
    {"type": "method", "feature": ["Element", "prototype", "getElementsByTagName"]}
    {"type": "property", "feature": ["Document", "prototype", "cookie"]}
