#!/usr/bin/env bash

if [[ $# < 2 ]]; then
	echo "Usage: ./process_many.sh <domain list> <path> [num processes]";
	exit 1;
fi;

SOURCE_FILE=$1;
DEST_DIR=$2;

if [[ -z $3 ]]; then
  NUM_PROCESSES=1;
else
  NUM_PROCESSES=$(($3 / 2));
fi;


DISPLAY_NUM=$RANDOM;
ERROR_LOG="/tmp/api-xvfb-errors";
Xvfb :$DISPLAY_NUM -screen 0 1280x1024x24 2> $ERROR_LOG &
if [[ $? -ne 0 ]]; then
  echo "Unable to launch Xvfb";
  cat $ERROR_LOG;
  exit 1;
else
  rm $ERROR_LOG;
fi;
sleep 3;
export DISPLAY_NUM;


FIREFOX_PATH=`which firefox`;
if [[ $? -ne 0 ]]; then
  echo "Unable to find firefox in path.";
  exit 1;
fi;
export FIREFOX_PATH;


measure_domain() {

  LINE=$1;
  BLOCK_FLAG=$2;

  DOMAIN=`echo $LINE | awk -F'-' '{print $1}'`;
  SUBDOMAINS=`echo $LINE | sed -E 's/[^-]+-//'`;
  INDEX=0;

  while [[ -e $DEST_DIR/$DOMAIN-$INDEX.json ]]; do
    INDEX=$(($INDEX + 1));
  done;

  if [[ -n $SUBDOMAINS ]]; then
    SUBDOMAINS_ARG="-d $SUBDOMAINS";
  else
    SUBDOMAINS_ARG="";
  fi;

  if [[ -z $BLOCK_FLAG ]]; then
    echo "Measuring $DOMAIN ($INDEX) - default";
  else
    echo "Measuring $DOMAIN ($INDEX) - blocking";
  fi;

  JSON=`DISPLAY=$DISPLAY_NUM ./run.sh -b $FIREFOX_PATH $BLOCK_FLAG -u http://$DOMAIN $SUBDOMAINS_ARG -j`;
  DEST_FILE="$DEST_DIR/$DOMAIN-$INDEX.json";
  echo $JSON > $DEST_FILE;
}
export -f measure_domain;

NUM_MEASUREMENTS=0;
while [[ 1 ]]; do

  NUM_MEASUREMENTS=$(($NUM_MEASUREMENTS + 1));
  echo "Round $NUM_MEASUREMENTS";

	ALL_LINES=`cat $SOURCE_FILE | shuf`;

  cat $ALL_LINES | parallel -j $NUM_PROCESSES measure_domain {} &
  DEFAULT_CASE_PID=$!;

  cat $ALL_LINES | parallel -j $NUM_PROCESSES measure_domain {} -e &
  BLOCKING_CASE_PID=$!;

  wait $DEFAULT_CASE_PID;
  wait $BLOCKING_CASE_PID;
done;

