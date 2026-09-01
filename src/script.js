// Progressive enhancement layer on top of the server-rendered page (see
// src/index.njk): every driver card, bug, and stat already exists in the
// HTML at load time, so this file never fetches data - it only reads the
// data-* attributes and text already in the DOM and hides/reorders/shows
// those same elements. A visitor with JavaScript disabled still gets the
// full, readable list; this just adds search, filters, sort, pagination,
// and the interactive trends chart on top of it.
document.addEventListener('DOMContentLoaded', () => {
    const driverContainer = document.getElementById('driver-container');
    const searchInput = document.getElementById('search-input');
    const searchClearBtn = document.getElementById('search-clear');
    const themeBtn = document.getElementById('theme-toggle');
    const viewModeBtn = document.getElementById('view-mode-toggle');
    const sortSelect = document.getElementById('sort-select');
    // Scoped to #status-filters so the trends-range chips don't get swept
    // into the status-filter logic just because they share `.chip`.
    const statusChips = document.querySelectorAll('#status-filters .chip');
    const htmlEl = document.documentElement;
    const paginationContainer = document.querySelector('.pagination-container');
    const noResultsEl = document.getElementById('no-results');
    const clearFiltersBtn = document.getElementById('clear-filters-btn');
    const resultsStatus = document.getElementById('results-status');
    const trendsChartSvg = document.getElementById('trends-chart');
    const trendsTooltip = document.getElementById('trends-tooltip');
    const trendsRangeChips = document.querySelectorAll('#trends-range .chip');

    let currentFilter = 'all';
    let currentSort = 'version-desc';
    let currentPage = 1;
    const itemsPerPage = 9;
    let matchingCards = [];
    let searchDebounceTimer = null;
    let resizeDebounceTimer = null;
    let trendsRange = 'all';

    // Driver versions sort by number, not by string: a plain string sort
    // would put "581.9" after "581.10" alphabetically, which is backwards.
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

    function escapeHTML(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // Wraps every match of the current search query in <mark>. Reads
    // textContent (not innerHTML) as the source of truth each time, since
    // wrapping/unwrapping <mark> tags never changes textContent - so this
    // is safe to call repeatedly on the same element as the query changes.
    function highlightEl(el, query) {
        const raw = el.textContent;
        if (!query) {
            el.innerHTML = escapeHTML(raw);
            return;
        }
        const safeQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(${safeQuery})`, 'gi');
        el.innerHTML = escapeHTML(raw).replace(regex, '<mark class="highlight">$1</mark>');
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

    // Reads the server-rendered cards once at startup - version, bug totals,
    // and per-bug fixed/pending state all come from data-* attributes stamped
    // on the markup at build time (see src/_data/driversSorted.js), not from
    // any fetched JSON.
    function buildCardIndex() {
        return Array.from(driverContainer.querySelectorAll('.driver-card')).map(el => {
            const bugItems = Array.from(el.querySelectorAll('.bug-item')).map(li => ({
                el: li,
                fixed: li.dataset.fixed === 'true',
                descEl: li.querySelector('.bug-desc'),
                statusEl: li.querySelector('.status-badge'),
            }));
            return {
                el,
                version: el.dataset.version,
                bugsTotal: parseInt(el.dataset.bugsTotal, 10) || 0,
                bugsFixed: parseInt(el.dataset.bugsFixed, 10) || 0,
                versionEl: el.querySelector('.driver-version'),
                bugListEl: el.querySelector('.bug-list'),
                bugItems,
                placeholderEl: null,
            };
        });
    }

    const cards = buildCardIndex();
    // cards[0] is the newest version at load time (server sorts version-desc).
    const latestVersion = cards.length ? cards[0].version : null;
    if (latestVersion) {
        document.title = `NvidiaWatch | Latest Driver ${latestVersion}`;
    }

    // Precomputed once and never re-sorted by the UI's sort control - the
    // trends chart always reads chronologically regardless of how the
    // driver list itself is currently sorted/filtered.
    const chronological = cards
        .map(c => ({ version: c.version, total: c.bugsTotal, fixed: c.bugsFixed, pending: c.bugsTotal - c.bugsFixed }))
        .sort((a, b) => compareVersions(a.version, b.version));

    function getOrCreatePlaceholder(card) {
        if (!card.placeholderEl) {
            const li = document.createElement('li');
            li.className = 'bug-item hidden';
            const desc = document.createElement('div');
            desc.className = 'bug-desc';
            desc.style.color = 'var(--text-secondary)';
            desc.style.fontStyle = 'italic';
            desc.textContent = 'No bugs match the current filter.';
            li.appendChild(desc);
            card.bugListEl.appendChild(li);
            card.placeholderEl = li;
        }
        return card.placeholderEl;
    }

    // A card matches if either its version number matches the search text,
    // or at least one of its bugs matches *both* the active status filter
    // (all/pending/fixed) and the search text. Always highlights/hides every
    // bug row as a side effect, regardless of whether the card ends up
    // included, so state never goes stale between filter passes.
    function filterCard(card, query) {
        let anyVisible = false;
        card.bugItems.forEach(bug => {
            const matchesStatus = currentFilter === 'all' ||
                (currentFilter === 'pending' && !bug.fixed) ||
                (currentFilter === 'fixed' && bug.fixed);
            const descText = bug.descEl.textContent.toLowerCase();
            const statusText = bug.statusEl.textContent.toLowerCase();
            const matchesSearch = !query || descText.includes(query) || statusText.includes(query);
            const visible = matchesStatus && matchesSearch;
            bug.el.classList.toggle('hidden', !visible);
            highlightEl(bug.descEl, query);
            highlightEl(bug.statusEl, query);
            if (visible) anyVisible = true;
        });
        getOrCreatePlaceholder(card).classList.toggle('hidden', anyVisible);
        highlightEl(card.versionEl, query);
        const versionText = `driver ${card.version}`.toLowerCase();
        return versionText.includes(query) || anyVisible;
    }

    function sortCards() {
        cards.sort((a, b) => {
            switch (currentSort) {
                case 'version-asc': return compareVersions(a.version, b.version);
                case 'version-desc': return compareVersions(b.version, a.version);
                case 'bugs-asc': return a.bugsTotal - b.bugsTotal;
                case 'bugs-desc': return b.bugsTotal - a.bugsTotal;
                default: return 0;
            }
        });
        const frag = document.createDocumentFragment();
        cards.forEach(c => frag.appendChild(c.el));
        driverContainer.appendChild(frag);
    }

    function recomputeMatches() {
        sortCards();
        const query = searchInput.value.toLowerCase().trim();
        matchingCards = cards.filter(card => filterCard(card, query));
    }

    function getPageList(current, total) {
        const delta = 1;
        const range = [];
        for (let i = 1; i <= total; i++) {
            if (i === 1 || i === total || (i >= current - delta && i <= current + delta)) {
                range.push(i);
            }
        }
        const withDots = [];
        let prev = 0;
        for (const p of range) {
            if (prev && p - prev > 1) withDots.push('...');
            withDots.push(p);
            prev = p;
        }
        return withDots;
    }

    function renderPagination(totalPages) {
        paginationContainer.innerHTML = '';
        if (totalPages <= 1) return;

        const makeBtn = (label, page, { active = false, disabled = false, ariaLabel } = {}) => {
            const btn = document.createElement('button');
            btn.className = `page-btn ${active ? 'active' : ''}`;
            btn.innerHTML = label;
            btn.setAttribute('aria-label', ariaLabel || `Page ${page}`);
            btn.disabled = disabled;
            if (!disabled) btn.addEventListener('click', () => changePage(page));
            return btn;
        };

        paginationContainer.appendChild(makeBtn('<ion-icon name="chevron-back-outline"></ion-icon>', currentPage - 1, { ariaLabel: 'Previous page', disabled: currentPage === 1 }));

        getPageList(currentPage, totalPages).forEach(p => {
            if (p === '...') {
                const span = document.createElement('span');
                span.className = 'page-btn';
                span.style.cursor = 'default';
                span.textContent = '…';
                span.setAttribute('aria-hidden', 'true');
                paginationContainer.appendChild(span);
            } else {
                paginationContainer.appendChild(makeBtn(String(p), p, { active: p === currentPage }));
            }
        });

        paginationContainer.appendChild(makeBtn('<ion-icon name="chevron-forward-outline"></ion-icon>', currentPage + 1, { ariaLabel: 'Next page', disabled: currentPage === totalPages }));
    }

    // Applies the current page slice to `matchingCards` (already sorted and
    // filtered) by toggling `.hidden` on every card - matched-but-off-page
    // cards and non-matching cards both end up hidden this way.
    function renderView() {
        const totalPages = Math.max(1, Math.ceil(matchingCards.length / itemsPerPage));
        if (currentPage > totalPages) currentPage = totalPages;
        if (currentPage < 1) currentPage = 1;

        const start = (currentPage - 1) * itemsPerPage;
        const pageSet = new Set(matchingCards.slice(start, start + itemsPerPage));
        cards.forEach(card => card.el.classList.toggle('hidden', !pageSet.has(card)));

        noResultsEl.classList.toggle('hidden', matchingCards.length !== 0);
        resultsStatus.textContent = `${matchingCards.length} driver${matchingCards.length === 1 ? '' : 's'} found`;
        renderPagination(totalPages);
    }

    function updateURL(replace = false) {
        const params = new URLSearchParams();
        if (searchInput.value) params.set('q', searchInput.value);
        if (currentPage > 1) params.set('page', currentPage);
        if (currentFilter !== 'all') params.set('filter', currentFilter);
        if (currentSort !== 'version-desc') params.set('sort', currentSort);
        const query = params.toString();
        const newRelativePathQuery = window.location.pathname + (query ? '?' + query : '');
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
        searchClearBtn.classList.toggle('hidden', !searchInput.value);
    }

    function updateChipUI() {
        statusChips.forEach(chip => {
            const isActive = chip.dataset.filter === currentFilter;
            chip.classList.toggle('active', isActive);
            chip.setAttribute('aria-pressed', isActive);
        });
    }

    function applyFiltersAndSort(resetPage = true, replaceHistory = false) {
        recomputeMatches();
        if (resetPage) currentPage = 1;
        renderView();
        updateURL(replaceHistory);
    }

    function changePage(page) {
        currentPage = page;
        renderView();
        updateURL();
        driverContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function clearAllFilters() {
        searchInput.value = '';
        searchClearBtn.classList.add('hidden');
        currentFilter = 'all';
        updateChipUI();
        applyFiltersAndSort(true, true);
        searchInput.focus();
    }

    function highlightDriverCard(el) {
        if (!el) return;
        // Force a reflow before re-adding so the animation restarts even if
        // the same card was already highlighted a moment ago.
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
                    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    highlightDriverCard(el);
                }
            }, 150);
        }
    }

    // Used by the trends chart (clicking a bar) to jump straight to a driver
    // card. Clears any active search/filter first, since the target driver's
    // bugs could otherwise be hidden by whatever filter was active when the
    // chart was clicked. Sort is left as-is, matching the driver list's
    // current order.
    function goToDriver(version) {
        searchInput.value = '';
        searchClearBtn.classList.add('hidden');
        currentFilter = 'all';
        updateChipUI();
        recomputeMatches();
        const idx = matchingCards.findIndex(c => c.version === version);
        if (idx !== -1) currentPage = Math.floor(idx / itemsPerPage) + 1;
        renderView();
        updateURL();
        history.pushState(null, '', `#driver-${version}`);
        scrollToDriverFromHash();
    }

    // Builds the per-driver bug-count series behind the trends chart, for one
    // of three ranges the user can pick via the chip buttons:
    //   - 'recent': the 20 newest versions, chart's default so it loads fast
    //     and stays readable without horizontal scrolling.
    //   - 'worst': the 15 versions with the most bugs regardless of when they
    //     shipped, then re-sorted back into version order so the x-axis still
    //     reads chronologically instead of jumbled by bug count.
    //   - 'all': every version ever tracked (can be wide - renderTrendsChart
    //     lets this range grow past the container width and scroll).
    function getTrendSeries(range) {
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

    // Builds the stacked bar chart by hand with raw SVG DOM nodes rather than
    // a charting library, to keep the site dependency-free. Re-run on range
    // switch, window resize, and initial load.
    function renderTrendsChart(range = trendsRange) {
        if (!trendsChartSvg || chronological.length === 0) return;
        trendsRange = range;
        const series = getTrendSeries(range);
        const ns = 'http://www.w3.org/2000/svg';
        trendsChartSvg.innerHTML = '';
        if (series.length === 0) return;

        // Bars get a fixed minimum width per range so they stay tappable/legible;
        // 'all' can have far more bars than fit the container, so once the natural
        // width exceeds the container the SVG grows past it and the wrapper scrolls
        // horizontally instead of squeezing every bar down to nothing.
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

            const g = document.createElementNS(ns, 'g');
            g.setAttribute('class', 'trend-bar-group');
            g.setAttribute('tabindex', '0');
            g.setAttribute('role', 'button');
            g.setAttribute('aria-label', `Driver ${item.version}: ${item.total} bugs, ${item.fixed} fixed, ${item.pending} pending. Jump to this driver.`);

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
                trendsTooltip.textContent = `Driver ${item.version} — ${item.total} bug${item.total === 1 ? '' : 's'} (${item.fixed} fixed, ${item.pending} pending)`;
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

    // --- Theme + view mode toggles -----------------------------------
    // The <html data-theme> attribute itself is already set by the inline
    // script in base.njk <head> (before first paint, to avoid a dark->light
    // flash on reload). This just syncs the toggle button's aria-pressed
    // state, since the button doesn't exist yet when the inline script runs.
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
        htmlEl.setAttribute('data-theme', savedTheme);
        themeBtn.setAttribute('aria-pressed', savedTheme === 'light');
    }

    const savedView = localStorage.getItem('view') || 'masonry';
    htmlEl.setAttribute('data-view', savedView);
    viewModeBtn.setAttribute('aria-pressed', savedView === 'timeline');
    driverContainer.classList.toggle('masonry-layout', savedView === 'masonry');
    driverContainer.classList.toggle('grid-layout', savedView === 'timeline');

    themeBtn.addEventListener('click', () => {
        const newTheme = htmlEl.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        htmlEl.setAttribute('data-theme', newTheme);
        themeBtn.setAttribute('aria-pressed', newTheme === 'light');
        localStorage.setItem('theme', newTheme);
    });

    viewModeBtn.addEventListener('click', () => {
        const newView = htmlEl.getAttribute('data-view') === 'timeline' ? 'masonry' : 'timeline';
        htmlEl.setAttribute('data-view', newView);
        viewModeBtn.setAttribute('aria-pressed', newView === 'timeline');
        localStorage.setItem('view', newView);
        driverContainer.classList.toggle('masonry-layout', newView === 'masonry');
        driverContainer.classList.toggle('grid-layout', newView === 'timeline');
    });

    // --- Per-card interactivity (copy link, click-to-anchor) ---------
    // Added here rather than in the template so a no-JS page never shows a
    // "clickable-looking" header or copy button that doesn't do anything.
    cards.forEach(card => {
        const header = card.el.querySelector('.driver-header');
        header.style.cursor = 'pointer';
        header.setAttribute('role', 'button');
        header.setAttribute('tabindex', '0');

        const copyBtn = card.el.querySelector('.copy-link-btn');
        copyBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const url = new URL(window.location.href);
            url.hash = `driver-${card.version}`;
            navigator.clipboard.writeText(url.toString())
                .then(() => showToast(`Link to Driver ${card.version} copied!`))
                .catch(() => showToast('Failed to copy link.'));
        });

        header.addEventListener('click', (e) => {
            if (e.target.closest('.copy-link-btn')) return;
            history.pushState(null, '', `#driver-${card.version}`);
            card.el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            highlightDriverCard(card.el);
        });
        header.addEventListener('keydown', (e) => {
            if (e.target.closest('.copy-link-btn')) return;
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                header.click();
            }
        });
    });

    // --- Search / filter / sort / pagination controls ----------------
    searchInput.addEventListener('input', () => {
        searchClearBtn.classList.toggle('hidden', !searchInput.value);
        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = setTimeout(() => applyFiltersAndSort(true, true), 300);
    });

    searchClearBtn.addEventListener('click', () => {
        searchInput.value = '';
        searchClearBtn.classList.add('hidden');
        applyFiltersAndSort(true, true);
        searchInput.focus();
    });

    statusChips.forEach(chip => {
        chip.addEventListener('click', () => {
            currentFilter = chip.dataset.filter;
            updateChipUI();
            applyFiltersAndSort(true, false);
        });
    });

    sortSelect.addEventListener('change', () => {
        currentSort = sortSelect.value;
        applyFiltersAndSort(true, false);
    });

    clearFiltersBtn.addEventListener('click', clearAllFilters);

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
        resizeDebounceTimer = setTimeout(() => renderTrendsChart(trendsRange), 200);
    });

    // --- Initial render -----------------------------------------------
    loadStateFromURL();
    recomputeMatches();

    const initialHash = window.location.hash;
    if (initialHash.startsWith('#driver-')) {
        const targetVersion = initialHash.replace('#driver-', '');
        const idx = matchingCards.findIndex(c => c.version === targetVersion);
        if (idx !== -1) currentPage = Math.floor(idx / itemsPerPage) + 1;
    }

    renderView();
    updateURL(true);
    scrollToDriverFromHash();
    renderTrendsChart('all');
});
