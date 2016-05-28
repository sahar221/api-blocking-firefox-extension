#!/usr/bin/env python

import json
import sys

data = json.load(sys.stdin)
for domain, (default_count, blocking_count) in data.items():
  if default_count < 5:
    print "default: ", domain
  if blocking_count < 5:
    print "blocking: ", domain

