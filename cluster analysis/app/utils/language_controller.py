from flask import session, request, g
import json
import os
import logging

logger = logging.getLogger(__name__)

class LanguageController:
    def __init__(self, app):
        self.app = app
        self.translations = {}
        self.load_translations()

    def load_translations(self):
        """Load translations from JSON files."""
        languages = ['en', 'fr']
        for lang in languages:
            try:
                file_path = os.path.join(self.app.root_path, 'i18n', f'{lang}.json')
                with open(file_path, 'r', encoding='utf-8') as f:
                    self.translations[lang] = json.load(f)
                logger.info(f"Successfully loaded translations for {lang}")
                # Verify the structure of loaded translations
                if 'table_headers' not in self.translations[lang]:
                    logger.error(f"Missing 'table_headers' in {lang} translations")
            except Exception as e:
                logger.error(f"Error loading translations for {lang}: {str(e)}")
                # Provide empty translations as fallback
                self.translations[lang] = {}

    def get_user_language(self):
        """Get the user's preferred language from session or defaults to English."""
        if 'language' not in session:
            browser_lang = request.accept_languages.best_match(['en', 'fr'])
            session['language'] = browser_lang if browser_lang else 'en'
        return session['language']

    def set_language(self, language):
        """Set the user's preferred language."""
        if language in ['en', 'fr']:
            session['language'] = language
            return True
        return False

    def get_translations(self):
        """Get translations for the current language."""
        lang = self.get_user_language()
        translations = self.translations.get(lang, self.translations['en'])
        logger.info(f"Retrieved translations for {lang}")
        logger.debug(f"Translation keys: {list(translations.keys())}")
        return translations

    def setup_language_context(self):
        """Set up language context for templates."""
        g.language = self.get_user_language()
        g.translations = self.get_translations()

def init_language_controller(app):
    """Initialize the language controller for the Flask app."""
    language_controller = LanguageController(app)

    @app.before_request
    def before_request():
        language_controller.setup_language_context()

    return language_controller