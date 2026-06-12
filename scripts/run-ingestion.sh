#!/bin/bash

if [ "${BASH_SOURCE[0]}" != "$0" ]; then
    echo "run-ingestion.sh must be executed, not sourced." >&2
    return 2
fi

exec /bin/bash /Users/inteyeo/scripts/run-ingestion.sh "$@"
