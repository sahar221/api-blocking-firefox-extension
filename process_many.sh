#!/usr/bin/env bash

if [[ $# < 2 ]]; then
	echo "Usage: ./process_many.sh <domain list> <path> [num processes] [test flags...]";
	exit 1;
fi;

SOURCE_FILE=$1;
DEST_DIR=$2;

if [[ -z $3 ]]; then
  NUM_PROCESSES=`nproc`;
else
  NUM_PROCESSES=$3;
fi;

measure_domain() {

  DEST_DIR=$1;
  LINE=$2;
  BLOCK_FLAG=$3;

  DOMAIN=`echo $LINE | awk -F';' '{print $1}'`;
  SUBDOMAINS=`echo $LINE | awk -F';' '{print $2}'`;
  INDEX=0;

  if [[ $BLOCK_FLAG == "e" ]]; then
    BLOCK_FLAG="-e";
    BLOCK_NAME="-blocking"
  elif [[ $BLOCK_FLAG == "a" ]]; then
    BLOCK_FLAG="-a";
    BLOCK_NAME="-adblock";
  elif [[ $BLOCK_FLAG == "t" ]]; then
    BLOCK_FLAG="-t";
    BLOCK_NAME="-tracking";
  else
    BLOCK_FLAG="";
    BLOCK_NAME="";
  fi;

  DEST_FILE="$DEST_DIR/$DOMAIN-$INDEX$BLOCK_NAME.json";
  while [[ -e $DEST_FILE ]]; do
    DEST_FILE="$DEST_DIR/$DOMAIN-$INDEX$BLOCK_NAME.json";
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

  local FF_PATH="/home/psnyde2/firefox/firefox";

  ./run.sh -b $FF_PATH $BLOCK_FLAG -u http://$DOMAIN $SUBDOMAINS_ARG -x > $DEST_FILE;
}
export -f measure_domain;

NUM_MEASUREMENTS=0;
while [[ 1 ]]; do

  NUM_MEASUREMENTS=$(($NUM_MEASUREMENTS + 1));
  echo "Round $NUM_MEASUREMENTS";

  TEST_INDEX=0;
  for ARG in $@; do
    TEST_INDEX=$(($TEST_INDEX + 1));
    if [[ $TEST_INDEX -lt 4 ]]; then
      continue;
    fi;

    cat $SOURCE_FILE | parallel --env measure_domain -j $NUM_PROCESSES "measure_domain $DEST_DIR {} $ARG";
    exit;
    PARALLEL_PID=$!;
    wait $PARALLEL_PID;
  done;

  if [[ -d /tmp/mozilla_psnyde20 ]]; then
    rm -Rf /tmp/mozilla_psnyde20
  fi;
done;

