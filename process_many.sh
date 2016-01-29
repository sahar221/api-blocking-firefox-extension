#!/usr/bin/env bash

while read LINE; do
	DOMAIN=`echo $LINE | awk '{print $1}'`;
	SUBDOMAINS=`echo $LINE | awk '{print $2}'`;
	if [[ -n $SUBDOMAINS ]]; then
		SUBDOMAINS_ARG="-d $SUBDOMAINS";
	else
		SUBDOMAINS_ARG="";
	fi;
	JSON=`./run.sh -b /home/bits/Code/firefox-43.0.4/obj-x86_64-unknown-linux-gnu/dist/bin/firefox -e -u http://$DOMAIN $SUBDOMAINS_ARG`;
	echo $JSON > ~/Desktop/data/$DOMAIN.json;
done;

