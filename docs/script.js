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
    // Scoped to #status-filters so the trends-range chips (added below) don't
    // get swept into the status-filter logic just because they share `.chip`.
    const statusChips = document.querySelectorAll('#status-filters .chip');
    const htmlEl = document.documentElement;
    const paginationContainer = document.querySelector('.pagination-container');
    const trendsChartSvg = document.getElementById('trends-chart');
    const trendsTooltip = document.getElementById('trends-tooltip');
    const trendsRangeChips = document.querySelectorAll('#trends-range .chip');

    let allDrivers = [];
    let filteredDrivers = [];
    let currentPage = 1;
    const itemsPerPage = 9;
    
    let currentFilter = 'all'; 
    let currentSort = 'version-desc';
    let searchDebounceTimer = null;
    let trendsRange = 'recent';
    let resizeDebounceTimer = null;

    function formatVersion(version) {
        const verNum = parseFloat(version);
        return !isNaN(verNum) ? verNum.toFixed(2) : version;
    }

    function escapeHTML(str) {
        return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function highlightText(text, query) {
        const escapedText = escapeHTML(text);
        if (!query) return escapedText;
        const safeQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(${safeQuery})`, 'gi');
        return escapedText.replace(regex, '<mark class="highlight">$1</mark>');
    }

    let toastTimeout = null;
    function showToast(message) {
        const toast = document.getElementById('toast');
        if (!toast) return;
        toast.textContent = message;
        toast.classList.remove('hidden');
        toast.classList.add('show');
        clearTimeout(toastTimeout);
        toastTimeout = setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.classList.add('hidden'), 300);
        }, 2500);
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

    function updateURL(replace = false) {
        const params = new URLSearchParams();
        if (searchInput.value) params.set('q', searchInput.value);
        if (currentPage > 1) params.set('page', currentPage);
        if (currentFilter !== 'all') params.set('filter', currentFilter);
        if (currentSort !== 'version-desc') params.set('sort', currentSort);
        const newRelativePathQuery = window.location.pathname + '?' + params.toString();
        const hash = window.location.hash;
        if (replace) {
            history.replaceState(null, '', newRelativePathQuery + hash);
        } else {
            history.pushState(null, '', newRelativePathQuery + hash);
        }
    }

    function loadStateFromURL() {
        const params = new URLSearchParams(window.location.search);
        if (params.has('q')) searchInput.value = params.get('q');
        if (params.has('page')) {
            const parsedPage = parseInt(params.get('page'), 10);
            currentPage = (Number.isFinite(parsedPage) && parsedPage > 0) ? parsedPage : 1;
        }
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
            const isActive = chip.dataset.filter === currentFilter;
            chip.classList.toggle('active', isActive);
            chip.setAttribute('aria-pressed', isActive);
        });
    }

    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
        htmlEl.setAttribute('data-theme', savedTheme);
        themeBtn.setAttribute('aria-pressed', savedTheme === 'light');
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

    fetch('data.json')
        .then(response => {
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return response.json();
        })
        .then(data => {
            allDrivers = data;
            const latest = data.sort((a, b) => compareVersions(b.version, a.version))[0];
            if (latest) {
                document.title = `NvidiaWatch | Latest Driver ${formatVersion(latest.version)}`;
            }
            loadStateFromURL();
            updateStats(allDrivers);
            renderTrendsChart();
            applyFiltersAndSort(false);
            const hash = window.location.hash;
            if (hash.startsWith('#driver-')) {
                const targetVersion = hash.replace('#driver-', '');
                const driverIndex = filteredDrivers.findIndex(d => d.version === targetVersion);
                if (driverIndex !== -1) {
                    currentPage = Math.floor(driverIndex / itemsPerPage) + 1;
                }
            }
            renderDrivers();
            renderPagination();
            updateURL(true);
            scrollToDriverFromHash();
        })
        .catch(err => {
            console.error('Error loading data:', err);
            driverContainer.innerHTML = `
                <div class="no-results" role="status">
                    <ion-icon name="alert-circle-outline"></ion-icon>
                    <p>Couldn't load driver data. Please try refreshing the page.</p>
                </div>
            `;
        });

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

    function getTrendSeries(range) {
        const chronological = [...allDrivers]
            .sort((a, b) => compareVersions(a.version, b.version))
            .map(d => {
                const total = d.bugs.length;
                const fixed = d.bugs.filter(b => b.fixed_in !== null).length;
                return { version: d.version, total, fixed, pending: total - fixed };
            });

        if (range === 'recent') return chronological.slice(-20);
        if (range === 'worst') {
            return [...chronological]
                .sort((a, b) => b.total - a.total)
                .slice(0, 15)
                .sort((a, b) => compareVersions(a.version, b.version));
        }
        return chronological; // 'all'
    }

    function rangeLabel(range) {
        if (range === 'recent') return 'last 20 versions';
        if (range === 'worst') return 'most affected versions';
        return 'all tracked versions';
    }

    function resetTrendsTooltip(series, range) {
        trendsTooltip.textContent = `Showing ${rangeLabel(range)} (${series.length}) — hover or tap a bar for details.`;
    }

    function goToDriver(version) {
        searchInput.value = '';
        searchClearBtn.classList.add('hidden');
        currentFilter = 'all';
        updateChipUI();
        applyFiltersAndSort(false);
        const idx = filteredDrivers.findIndex(d => d.version === version);
        if (idx !== -1) currentPage = Math.floor(idx / itemsPerPage) + 1;
        renderDrivers();
        renderPagination();
        updateURL();
        history.pushState(null, '', `#driver-${version}`);
        scrollToDriverFromHash();
    }

    function renderTrendsChart(range = trendsRange) {
        if (!trendsChartSvg || allDrivers.length === 0) return;
        trendsRange = range;
        const series = getTrendSeries(range);
        const ns = 'http://www.w3.org/2000/svg';
        trendsChartSvg.innerHTML = '';
        if (series.length === 0) return;

        const containerWidth = trendsChartSvg.parentElement.clientWidth || 800;
        const minBarWidth = range === 'all' ? 6 : 22;
        const gap = range === 'all' ? 1.5 : 6;
        const naturalWidth = series.length * (minBarWidth + gap);
        const width = Math.max(containerWidth, naturalWidth);
        const height = 240;
        const padTop = 8;
        const padBottom = 4;
        const plotH = height - padTop - padBottom;
        const barW = Math.max(minBarWidth, (width - gap * (series.length - 1)) / series.length);
        const maxTotal = Math.max(...series.map(s => s.total), 1);

        trendsChartSvg.setAttribute('viewBox', `0 0 ${width} ${height}`);
        trendsChartSvg.setAttribute('preserveAspectRatio', 'none');
        trendsChartSvg.style.width = `${width}px`;
        trendsChartSvg.style.height = `${height}px`;

        const frag = document.createDocumentFragment();

        series.forEach((item, i) => {
            const x = i * (barW + gap);
            const baseY = padTop + plotH;
            const fixedH = (item.fixed / maxTotal) * plotH;
            const pendingH = (item.pending / maxTotal) * plotH;
            const versionDisplay = formatVersion(item.version);

            const g = document.createElementNS(ns, 'g');
            g.setAttribute('class', 'trend-bar-group');
            g.setAttribute('tabindex', '0');
            g.setAttribute('role', 'button');
            g.setAttribute('aria-label', `Driver ${versionDisplay}: ${item.total} bugs, ${item.fixed} fixed, ${item.pending} pending. Jump to this driver.`);

            // Wider invisible hit area so thin bars stay easy to hover/tap.
            const hit = document.createElementNS(ns, 'rect');
            hit.setAttribute('x', x - gap / 2);
            hit.setAttribute('y', padTop);
            hit.setAttribute('width', barW + gap);
            hit.setAttribute('height', plotH);
            hit.setAttribute('class', 'trend-bar-hit');
            g.appendChild(hit);

            if (item.fixed > 0) {
                const rFixed = document.createElementNS(ns, 'rect');
                rFixed.setAttribute('x', x);
                rFixed.setAttribute('y', baseY - fixedH);
                rFixed.setAttribute('width', barW);
                rFixed.setAttribute('height', fixedH);
                rFixed.setAttribute('class', 'trend-bar-fixed');
                g.appendChild(rFixed);
            }
            if (item.pending > 0) {
                const rPending = document.createElementNS(ns, 'rect');
                rPending.setAttribute('x', x);
                rPending.setAttribute('y', baseY - fixedH - pendingH);
                rPending.setAttribute('width', barW);
                rPending.setAttribute('height', pendingH);
                rPending.setAttribute('class', 'trend-bar-pending');
                g.appendChild(rPending);
            }

            const showDetail = () => {
                trendsTooltip.textContent = `Driver ${versionDisplay} — ${item.total} bug${item.total === 1 ? '' : 's'} (${item.fixed} fixed, ${item.pending} pending)`;
            };
            g.addEventListener('mouseenter', showDetail);
            g.addEventListener('focus', showDetail);
            g.addEventListener('click', () => goToDriver(item.version));
            g.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    goToDriver(item.version);
                }
            });

            frag.appendChild(g);
        });

        trendsChartSvg.appendChild(frag);
        resetTrendsTooltip(series, range);
    }

    function applyFiltersAndSort(shouldRender = true, replaceHistory = false) {
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

        const totalPages = Math.max(1, Math.ceil(filteredDrivers.length / itemsPerPage));
        if (currentPage > totalPages) currentPage = totalPages;
        if (currentPage < 1) currentPage = 1;

        if (shouldRender) {
            currentPage = 1;
            renderDrivers();
            renderPagination();
            updateURL(replaceHistory);
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

        const fragment = document.createDocumentFragment();
        const query = searchInput.value.toLowerCase().trim();

        driversToRender.forEach(driver => {
            const versionDisplay = formatVersion(driver.version);
            const card = document.createElement('div');
            card.className = 'driver-card';
            card.id = `driver-${driver.version}`;
            
            const header = document.createElement('div');
            header.className = 'driver-header';

            const versionHighlighted = highlightText(`Driver ${versionDisplay}`, query);
            header.innerHTML = `
                <div class="driver-version">${versionHighlighted}</div>
                <button class="copy-link-btn" aria-label="Copy link to Driver ${versionDisplay}" title="Copy link to driver">
                    <ion-icon name="link-outline"></ion-icon>
                </button>
            `;
            
            const copyBtn = header.querySelector('.copy-link-btn');
            copyBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const url = new URL(window.location.href);
                url.hash = `driver-${driver.version}`;
                navigator.clipboard.writeText(url.toString())
                    .then(() => showToast(`Link to Driver ${versionDisplay} copied!`))
                    .catch(() => showToast('Failed to copy link.'));
            });

            header.style.cursor = 'pointer';
            header.setAttribute('role', 'button');
            header.setAttribute('tabindex', '0');
            header.addEventListener('click', (e) => {
                if (e.target.closest('.copy-link-btn')) return;
                const version = driver.version;
                history.pushState(null, '', `#driver-${version}`);
                document.getElementById(`driver-${version}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            });
            header.addEventListener('keydown', (e) => {
                if (e.target.closest('.copy-link-btn')) return;
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    header.click();
                }
            });
            card.appendChild(header);

            const bugList = document.createElement('ul');
            bugList.className = 'bug-list';

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
                const descHighlighted = highlightText(bug.description, query);
                const statusHighlighted = highlightText(bug.fixed_in || 'Pending', query);

                li.innerHTML = `
                    <div class="bug-desc">${descHighlighted}</div>
                    <div class="bug-footer">
                        <span class="status-badge ${isFixed ? 'status-fixed' : 'status-pending'}">
                            ${statusHighlighted}
                        </span>
                    </div>
                `;
                bugList.appendChild(li);
            });

            if (bugsToShow.length === 0) {
                const emptyLi = document.createElement('li');
                emptyLi.className = 'bug-item';
                emptyLi.innerHTML = `<div class="bug-desc" style="color: var(--text-secondary); font-style: italic;">No bugs match the current filter.</div>`;
                bugList.appendChild(emptyLi);
            }

            card.appendChild(bugList);
            fragment.appendChild(card);
        });
        driverContainer.appendChild(fragment);
    }

    function highlightDriverCard(el) {
        if (!el) return;
        // Force a reflow before re-adding so the animation restarts even if
        // the same card was already highlighted a moment ago (e.g. clicking
        // the same bar twice in a row).
        el.classList.remove('highlight-pulse');
        void el.offsetWidth;
        el.classList.add('highlight-pulse');
        clearTimeout(el._highlightTimeout);
        el._highlightTimeout = setTimeout(() => el.classList.remove('highlight-pulse'), 2600);
    }

    function scrollToDriverFromHash() {
        const hash = window.location.hash;
        if (hash.startsWith('#driver-')) {
            setTimeout(() => {
                const el = document.getElementById(hash.slice(1));
                if (el) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    highlightDriverCard(el);
                }
            }, 150);
        }
    }

    function renderPagination() {
        paginationContainer.innerHTML = '';
        const totalPages = Math.ceil(filteredDrivers.length / itemsPerPage);
        if (totalPages <= 1) return;

        const createBtn = (content, page, label, active = false, disabled = false) => {
            const btn = document.createElement('button');
            btn.className = `page-btn ${active ? 'active' : ''}`;
            btn.innerHTML = content;
            btn.setAttribute('aria-label', label);
            btn.disabled = disabled;
            if (!disabled) btn.addEventListener('click', () => changePage(page));
            return btn;
        };

        paginationContainer.appendChild(createBtn('<ion-icon name="chevron-back-outline"></ion-icon>', currentPage - 1, 'Previous page', false, currentPage === 1));

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
                paginationContainer.appendChild(createBtn(p, p, `Go to page ${p}`, p === currentPage));
            }
        });

        paginationContainer.appendChild(createBtn('<ion-icon name="chevron-forward-outline"></ion-icon>', currentPage + 1, 'Next page', false, currentPage === totalPages));
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
        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = setTimeout(() => {
            applyFiltersAndSort(true, true);
        }, 300);
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

    trendsRangeChips.forEach(chip => {
        chip.addEventListener('click', () => {
            trendsRangeChips.forEach(c => {
                const isActive = c === chip;
                c.classList.toggle('active', isActive);
                c.setAttribute('aria-pressed', isActive);
            });
            renderTrendsChart(chip.dataset.range);
        });
    });

    window.addEventListener('resize', () => {
        clearTimeout(resizeDebounceTimer);
        resizeDebounceTimer = setTimeout(() => renderTrendsChart(), 200);
    });

    // Bound once (not per-render) to avoid piling up duplicate listeners
    // every time the chart re-draws (range switch, resize, initial load).
    trendsChartSvg?.addEventListener('mouseleave', () => {
        resetTrendsTooltip(getTrendSeries(trendsRange), trendsRange);
    });

    window.addEventListener('hashchange', scrollToDriverFromHash);

});
