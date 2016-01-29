#!/usr/bin/env bash

# Commandline options for running the instrumented version of the browser
#  -r How many sites deep we should search (ie how many levels do we recurse).
#     Defaults to 2
#  -n What is the maximum number of URLs to open per page.  Defaults to 5
#  -s How many seconds to wait on each page to let the page execute
#     and be poked at by the "gremlins".  Defaults to 30.
#  -m Whether to merge the results of the API counts into a single JSON
#     object / count, to count each requested page seperatly.  Defaults to
#     counting seperatly.  This is a flag and takes no arguments
#  -b Path to the firefox binary to run.  Otherwise, defaults to
#     whatever is in the system path.\
#  -u The root URL to query
#  -e Whether to run the tests with extensions / addons enabled.  By default
#     the tests are run with no extensions.  Passing "-e" will enable
#     adblockplus and ghostery

SCRIPT_DIR=$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd );
FF_API_DEPTH=2;
FF_API_URL_PER_PAGE=5;
FF_API_SEC_PER_PAGE=30;
FF_API_MERGE=0;
FF_API_RELATED_DOMAINS="";
FF_PATH="";
TEST_PROFILE="vy96i6we.Control";

while getopts r:n:s:b:u:d:me opt; do
  case $opt in
    e)
      TEST_PROFILE="m2e8hrq8.Test";
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
      FF_API_MERGE=1;
      ;;

    b)
      FF_PATH=$OPTARG;
      ;;

    u)
      FF_API_URL=$OPTARG;
      ;;
  esac;
done;

if [[ -z $FF_API_URL ]]; then
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

cp -r $SCRIPT_DIR/data/$TEST_PROFILE /tmp/$TEST_PROFILE;

FF_API_URL=$FF_API_URL FF_API_RELATED_DOMAINS=$FF_API_RELATED_DOMAINS FF_API_MERGE=$FF_API_MERGE FF_API_DEPTH=$FF_API_DEPTH FF_API_URL_PER_PAGE=$FF_API_URL_PER_PAGE FF_API_SEC_PER_PAGE=$FF_API_SEC_PER_PAGE $FF_PATH --profile /tmp/$TEST_PROFILE;

rm -Rf /tmp/$TEST_PROFILE;
