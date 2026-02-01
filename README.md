# Welcome to my portfolio website!

## File Structure
```
/
├── index.html
├── pages/
│   ├── about.html
│   └── projects.html
├── assets/
│   ├── css/
│   │   ├── main.css
│   │   └── nav-and-footer.css
│   ├── js/
│   │   └── script.js
│   ├── images/
│   │   └── favicon.jpg
│   └── includes/
│       ├── header.html
│       └── footer.html
└── documents/
│   └── resume.pdf
└── .nojekyll
```

## Local Development

To run the website locally, start a simple HTTP server:

```bash
python -m http.server 8000
```

Then open your browser to http://localhost:8000.

**Note**: The dynamic header and footer loading requires a web server to work due to CORS restrictions when trying to open local files directly.

## How It Works

### Dynamic Header and Footer
The header and footer are loaded dynamically using JavaScript to avoid duplicating code across pages. Each HTML page includes placeholders for the header and footer:

```html
<!-- Header placeholder -->
<div id="header-placeholder"></div>

<!-- Page content here -->

<!-- Footer placeholder -->
<div id="footer-placeholder"></div>
```

The JavaScript in `assets/js/script.js` loads the content from `assets/includes/header.html` and `assets/includes/footer.html` into these placeholders.

### Navigation Highlighting
The JavaScript automatically highlights the active navigation item based on the current page.

### Day/Night Mode
The JavaScript and CSS work together to enable toggling between day and night mode.

## Adding New Pages
1. Create a new HTML file in the `pages/` directory
2. Include the header and footer placeholders as shown above
3. Link to `../assets/js/script.js` for the dynamic loading functionality
4. Update navigation links in `assets/includes/header.html` if needed

## Updating Header or Footer
To modify the header or footer content, edit the files in `assets/includes/`:
- `assets/includes/header.html` for the header content
- `assets/includes/footer.html` for the footer content

The changes will automatically appear on all pages.
