#!/bin/bash
# The community desk's monitor source, run by Hermes's scheduler in the job's working directory (the checkout):
# when the newest issue, pull request or discussion on this project's GitHub last changed, as stable bytes. The
# agent wakes only when this output changes. The GitHub door is the valve's, loaded by the script itself.
exec bun .open-autonomy/community.ts latest
