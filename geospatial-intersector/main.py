from flask import Flask, render_template, send_from_directory, session, redirect, url_for
import os

app = Flask(__name__)
app.secret_key = os.environ.get("FLASK_SECRET_KEY", "your-secret-key-here")

@app.route('/')
def index():
    # Default to English if no language is set
    session['language'] = session.get('language', 'en')
    if session['language'] == 'fr':
        return render_template('index_fr.html')
    return render_template('index.html')

@app.route('/fr')
def index_fr():
    session['language'] = 'fr'
    return render_template('index_fr.html')

@app.route('/en')
def index_en():
    session['language'] = 'en'
    return render_template('index.html')

# Serve static files
@app.route('/static/<path:path>')
def send_static(path):
    return send_from_directory('static', path)

if __name__ == '__main__':
    # Ensure the app runs on 0.0.0.0 to be accessible
    app.run(host='0.0.0.0', port=5000, debug=True)