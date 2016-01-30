#!/usr/bin/env bash

if [[ $# < 2 ]]; then
	echo "Usage: ./process_many.sh <domain list> <path> [should_block]";
	exit 1;
fi;
SOURCE_FILE=$0;
DEST_DIR=$1;

if [[ -z $2 ]]; then
	BLOCK_FLAG="";
else
	BLOCK_FLAG="-e";
fi;

while [[ 1 ]]; do

	ALL_LINES=`shuf $SOURCE_FILE`;

	for LINE in $ALL_LINES; do

		DOMAIN=`echo $LINE | awk '{print $1}'`;
		SUBDOMAINS=`echo $LINE | awk '{print $2}'`;
		INDEX=0;

		while [[ ! -f $DEST_DIR/$DOMAIN-$INDEX.json ]]; do
			INDEX=$(($INDEX + 1));
		done;

		if [[ -n $SUBDOMAINS ]]; then
			SUBDOMAINS_ARG="-d $SUBDOMAINS";
		else
			SUBDOMAINS_ARG="";
		fi;
		JSON=`./run.sh -b /home/bits/Code/firefox-43.0.4/obj-x86_64-unknown-linux-gnu/dist/bin/firefox $BLOCK_FLAG -u http://$DOMAIN $SUBDOMAINS_ARG`;
		echo $JSON > $DEST_DIR/$DOMAIN-$INDEX.json;
	done;
done;
