#!/bin/sh
# One scheduler fire files one fleet turn to the standing main session. No model starts here.
exec bun "$(dirname "$0")/pass.ts"
