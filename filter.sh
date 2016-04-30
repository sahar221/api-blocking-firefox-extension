#!/usr/bin/env bash

DIR=$1;

for FILE in `ls $DIR`; do
    API_DATA=`cat $DIR/$FILE | grep 'FF-API-EXTENSION' | grep -v 'FF-API-EXTENSION: false'`;
    if [[ -n $API_DATA ]]; then
        echo $API_DATA > $DIR/$FILE.filtered
    fi
done;
