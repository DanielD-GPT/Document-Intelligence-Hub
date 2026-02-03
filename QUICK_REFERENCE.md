# Flask Migration Quick Reference

## Quick Commands

### First Time Setup
```bash
# Windows
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
# Edit .env with your Azure credentials
python app.py

# Linux/Mac
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env with your Azure credentials
python app.py
```

### Daily Usage
```bash
# Windows
venv\Scripts\activate
python app.py

# Linux/Mac
source venv/bin/activate
python app.py

# Or use startup scripts
start.bat      # Windows
./start.sh     # Linux/Mac
```

## What Changed?

| Old (Node.js) | New (Flask) |
|---------------|-------------|
| `npm install` | `pip install -r requirements.txt` |
| `npm start` | `python app.py` |
| `node index.js` | `python app.py` |
| `package.json` | `requirements.txt` |
| `index.js` | `app.py` |

## What Stayed the Same?

✅ All frontend files (no changes needed)  
✅ All API endpoints (identical)  
✅ .env configuration (fully compatible)  
✅ uploads/ folder (works as-is)  
✅ Azure integrations (same credentials)  

## File Structure

```
Document-Intelligence-Hub/
├── app.py                    # ← NEW: Flask application
├── requirements.txt          # ← NEW: Python dependencies
├── start.bat                 # ← NEW: Windows startup script
├── start.sh                  # ← NEW: Linux/Mac startup script
├── FLASK_SETUP.md           # ← NEW: Detailed setup guide
├── MIGRATION_SUMMARY.md     # ← NEW: Migration documentation
├── README.md                # ← UPDATED: Flask instructions
├── .env                     # Same as before
├── .env.example            # Same as before
├── public/                  # Same as before (no changes)
│   ├── index.html
│   ├── script.js
│   └── styles.css
└── uploads/                 # Same as before
```

## Troubleshooting

### Port already in use?
Edit `.env` file:
```
PORT=3000
```

### Module not found?
```bash
pip install -r requirements.txt
```

### Permission denied on start.sh?
```bash
chmod +x start.sh
```

### Virtual environment not activated?
```bash
# Windows
venv\Scripts\activate

# Linux/Mac
source venv/bin/activate
```

## Production Deployment

### Using Gunicorn (Linux/Mac)
```bash
pip install gunicorn
gunicorn -w 4 -b 0.0.0.0:8080 app:app
```

### Using Waitress (Windows)
```bash
pip install waitress
waitress-serve --host=0.0.0.0 --port=8080 app:app
```

## Testing the Migration

1. Start the server: `python app.py`
2. Open browser: `http://localhost:8080`
3. Test PDF upload
4. Test Excel upload
5. Test chat functionality
6. Check all features work

## Getting Help

- **Setup issues**: See [FLASK_SETUP.md](FLASK_SETUP.md)
- **Migration details**: See [MIGRATION_SUMMARY.md](MIGRATION_SUMMARY.md)
- **General usage**: See [README.md](README.md)
- **Flask docs**: https://flask.palletsprojects.com/
