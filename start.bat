@echo off
echo ====================================
echo Starting Flask Application
echo ====================================
echo.

REM Check if virtual environment exists
if not exist "venv\" (
    echo Creating virtual environment...
    python -m venv venv
    echo.
)

REM Activate virtual environment
echo Activating virtual environment...
call venv\Scripts\activate
echo.

REM Install dependencies
echo Installing/updating dependencies...
pip install -r requirements.txt
echo.

REM Check if .env exists
if not exist ".env" (
    echo WARNING: .env file not found!
    echo Please copy .env.example to .env and configure your Azure credentials.
    echo.
    pause
    exit /b 1
)

REM Start Flask application
echo Starting Flask server...
echo Server will be available at http://localhost:8080
echo Press Ctrl+C to stop the server
echo.
python app.py
