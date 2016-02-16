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
#     disables a whole lot of stuff and hammer's DJB's site.  Use "c" for
#     "control" mode (ie don't do any instrumentation, just take measurements)
#     and "t" for test mode (do the instrumentation too).

SCRIPT_DIR=$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd );
FF_API_DEPTH=2;
FF_API_URL_PER_PAGE=3;
FF_API_SEC_PER_PAGE=30;
FF_API_MANUAL=0;
FF_API_RELATED_DOMAINS="";
FF_PATH="";
TEST_PROFILE="y2hug1jy.Control";
TIMEOUT_CMD="timeout 180";
FF_API_PERFORMANCE="";

while getopts r:n:s:b:u:d:me opt; do
  case $opt in
    e)
      TEST_PROFILE="oqzhxmvs.Test";
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
  echo "Error: No Firefox binary path given.";
  exit 1;
fi;


CUR_PROFILE="~/.mozilla/firefox/$TEST_PROFILE";
if [[ -d $CUR_PROFILE ]]; then
	rm -Rf $CUR_PROFILE;
fi;

TMP_PROFILE_NAME="$TEST_PROFILE-$RANDOM";

cp -r $SCRIPT_DIR/data/$TEST_PROFILE /tmp/$TMP_PROFILE_NAME;

FF_API_PERFORMANCE=$FF_API_PERFORMANCE FF_API_URL=$FF_API_URL FF_API_RELATED_DOMAINS=$FF_API_RELATED_DOMAINS FF_API_MANUAL=$FF_API_MANUAL FF_API_DEPTH=$FF_API_DEPTH FF_API_URL_PER_PAGE=$FF_API_URL_PER_PAGE FF_API_SEC_PER_PAGE=$FF_API_SEC_PER_PAGE $TIMEOUT_CMD $FF_PATH --profile /tmp/$TMP_PROFILE_NAME;

rm -Rf /tmp/$TMP_PROFILE_NAME;
