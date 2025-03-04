def render_footer(translations):
    """Render Government of Canada footer."""
    return f"""
        <footer class="gc-footer" role="contentinfo">
            <div class="gc-footer-content">
                <div class="gc-footer-links">
                    <a href="{translations.get('contact', '/contact')}">
                        {translations.get('contact_text', 'Contact')}
                    </a>
                    <a href="{translations.get('terms', '/terms')}">
                        {translations.get('terms_text', 'Terms and conditions')}
                    </a>
                    <a href="{translations.get('privacy', '/privacy')}">
                        {translations.get('privacy_text', 'Privacy')}
                    </a>
                </div>
                <img src="https://www.canada.ca/etc/designs/canada/wet-boew/assets/wmms-blk.svg" 
                     alt="Symbol of the Government of Canada" class="gc-footer-logo" />
            </div>
        </footer>
    """