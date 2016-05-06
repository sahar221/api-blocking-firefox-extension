#!/usr/bin/env bash

if [[ -z $1 ]]; then
  echo "Usage: $0 <destination dir> [firefox binary]";
  exit 1;
fi;

DEST_DIR=$1;

if [[ -z $2 ]]; then
  FIREFOX=`which firefox`;
else
  FIREFOX=$2;
fi;

if [[ -z $FIREFOX ]]; then
  echo "Unable to find firefox binary.  You can pass in this in as the second option to the script.";
  exit 1;
fi;

SCRIPT_DIR=$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd );
while read URL; do
  $SCRIPT_DIR/../run.sh -b $FIREFOX -m -u $URL > "$DEST_DIR/$URL default.json";
  DEFAULT_PID=$!;
  wait $DEFAULT_PID;

  $SCRIPT_DIR/../run.sh -b $FIREFOX -t -m -u $URL > "$DEST_DIR/$URL blocking.json";
  BLOCKING_PID=$!;
  wait $BLOCKING_PID;
done;

