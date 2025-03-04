def render_header(translations):
    """Render Government of Canada header."""
    return f"""
        <div class="gc-header" role="banner">
            <div class="gc-header-content">
                <img src="https://www.canada.ca/etc/designs/canada/wet-boew/assets/sig-blk-en.svg" 
                     alt="Government of Canada" class="gc-logo" />
                <div class="language-toggle">
                    <button onclick="changeLanguage('en')" aria-label="English">EN</button>
                    <button onclick="changeLanguage('fr')" aria-label="Français">FR</button>
                </div>
            </div>
        </div>
    """