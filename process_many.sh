#!/usr/bin/env bash

if [[ $# < 2 ]]; then
	echo "Usage: ./process_many.sh <domain list> <path> [should_block]";
	exit 1;
fi;
SOURCE_FILE=$1;
DEST_DIR=$2;
FF_BIN="/Users/snyderp/Desktop/firefox-43.0.4/obj-x86_64-apple-darwin15.3.0/dist/Nightly.app/Contents/MacOS/firefox";

if [[ -z $3 ]]; then
	BLOCK_FLAG="";
else
	BLOCK_FLAG="-e";
fi;

while [[ 1 ]]; do

	ALL_LINES=`cat $SOURCE_FILE | gshuf`;

	for LINE in $ALL_LINES; do

		DOMAIN=`echo $LINE | awk -F'-' '{print $1}'`;
		SUBDOMAINS=`echo $LINE | awk -F'-' '{print $2}'`;
		INDEX=0;

		while [[ -e $DEST_DIR/$DOMAIN-$INDEX.json ]]; do
			INDEX=$(($INDEX + 1));
		done;

		if [[ -n $SUBDOMAINS ]]; then
			SUBDOMAINS_ARG="-d $SUBDOMAINS";
		else
			SUBDOMAINS_ARG="";
		fi;

		JSON=`./run.sh -b $FF_BIN $BLOCK_FLAG -u http://$DOMAIN $SUBDOMAINS_ARG`;
		echo "Writing $DEST_DIR/$DOMAIN-$INDEX.json";
		echo $JSON > $DEST_DIR/$DOMAIN-$INDEX.json;
	done;
done;
