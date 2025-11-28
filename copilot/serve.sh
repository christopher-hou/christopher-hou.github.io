#!/bin/bash
# Start a simple HTTP server for testing index.html
# Usage: ./serve.sh

PORT=8000
if command -v python3 &> /dev/null; then
    echo "Starting server at http://localhost:$PORT"
    python3 -m http.server $PORT
elif command -v python &> /dev/null; then
    echo "Starting server at http://localhost:$PORT"
    python -m SimpleHTTPServer $PORT
else
    echo "Python is not installed. Please install Python to use this script."
    exit 1
fi
