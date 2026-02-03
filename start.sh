#!/bin/bash

echo "===================================="
echo "Starting Flask Application"
echo "===================================="
echo

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
    echo
fi

# Activate virtual environment
echo "Activating virtual environment..."
source venv/bin/activate
echo

# Install dependencies
echo "Installing/updating dependencies..."
pip install -r requirements.txt
echo

# Check if .env exists
if [ ! -f ".env" ]; then
    echo "WARNING: .env file not found!"
    echo "Please copy .env.example to .env and configure your Azure credentials."
    echo
    exit 1
fi

# Start Flask application
echo "Starting Flask server..."
echo "Server will be available at http://localhost:8080"
echo "Press Ctrl+C to stop the server"
echo
python app.py
