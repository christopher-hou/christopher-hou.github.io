// Dynamically load HTML content
function loadComponent(elementId, filePath) {
    fetch(filePath)
        .then(response => response.text())
        .then(data => {
            document.getElementById(elementId).innerHTML = data;
            if (elementId === 'header-placeholder') {
                initializeHeader();
            }
        })
        .catch(error => console.error('Error loading component:', error));
}

function initializeHeader() {
    initializeNavigation();
    initializeThemeSwitcher();
}

// Function to initialize navigation links based on current page location
function initializeNavigation() {
    const currentPath = window.location.pathname;
    const isRootPage = currentPath.endsWith('/') || currentPath.endsWith('/index.html') || currentPath.split('/').pop() === '' || currentPath.split('/').pop() === 'index.html';
    const navLinks = document.querySelectorAll('.nav-link');

    navLinks.forEach(link => {
        const href = link.getAttribute('href');
        if (isRootPage) {
            switch (href) {
                case 'index.html':
                    link.setAttribute('href', 'index.html');
                    break;
                case 'about.html':
                    link.setAttribute('href', 'pages/about.html');
                    break;
                case 'projects.html':
                    link.setAttribute('href', 'pages/projects.html');
                    break;
                case 'documents/resume.pdf':
                    link.setAttribute('href', 'documents/resume.pdf');
                    break;
            }
        } else {
            switch (href) {
                case 'index.html':
                    link.setAttribute('href', '../index.html');
                    break;
                case 'about.html':
                    link.setAttribute('href', 'about.html');
                    break;
                case 'projects.html':
                    link.setAttribute('href', 'projects.html');
                    break;
                case 'documents/resume.pdf':
                    link.setAttribute('href', '../documents/resume.pdf');
                    break;
            }
        }

        const fileName = link.getAttribute('href').split('/').pop();
        const currentPage = window.location.pathname.split('/').pop() || 'index.html';
        
        if (fileName === currentPage) {
            link.classList.add('active');
        }
    });
}

function initializeThemeSwitcher() {
    const themeSwitcher = document.querySelector('.theme-switcher');
    if (!themeSwitcher) return; // Header not loaded yet

    const htmlElement = document.documentElement;

    // Load saved theme
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) setTheme(savedTheme); // Only override if saved exists

    // Switch themes if clicked
    themeSwitcher.addEventListener('click', function() {
        const currentTheme = htmlElement.getAttribute('data-theme') || 'light';
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        setTheme(newTheme);
        localStorage.setItem('theme', newTheme);
    });

    function setTheme(theme) {
        htmlElement.setAttribute('data-theme', theme);

        // Update icons
        const sunIcon = document.getElementById('sun');
        const moonIcon = document.getElementById('moon');
        
        if (theme === 'dark') {
            sunIcon.style.opacity = '0.1';
            moonIcon.style.opacity = '1';
        } else {
            sunIcon.style.opacity = '1';
            moonIcon.style.opacity = '0.1';
        }
    }
}

document.addEventListener('DOMContentLoaded', function() {
    // Load header and footer
    const currentPath = window.location.pathname;
    const isRootPage = currentPath.endsWith('/') || currentPath.endsWith('/index.html') || currentPath.split('/').pop() === '' || currentPath.split('/').pop() === 'index.html';
    if (isRootPage) {
        loadComponent('header-placeholder', 'assets/includes/header.html');
        loadComponent('footer-placeholder', 'assets/includes/footer.html');
    } else {
        loadComponent('header-placeholder', '../assets/includes/header.html');
        loadComponent('footer-placeholder', '../assets/includes/footer.html');
    }
});
