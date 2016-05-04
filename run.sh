#!/usr/bin/env bash

# Commandline options for running the instrumented version of the browser
#  -r How many sites deep we should search (ie how many levels do we recurse).
#     Defaults to 2
#  -n What is the maximum number of URLs to open per page.  Defaults to 5
#  -s How many seconds to wait on each page to let the page execute
#     and be poked at by the "gremlins".  Defaults to 30.
#  -b Path to the firefox binary to run.  Otherwise, defaults to
#     whatever is in the system path.\
#  -u The root URL to query
#  -e Whether to run the tests with extensions / addons enabled.  By default
#     the tests are run with no extensions.  Passing "-e" will enable
#     adblockplus and ghostery
#  -m Whether to put the extension into manual mode, in which case we don't
#     inject the gremlins code or open new tabs, and just record the user's
#     interactions
#  -p Put the extension in performance measurement mode.  Basically just
#     disables a whole lot of stuff and hammers DJB's site.  Use "c" for
#     "control" mode (ie don't do any instrumentation, just take measurements)
#     and "t" for test mode (do the instrumentation too).
#  -j If passed, the produced JSON report will also include a report on the
#     sources of javascript executed in the page
#  -x If passed, then firefox is run in Xvfb instead of the current display

SCRIPT_DIR=$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd );
FF_API_DEPTH=2;
FF_API_URL_PER_PAGE=3;
FF_API_SEC_PER_PAGE=30;
FF_API_MANUAL=0;
FF_API_RELATED_DOMAINS="";
FF_API_JS_REPORT=0;
FF_PATH="";
TEST_PROFILE="n7hzhgm2.Control";
TIMEOUT_CMD="timeout 180";
FF_API_PERFORMANCE="";
XVFB_CMD="";


TRACKING_PROFILE="1c5c8f0.Tracking";
ADBLOCK_PROFILE="f8175c3.Ads";


while getopts r:n:s:b:u:d:mejxat opt; do
  case $opt in
    a)
      TEST_PROFILE=$ADBLOCK_PROFILE;
      ;;

    t)
      TEST_PROFILE=$TRACKING_PROFILE;
      ;;

    x)
      XVFB_CMD="xvfb-run --auto-servernum --server-args='-screen 0 1280x1024x24'";
      ;;

    j)
      FF_API_JS_REPORT=1;
      ;;

    e)
      TEST_PROFILE="uv52zv9c.Test";
      ;;

    d)
      FF_API_RELATED_DOMAINS=$OPTARG;
      ;;

    r)
      FF_API_DEPTH=$OPTARG;
      ;;

    n)
      FF_API_URL_PER_PAGE=$OPTARG;
      ;;

    s)
      FF_API_SEC_PER_PAGE=$OPTARG;
      ;;

    m)
      FF_API_MANUAL=1;
      TIMEOUT_CMD="";
      ;;

    b)
      FF_PATH=$OPTARG;
      ;;

    u)
      FF_API_URL=$OPTARG;
      ;;

    p)
      FF_API_PERFORMANCE=$OPTARG;
      FF_API_MANUAL=1;
      TIMEOUT_CMD="";
      FF_API_URL="http://cr.yp.to/";
      ;;
  esac;
done;

if [[ -z $FF_API_URL ]] && [[ $FF_API_MANUAL == 0 ]]; then
  echo "Error: No URL provided to query."
  exit 1;
fi;


if [[ -z $FF_PATH ]]; then
  FF_PATH="/home/psnyde2/firefox/firefox";
fi;


TMP_PROFILE_NAME="$TEST_PROFILE-$RANDOM";

cp -r $SCRIPT_DIR/data/$TEST_PROFILE /tmp/$TMP_PROFILE_NAME;

FF_API_PERFORMANCE=$FF_API_PERFORMANCE \
  FF_API_URL=$FF_API_URL \
  FF_API_JS_REPORT=$FF_API_JS_REPORT \
  FF_API_RELATED_DOMAINS=$FF_API_RELATED_DOMAINS \
  FF_API_MANUAL=$FF_API_MANUAL \
  FF_API_DEPTH=$FF_API_DEPTH \
  FF_API_URL_PER_PAGE=$FF_API_URL_PER_PAGE \
  FF_API_SEC_PER_PAGE=$FF_API_SEC_PER_PAGE \
  $TIMEOUT_CMD \
  xvfb-run --auto-servernum --server-args='-screen 0 1280x1024x24' \
  $FF_PATH --profile /tmp/$TMP_PROFILE_NAME;

rm -Rf /tmp/$TMP_PROFILE_NAME;

