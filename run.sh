#!/usr/bin/env bash

# Commandline options for running the instrumented version of the browser
#  -d How many sites deep we should search (ie how many levels do we recurse).
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

FF_API_DEPTH=2;
FF_API_URL_PER_PAGE=5;
FF_API_SEC_PER_PAGE=30;
FF_API_MERGE=0;
FF_PATH="";
URL="";

while getopts :d:n:s:m:b:u: opt; do
  case $opt in
    d)
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
      URL=$OPTARG;
      ;;
  esac;
done;

if [[ -z $URL ]]; then
  echo "Error: No URL provided to query."
  exit 1;
fi;


if [[ -n $FF_PATH ]]; then
  FF_PATH="-b $FF_PATH";
fi;

FF_API_MERGE=$FF_API_MERGE FF_API_DEPTH=$FF_API_DEPTH FF_API_URL_PER_PAGE=$FF_API_URL_PER_PAGE FF_API_SEC_PER_PAGE=$FF_API_SEC_PER_PAGE jpm run --binary-args "$URL" $FF_PATH | grep "console.log: api-blocker: " | sed 's/console\.log: api-blocker: //g';
