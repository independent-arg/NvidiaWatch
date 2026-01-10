document.addEventListener('DOMContentLoaded', () => {
    const driverContainer = document.getElementById('driver-container');
    const searchInput = document.getElementById('search-input');
    const themeBtn = document.getElementById('theme-toggle');
    const htmlEl = document.documentElement;
    const paginationContainer = document.querySelector('.pagination-container');

    let allDrivers = [];
    let filteredDrivers = []; // For search results
    let currentPage = 1;
    const itemsPerPage = 9; // Adjust for masonry layout (3 cols * 3 rows approx)
    let isSearchActive = false;

    // --- Theme Toggle Logic ---
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
        htmlEl.setAttribute('data-theme', savedTheme);
    } else {
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
            htmlEl.setAttribute('data-theme', 'light');
        }
    }

    themeBtn.addEventListener('click', () => {
        const currentTheme = htmlEl.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        htmlEl.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
    });

    // --- Data Fetching ---
    fetch('data.json')
        .then(response => response.json())
        .then(data => {
            allDrivers = data.sort((a, b) => parseFloat(b.version) - parseFloat(a.version));
            filteredDrivers = allDrivers; // Initial state
            renderDrivers();
            renderPagination();
        })
        .catch(err => console.error('Error loading data:', err));

    // --- Core Logic ---

    function getPaginatedData() {
        const startIndex = (currentPage - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        return filteredDrivers.slice(startIndex, endIndex);
    }

    function renderDrivers() {
        driverContainer.innerHTML = '';
        const driversToRender = getPaginatedData();

        if (driversToRender.length === 0) {
             driverContainer.innerHTML = `
                <div style="column-span: all; text-align: center; padding: 4rem; color: var(--text-secondary);">
                    <ion-icon name="search-outline" style="font-size: 3rem; margin-bottom: 1rem;"></ion-icon>
                    <p>No results found.</p>
                </div>
            `;
            return;
        }

        driversToRender.forEach(driver => {
            // Version Formatting
            let versionDisplay = driver.version;
            const verNum = parseFloat(driver.version);
            if (!isNaN(verNum)) {
                versionDisplay = verNum.toFixed(2);
            }

            // In search mode, filter bugs. In normal mode, show all.
            // Note: If user wants to see "cards with their own length", 
            // we should show all matching bugs if searching, or all bugs if not.
            
            const searchTerm = searchInput.value.toLowerCase();
            let bugsToShow = driver.bugs;

            if (isSearchActive) {
                // Filter bugs within the card if searching
                bugsToShow = driver.bugs.filter(bug => {
                    const desc = (bug.description || "").toLowerCase();
                    const status = (bug.original_status_text || "").toLowerCase();
                    const ver = `driver ${versionDisplay}`.toLowerCase();
                    return desc.includes(searchTerm) || status.includes(searchTerm) || ver.includes(searchTerm);
                });
            }

            // Create Card
            const card = document.createElement('div');
            card.className = 'driver-card';
            card.style.animation = 'fadeIn 0.5s ease forwards';
            
            const header = document.createElement('div');
            header.className = 'driver-header';
            header.innerHTML = `<div class="driver-version">Driver ${versionDisplay}</div>`;
            card.appendChild(header);

            const bugList = document.createElement('ul');
            bugList.className = 'bug-list';

            bugsToShow.forEach(bug => {
                const li = document.createElement('li');
                li.className = 'bug-item';
                
                const isFixed = bug.status === 'fixed';
                const statusClass = isFixed ? 'status-fixed' : 'status-pending';
                const statusLabel = bug.original_status_text || (isFixed ? 'Fixed' : 'Pending');

                li.innerHTML = `
                    <div class="bug-desc">${bug.description}</div>
                    <div class="bug-footer">
                        <span class="status-badge ${statusClass}">${statusLabel}</span>
                    </div>
                `;
                bugList.appendChild(li);
            });

            card.appendChild(bugList);
            driverContainer.appendChild(card);
        });
    }

    function renderPagination() {
        paginationContainer.innerHTML = '';
        
        const totalItems = filteredDrivers.length;
        const totalPages = Math.ceil(totalItems / itemsPerPage);

        if (totalPages <= 1) return;

        // Previous Button
        const prevBtn = document.createElement('button');
        prevBtn.className = 'page-btn';
        prevBtn.innerHTML = '<ion-icon name="chevron-back-outline"></ion-icon>';
        prevBtn.disabled = currentPage === 1;
        prevBtn.addEventListener('click', () => changePage(currentPage - 1));
        paginationContainer.appendChild(prevBtn);

        // Page Numbers logic (Simple version: 1 2 3 ... Last)
        // For simplicity in vanilla JS without complex logic, let's show a sliding window or simplified list
        
        let pagesToRender = [];
        if (totalPages <= 7) {
            pagesToRender = Array.from({length: totalPages}, (_, i) => i + 1);
        } else {
            if (currentPage <= 4) {
                pagesToRender = [1, 2, 3, 4, 5, '...', totalPages];
            } else if (currentPage >= totalPages - 3) {
                pagesToRender = [1, '...', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
            } else {
                pagesToRender = [1, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages];
            }
        }

        pagesToRender.forEach(p => {
            const btn = document.createElement('button');
            btn.className = 'page-btn';
            
            if (p === '...') {
                btn.textContent = '...';
                btn.disabled = true;
                btn.style.border = 'none';
                btn.style.backgroundColor = 'transparent';
            } else {
                btn.textContent = p;
                if (p === currentPage) btn.classList.add('active');
                btn.addEventListener('click', () => changePage(p));
            }
            
            paginationContainer.appendChild(btn);
        });

        // Next Button
        const nextBtn = document.createElement('button');
        nextBtn.className = 'page-btn';
        nextBtn.innerHTML = '<ion-icon name="chevron-forward-outline"></ion-icon>';
        nextBtn.disabled = currentPage === totalPages;
        nextBtn.addEventListener('click', () => changePage(currentPage + 1));
        paginationContainer.appendChild(nextBtn);
    }

    function changePage(newPage) {
        currentPage = newPage;
        // Scroll to top of grid
        const main = document.querySelector('main');
        if (main) main.scrollIntoView({ behavior: 'smooth' });
        
        renderDrivers();
        renderPagination();
    }

    // --- Search Logic ---
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.trim().toLowerCase();
        isSearchActive = query.length > 0;
        currentPage = 1; // Reset to page 1 on search

        if (isSearchActive) {
            filteredDrivers = allDrivers.filter(driver => {
                // Format version for search
                let versionDisplay = driver.version;
                const verNum = parseFloat(driver.version);
                if (!isNaN(verNum)) versionDisplay = verNum.toFixed(2);
                
                const versionText = `driver ${versionDisplay}`.toLowerCase();
                
                // Check bugs
                const hasMatchingBug = driver.bugs.some(bug => {
                    const desc = (bug.description || "").toLowerCase();
                    const status = (bug.original_status_text || "").toLowerCase();
                    return desc.includes(query) || status.includes(query);
                });

                return versionText.includes(query) || hasMatchingBug;
            });
        } else {
            filteredDrivers = allDrivers;
        }

        renderDrivers();
        renderPagination();
    });

    // Add keyframes for fade in if not in CSS
    const styleSheet = document.createElement("style");
    styleSheet.innerText = `
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }
    `;
    document.head.appendChild(styleSheet);
});
