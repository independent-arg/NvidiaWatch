document.addEventListener('DOMContentLoaded', () => {
    const driverContainer = document.getElementById('driver-container');
    const statTotalDrivers = document.getElementById('stat-total-drivers');
    const statTotalBugs = document.getElementById('stat-total-bugs');
    const statFixedRate = document.getElementById('stat-fixed-rate');
    const searchInput = document.getElementById('search-input');
    const searchClearBtn = document.getElementById('search-clear');
    const themeBtn = document.getElementById('theme-toggle');
    const viewModeBtn = document.getElementById('view-mode-toggle');
    const sortSelect = document.getElementById('sort-select');
    const statusChips = document.querySelectorAll('.chip');
    const htmlEl = document.documentElement;
    const paginationContainer = document.querySelector('.pagination-container');

    let allDrivers = [];
    let filteredDrivers = [];
    let currentPage = 1;
    const itemsPerPage = 9;
    
    let currentFilter = 'all'; 
    let currentSort = 'version-desc';

    // --- Helpers ---

    function formatVersion(version) {
        const verNum = parseFloat(version);
        return !isNaN(verNum) ? verNum.toFixed(2) : version;
    }

    function compareVersions(a, b) {
        const splitA = a.split('.').map(n => parseFloat(n) || 0);
        const splitB = b.split('.').map(n => parseFloat(n) || 0);
        const len = Math.max(splitA.length, splitB.length);
        
        for (let i = 0; i < len; i++) {
            const valA = splitA[i] || 0;
            const valB = splitB[i] || 0;
            if (valA !== valB) return valA - valB;
        }
        return 0;
    }

    function updateURL() {
        const params = new URLSearchParams();
        if (searchInput.value) params.set('q', searchInput.value);
        if (currentPage > 1) params.set('page', currentPage);
        if (currentFilter !== 'all') params.set('filter', currentFilter);
        if (currentSort !== 'version-desc') params.set('sort', currentSort);
        
        const newRelativePathQuery = window.location.pathname + '?' + params.toString();
        // Keep the hash if it exists
        const hash = window.location.hash;
        history.pushState(null, '', newRelativePathQuery + hash);
    }

    function loadStateFromURL() {
        const params = new URLSearchParams(window.location.search);
        if (params.has('q')) searchInput.value = params.get('q');
        if (params.has('page')) currentPage = parseInt(params.get('page'));
        if (params.has('filter')) {
            currentFilter = params.get('filter');
            updateChipUI();
        }
        if (params.has('sort')) {
            currentSort = params.get('sort');
            sortSelect.value = currentSort;
        }
    }

    function updateChipUI() {
        statusChips.forEach(chip => {
            chip.classList.toggle('active', chip.dataset.filter === currentFilter);
        });
    }

    // --- Appearance Persistence ---
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
        htmlEl.setAttribute('data-theme', savedTheme);
        themeBtn.setAttribute('aria-pressed', savedTheme === 'light');
    } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
        htmlEl.setAttribute('data-theme', 'light');
        themeBtn.setAttribute('aria-pressed', 'true');
    }

    const savedView = localStorage.getItem('view') || 'masonry';
    htmlEl.setAttribute('data-view', savedView);
    viewModeBtn.setAttribute('aria-pressed', savedView === 'timeline');
    
    if (savedView === 'masonry') {
        driverContainer.classList.replace('grid-layout', 'masonry-layout');
    } else {
        driverContainer.classList.replace('masonry-layout', 'grid-layout');
    }

    themeBtn.addEventListener('click', () => {
        const currentTheme = htmlEl.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        htmlEl.setAttribute('data-theme', newTheme);
        themeBtn.setAttribute('aria-pressed', newTheme === 'light');
        localStorage.setItem('theme', newTheme);
    });

    viewModeBtn.addEventListener('click', () => {
        const currentView = htmlEl.getAttribute('data-view');
        const newView = currentView === 'timeline' ? 'masonry' : 'timeline';
        htmlEl.setAttribute('data-view', newView);
        viewModeBtn.setAttribute('aria-pressed', newView === 'timeline');
        localStorage.setItem('view', newView);

        if (newView === 'masonry') {
            driverContainer.classList.replace('grid-layout', 'masonry-layout');
        } else {
            driverContainer.classList.replace('masonry-layout', 'grid-layout');
        }
    });

    // --- Data Fetching ---
    fetch('data.json')
        .then(response => response.json())
        .then(data => {
            allDrivers = data;
            
            const latest = data.sort((a, b) => compareVersions(b.version, a.version))[0];
            if (latest) {
                document.title = `NvidiaWatch | Latest Driver ${formatVersion(latest.version)}`;
            }

            loadStateFromURL();
            updateStats(allDrivers);
            
            // IMPORTANT: First apply filters and sort to know the final list
            applyFiltersAndSort(false); // Pass false to avoid rendering yet

            // SMART DEEP LINKING: Find if the hash driver is on a different page
            const hash = window.location.hash;
            if (hash.startsWith('#driver-')) {
                const targetVersion = hash.replace('#driver-', '');
                const driverIndex = filteredDrivers.findIndex(d => d.version === targetVersion);
                
                if (driverIndex !== -1) {
                    // Calculate which page this driver is on
                    const targetPage = Math.floor(driverIndex / itemsPerPage) + 1;
                    currentPage = targetPage;
                }
            }

            // Now render everything and scroll
            renderDrivers();
            renderPagination();
            updateURL();
            scrollToDriverFromHash();
        })
        .catch(err => console.error('Error loading data:', err));

    // --- Core Logic ---

    function updateStats(drivers) {
        let totalDrivers = drivers.length;
        let totalBugs = 0;
        let fixedBugs = 0;

        drivers.forEach(d => {
            totalBugs += d.bugs.length;
            fixedBugs += d.bugs.filter(b => b.fixed_in !== null).length;
        });

        const rate = totalBugs > 0 ? Math.round((fixedBugs / totalBugs) * 100) : 0;
        statTotalDrivers.textContent = totalDrivers;
        statTotalBugs.textContent = totalBugs;
        statFixedRate.textContent = `${rate}%`;
    }

    function applyFiltersAndSort(shouldRender = true) {
        const query = searchInput.value.toLowerCase().trim();
        
        filteredDrivers = allDrivers.filter(driver => {
            const versionText = `driver ${formatVersion(driver.version)}`.toLowerCase();
            const bugsMatchingStatus = driver.bugs.filter(bug => {
                if (currentFilter === 'pending') return bug.fixed_in === null;
                if (currentFilter === 'fixed') return bug.fixed_in !== null;
                return true;
            });

            if (bugsMatchingStatus.length === 0 && currentFilter !== 'all') {
                return versionText.includes(query);
            }

            const hasMatchingBug = bugsMatchingStatus.some(bug => {
                const desc = (bug.description || "").toLowerCase();
                const status = (bug.fixed_in || "Pending").toLowerCase();
                return desc.includes(query) || status.includes(query);
            });

            return versionText.includes(query) || hasMatchingBug;
        });

        filteredDrivers.sort((a, b) => {
            switch (currentSort) {
                case 'version-asc': return compareVersions(a.version, b.version);
                case 'version-desc': return compareVersions(b.version, a.version);
                case 'bugs-asc': return a.bugs.length - b.bugs.length;
                case 'bugs-desc': return b.bugs.length - a.bugs.length;
                default: return 0;
            }
        });

        if (shouldRender) {
            currentPage = 1;
            renderDrivers();
            renderPagination();
            updateURL();
        }
    }

    function renderDrivers() {
        driverContainer.innerHTML = '';
        const startIndex = (currentPage - 1) * itemsPerPage;
        const driversToRender = filteredDrivers.slice(startIndex, startIndex + itemsPerPage);

        if (driversToRender.length === 0) {
            driverContainer.innerHTML = `
                <div class="no-results" role="status">
                    <ion-icon name="search-outline"></ion-icon>
                    <p>No results found for your current filters.</p>
                    <button class="clear-search-btn" id="empty-clear-btn">Clear all filters</button>
                </div>
            `;
            document.getElementById('empty-clear-btn')?.addEventListener('click', clearAllFilters);
            return;
        }

        driversToRender.forEach(driver => {
            const versionDisplay = formatVersion(driver.version);
            const card = document.createElement('div');
            card.className = 'driver-card';
            card.id = `driver-${driver.version}`;
            
            const header = document.createElement('div');
            header.className = 'driver-header';
            header.innerHTML = `<div class="driver-version">Driver ${versionDisplay}</div>`;
            header.style.cursor = 'pointer';
            header.setAttribute('role', 'button');
            header.setAttribute('tabindex', '0');
            header.addEventListener('click', () => {
                const version = driver.version;
                history.pushState(null, '', `#driver-${version}`);
                document.getElementById(`driver-${version}`)?.scrollIntoView({ behavior: 'smooth' });
            });
            header.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    header.click();
                }
            });
            card.appendChild(header);

            const bugList = document.createElement('ul');
            bugList.className = 'bug-list';

            const query = searchInput.value.toLowerCase().trim();
            const bugsToShow = driver.bugs.filter(bug => {
                const matchesStatus = (currentFilter === 'all') || 
                                     (currentFilter === 'pending' && bug.fixed_in === null) || 
                                     (currentFilter === 'fixed' && bug.fixed_in !== null);
                const matchesSearch = !query || 
                                     (bug.description || "").toLowerCase().includes(query) || 
                                     (bug.fixed_in || "Pending").toLowerCase().includes(query);
                return matchesStatus && matchesSearch;
            });

            bugsToShow.forEach(bug => {
                const li = document.createElement('li');
                li.className = 'bug-item';
                const isFixed = bug.fixed_in !== null;
                li.innerHTML = `
                    <div class="bug-desc">${bug.description}</div>
                    <div class="bug-footer">
                        <span class="status-badge ${isFixed ? 'status-fixed' : 'status-pending'}">
                            ${bug.fixed_in || 'Pending'}
                        </span>
                    </div>
                `;
                bugList.appendChild(li);
            });

            card.appendChild(bugList);
            driverContainer.appendChild(card);
        });
    }

    function scrollToDriverFromHash() {
        const hash = window.location.hash;
        if (hash.startsWith('#driver-')) {
            // Small delay to ensure DOM is fully painted
            setTimeout(() => {
                const el = document.querySelector(hash);
                if (el) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }, 100);
        }
    }

    function renderPagination() {
        paginationContainer.innerHTML = '';
        const totalPages = Math.ceil(filteredDrivers.length / itemsPerPage);
        if (totalPages <= 1) return;

        const createBtn = (content, page, active = false, disabled = false) => {
            const btn = document.createElement('button');
            btn.className = `page-btn ${active ? 'active' : ''}`;
            btn.innerHTML = content;
            btn.disabled = disabled;
            if (!disabled) btn.addEventListener('click', () => changePage(page));
            return btn;
        };

        paginationContainer.appendChild(createBtn('<ion-icon name="chevron-back-outline"></ion-icon>', currentPage - 1, false, currentPage === 1));

        let pages = [];
        if (totalPages <= 7) {
            pages = Array.from({length: totalPages}, (_, i) => i + 1);
        } else {
            if (currentPage <= 4) pages = [1, 2, 3, 4, 5, '...', totalPages];
            else if (currentPage >= totalPages - 3) pages = [1, '...', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
            else pages = [1, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages];
        }

        pages.forEach(p => {
            if (p === '...') {
                const dot = document.createElement('span');
                dot.textContent = '...';
                dot.className = 'page-btn';
                dot.style.border = 'none';
                dot.style.backgroundColor = 'transparent';
                paginationContainer.appendChild(dot);
            } else {
                paginationContainer.appendChild(createBtn(p, p, p === currentPage));
            }
        });

        paginationContainer.appendChild(createBtn('<ion-icon name="chevron-forward-outline"></ion-icon>', currentPage + 1, false, currentPage === totalPages));
    }

    function changePage(newPage) {
        currentPage = newPage;
        document.querySelector('main')?.scrollIntoView({ behavior: 'smooth' });
        renderDrivers();
        renderPagination();
        updateURL();
    }

    function clearAllFilters() {
        searchInput.value = '';
        currentFilter = 'all';
        currentSort = 'version-desc';
        sortSelect.value = 'version-desc';
        updateChipUI();
        applyFiltersAndSort();
    }

    searchInput.addEventListener('input', () => {
        searchClearBtn.classList.toggle('hidden', !searchInput.value);
        applyFiltersAndSort();
    });

    searchClearBtn.addEventListener('click', () => {
        searchInput.value = '';
        searchClearBtn.classList.add('hidden');
        applyFiltersAndSort();
        searchInput.focus();
    });

    sortSelect.addEventListener('change', (e) => {
        currentSort = e.target.value;
        applyFiltersAndSort();
    });

    statusChips.forEach(chip => {
        chip.addEventListener('click', () => {
            currentFilter = chip.dataset.filter;
            updateChipUI();
            applyFiltersAndSort();
        });
    });

    window.addEventListener('hashchange', scrollToDriverFromHash);
});
