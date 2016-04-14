#!/usr/bin/env bash

if [[ $# < 2 ]]; then
	echo "Usage: ./process_many.sh <domain list> <path> [num processes]";
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

  if [[ -n $BLOCK_FLAG ]]; then
    BLOCK_FLAG="-e";
    BLOCK_NAME="-blocking"
  else
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

  local FF_PATH=`which firefox`;

  ./run.sh -b $FF_PATH $BLOCK_FLAG -u http://$DOMAIN $SUBDOMAINS_ARG > $DEST_FILE;
}
export -f measure_domain;

NUM_MEASUREMENTS=0;
while [[ 1 ]]; do

  NUM_MEASUREMENTS=$(($NUM_MEASUREMENTS + 1));
  echo "Round $NUM_MEASUREMENTS";

  cat $SOURCE_FILE | parallel --env measure_domain -j $NUM_PROCESSES "measure_domain $DEST_DIR {}";
  DEFAULT_CASE_PID=$!;

  cat $SOURCE_FILE | parallel --env measure_domain -j $NUM_PROCESSES "measure_domain $DEST_DIR {} e";
  BLOCKING_CASE_PID=$!;

  wait $DEFAULT_CASE_PID;
  wait $BLOCKING_CASE_PID;
  exit;
done;

