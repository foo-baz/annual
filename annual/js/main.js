// Konfigurasi PDF.js Worker
pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

const PDF_URL = "asset/ar-bjbs-2025.pdf";
let pdfDoc = null;
let pageFlip = null;
const cache = new Map();

// Dimensi standar halaman
const PAGE_WIDTH = 800;
const PAGE_HEIGHT = 1130;

let thicknessLocked = false;
const leftThickness = document.getElementById("leftThickness");
const rightThickness = document.getElementById("rightThickness");

// State untuk Pencarian PDF
let searchResultsMap = [];

// State untuk Direct Zoom (Tanpa Modal)
let currentZoomScale = 1;
let isPanningBook = false;
let startBookX = 0, startBookY = 0;
let bookPanX = 0, bookPanY = 0;

// =========================================================
// 1. HELPER & PLACEHOLDER FUNCTIONS
// =========================================================

function createPlaceholder(pageNum) {
    const div = document.createElement("div");
    div.className = "page";
    div.dataset.page = pageNum;
    div.innerHTML = `
        <div class="page-loader">
            <div class="spinner"></div>
        </div>
    `;
    return div;
}

function positionButtons() {
    const bookEl = document.getElementById("book");
    const prevBtn = document.querySelector(".nav-prev");
    const nextBtn = document.querySelector(".nav-next");

    if (!bookEl || !prevBtn || !nextBtn) return;

    const rect = bookEl.getBoundingClientRect();
    const leftPos = Math.max(20, rect.left - 70);
    const rightPos = Math.min(window.innerWidth - 70, rect.right + 20);

    prevBtn.style.left = `${leftPos}px`;
    nextBtn.style.left = `${rightPos}px`;
}

// function updateThickness() {
//     if (!leftThickness || !rightThickness) return;

//     // Sembunyikan thickness di layar HP atau ketika buku sedang di-zoom
//     if (window.innerWidth < 768 || currentZoomScale > 1) {
//         leftThickness.style.opacity = "0";
//         rightThickness.style.opacity = "0";
//         return;
//     }

//     if (thicknessLocked || !pdfDoc || !pageFlip) return;

//     const items = [...document.querySelectorAll(".stf__item")].filter((el) => {
//         const rect = el.getBoundingClientRect();
//         return rect.width > 50 && rect.height > 50;
//     });

//     if (!items.length) return;

//     const rects = items.map((el) => el.getBoundingClientRect());
//     const minLeft = Math.min(...rects.map((r) => r.left));
//     const maxRight = Math.max(...rects.map((r) => r.right));
//     const minTop = Math.min(...rects.map((r) => r.top));
//     const maxBottom = Math.max(...rects.map((r) => r.bottom));
//     const height = maxBottom - minTop;

//     const currentIndex = pageFlip.getCurrentPageIndex();
//     const totalPages = pdfDoc.numPages;

//     if (currentIndex === 0) {
//         leftThickness.style.opacity = "0";
//         rightThickness.style.opacity = "0";
//         return;
//     }

//     const MAX_THICKNESS = 25; 

//     const ratioLeft = currentIndex / totalPages;
//     const ratioRight = (totalPages - currentIndex) / totalPages;

//     const leftWidth = Math.max(2, Math.round(MAX_THICKNESS * ratioLeft));
//     const rightWidth = Math.max(2, Math.round(MAX_THICKNESS * ratioRight));

//     leftThickness.style.opacity = "1";
//     rightThickness.style.opacity = "1";

//     leftThickness.style.top = `${minTop}px`;
//     rightThickness.style.top = `${minTop}px`;
//     leftThickness.style.height = `${height}px`;
//     rightThickness.style.height = `${height}px`;

//     leftThickness.style.left = `${minLeft - leftWidth}px`;
//     leftThickness.style.width = `${leftWidth}px`;

//     rightThickness.style.left = `${maxRight}px`;
//     rightThickness.style.width = `${rightWidth}px`;
// }

function updateThickness(ignoreLock = false) {
    if (!leftThickness || !rightThickness) return;

    // Jika di HP atau sedang di-zoom, pastikan sembunyi
    if (window.innerWidth < 768 || currentZoomScale > 1) {
        leftThickness.style.opacity = "0";
        rightThickness.style.opacity = "0";
        return;
    }

    // Abaikan pengecekan thicknessLocked jika ignoreLock = true
    if (!ignoreLock && thicknessLocked) return;
    if (!pdfDoc || !pageFlip) return;

    // Ambil elemen halaman yang sedang tampak
    const items = [...document.querySelectorAll(".stf__item")].filter((el) => {
        const rect = el.getBoundingClientRect();
        return rect.width > 50 && rect.height > 50;
    });

    if (!items.length) return;

    // Hitung posisi batas luar buku
    const rects = items.map((el) => el.getBoundingClientRect());
    const minLeft = Math.min(...rects.map((r) => r.left));
    const maxRight = Math.max(...rects.map((r) => r.right));
    const minTop = Math.min(...rects.map((r) => r.top));
    const maxBottom = Math.max(...rects.map((r) => r.bottom));
    const height = maxBottom - minTop;

    const currentIndex = pageFlip.getCurrentPageIndex();
    const totalPages = pdfDoc.numPages;

    if (currentIndex === 0) {
        leftThickness.style.opacity = "0";
        rightThickness.style.opacity = "0";
        return;
    }

    const MAX_THICKNESS = 25; 

    const ratioLeft = currentIndex / totalPages;
    const ratioRight = (totalPages - currentIndex) / totalPages;

    const leftWidth = Math.max(2, Math.round(MAX_THICKNESS * ratioLeft));
    const rightWidth = Math.max(2, Math.round(MAX_THICKNESS * ratioRight));

    // Atur posisi CSS
    leftThickness.style.top = `${minTop}px`;
    rightThickness.style.top = `${minTop}px`;
    leftThickness.style.height = `${height}px`;
    rightThickness.style.height = `${height}px`;

    leftThickness.style.left = `${minLeft - leftWidth}px`;
    leftThickness.style.width = `${leftWidth}px`;

    rightThickness.style.left = `${maxRight}px`;
    rightThickness.style.width = `${rightWidth}px`;

    // PAKSA PAKAI INLINE STYLE !IMPORTANT AGAR DISPLAY & OPACITY LANGSUNG MUNCUL
    leftThickness.style.setProperty("opacity", "1", "important");
    rightThickness.style.setProperty("opacity", "1", "important");
    leftThickness.style.setProperty("display", "block", "important");
    rightThickness.style.setProperty("display", "block", "important");
}

function centerCover() {
    if (window.innerWidth <= 768) return;

    const parentEl = document.querySelector(".stf__parent");
    if (parentEl && pageFlip) {
        if (pageFlip.getCurrentPageIndex() === 0) {
            const width = parentEl.offsetWidth;
            parentEl.style.marginLeft = `-${width / 6}px`;
        } else {
            parentEl.style.marginLeft = "0px";
        }
    }
}

function updateBookShadow() {
    const parentEl = document.querySelector(".stf__parent");
    if (parentEl && pageFlip) {
        if (pageFlip.getCurrentPageIndex() > 0 && window.innerWidth > 768) {
            parentEl.classList.add("active");
        } else {
            parentEl.classList.remove("active");
        }
    }
}

// =========================================================
// 2. PDF RENDERING & CACHING
// =========================================================

async function renderPage(pageNum, customScale = 2) {
    const cacheKey = `${pageNum}_${customScale}`;
    if (cache.has(cacheKey)) return cache.get(cacheKey);

    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: customScale });
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({ canvasContext: ctx, viewport: viewport }).promise;
    if (customScale === 2) cache.set(cacheKey, canvas);
    return canvas;
}

async function hydratePage(pageNum) {
    const pageEl = document.querySelector(`[data-page="${pageNum}"]`);
    if (!pageEl || pageEl.dataset.loaded === "1") return;

    const loader = document.getElementById("pageLoader");
    const currentIndex = pageFlip ? pageFlip.getCurrentPageIndex() + 1 : 1;

    if (pageNum === currentIndex && loader) {
        loader.style.display = "flex";
        const loaderText = document.getElementById("loaderText");
        if (loaderText) loaderText.innerText = `Loading page ${pageNum}...`;
    }

    const progressBar = document.getElementById("loaderProgress");
    if (progressBar) progressBar.style.width = "20%";

    const canvas = await renderPage(pageNum, 2);

    if (progressBar) progressBar.style.width = "80%";
    pageEl.innerHTML = "";
    pageEl.appendChild(canvas);
    pageEl.dataset.loaded = "1";

    if (progressBar) progressBar.style.width = "100%";

    if (pageNum === currentIndex && loader) {
        setTimeout(() => {
            loader.style.display = "none";
            if (progressBar) progressBar.style.width = "0%";
        }, 200);
    }
}

async function preloadAround(pageNum) {
    const start = Math.max(1, pageNum - 2);
    const end = Math.min(pdfDoc.numPages, pageNum + 2);

    for (let i = start; i <= end; i++) {
        hydratePage(i);
    }
    cleanup(pageNum);
}

function cleanup(currentPage) {
    for (const [key] of cache) {
        const pageNum = parseInt(key.split("_")[0]);
        if (pageNum < currentPage - 5 || pageNum > currentPage + 5) {
            cache.delete(key);
            const pageEl = document.querySelector(`[data-page="${pageNum}"]`);
            if (pageEl) {
                pageEl.dataset.loaded = "0";
                pageEl.innerHTML = `
                    <div class="page-loader">
                        <div class="spinner"></div>
                    </div>
                `;
            }
        }
    }
}

// =========================================================
// 3. LOGIKA ZOOM DIRECT (TANPA MODAL OVERLAY)
// =========================================================

// function updateBookZoomTransform() {
//     const bookEl = document.getElementById("book");
//     if (!bookEl) return;

//     if (currentZoomScale <= 1) {
//         currentZoomScale = 1;
//         bookPanX = 0;
//         bookPanY = 0;
//         bookEl.classList.remove("zoomed");
//         bookEl.style.transform = "none";

//         // Buka kunci thickness
//         thicknessLocked = false;

//         // Paksa kembalikan opacity & hitung posisi langsung
//         setTimeout(() => {
//             if (leftThickness) leftThickness.style.opacity = "1";
//             if (rightThickness) rightThickness.style.opacity = "1";
//             updateThickness();
//         }, 50); // Beri delay kecil (50ms) agar CSS transform selesai di-reset
//     } else {
//         bookEl.classList.add("zoomed");
//         bookEl.style.transform = `translate(${bookPanX}px, ${bookPanY}px) scale(${currentZoomScale})`;
        
//         // Sembunyikan thickness saat zoom > 1
//         if (leftThickness) leftThickness.style.opacity = "0";
//         if (rightThickness) rightThickness.style.opacity = "0";
//     }
// }

function updateBookZoomTransform() {
    const bookEl = document.getElementById("book");
    if (!bookEl) return;

    if (currentZoomScale <= 1) {
        zoomOutDirect(); // Jika skala <= 1, jalankan reset lengkap
    } else {
        bookEl.classList.add("zoomed");
        bookEl.style.transform = `translate(${bookPanX}px, ${bookPanY}px) scale(${currentZoomScale})`;
        
        // Sembunyikan thickness saat zoom in
        if (leftThickness) leftThickness.style.opacity = "0";
        if (rightThickness) rightThickness.style.opacity = "0";
    }
}

function zoomInDirect(step = 0.25) {
    currentZoomScale = Math.min(3, currentZoomScale + step);
    updateBookZoomTransform();
}

function zoomOutDirect() {
    // Paksa zoom langsung kembali ke 1x
    currentZoomScale = 1;
    bookPanX = 0;
    bookPanY = 0;

    const bookEl = document.getElementById("book");
    if (bookEl) {
        bookEl.classList.remove("zoomed");
        bookEl.style.transform = "none"; // Reset CSS Transform
    }

    // Buka kunci thickness
    thicknessLocked = false;

    // TUNGGU BROWSER SELESAI RE-LAYOUT (Double RAF)
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            // Paksa hitung ulang dan tampilkan thickness
            updateThickness(true);
        });
    });
}

function resetBookZoom() {
    currentZoomScale = 1;
    bookPanX = 0;
    bookPanY = 0;
    updateBookZoomTransform();
}

function setupDirectZoomEvents() {
    const bookEl = document.getElementById("book");
    if (!bookEl) return;

    const onStart = (e) => {
        if (currentZoomScale <= 1) return;
        isPanningBook = true;
        const pageX = e.touches ? e.touches[0].clientX : e.clientX;
        const pageY = e.touches ? e.touches[0].clientY : e.clientY;
        startBookX = pageX - bookPanX;
        startBookY = pageY - bookPanY;
    };

    const onMove = (e) => {
        if (!isPanningBook || currentZoomScale <= 1) return;
        e.preventDefault();
        const pageX = e.touches ? e.touches[0].clientX : e.clientX;
        const pageY = e.touches ? e.touches[0].clientY : e.clientY;
        bookPanX = pageX - startBookX;
        bookPanY = pageY - startBookY;
        updateBookZoomTransform();
    };

    const onEnd = () => {
        isPanningBook = false;
    };

    bookEl.addEventListener("mousedown", onStart);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onEnd);

    bookEl.addEventListener("touchstart", onStart, { passive: false });
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd);

    bookEl.addEventListener("wheel", (e) => {
        if (e.ctrlKey || currentZoomScale > 1) {
            e.preventDefault();
            if (e.deltaY < 0) zoomInDirect(0.15);
            else zoomOutDirect(0.15);
        }
    }, { passive: false });
}

// =========================================================
// 4. TABLE OF CONTENTS & SEARCH
// =========================================================

async function buildTOC() {
    const container = document.getElementById("tocSidebar");
    if (!container) return;
    container.innerHTML = "";

    const spreads = [
        { leftPage: 16, rightPage: 17, page: 17 },
        { leftPage: 42, rightPage: 43, page: 43 },
        { leftPage: 86, rightPage: 87, page: 87 },
        { leftPage: 166, rightPage: 167, page: 167 },
        { leftPage: 348, rightPage: 349, page: 349 },
        { leftPage: 364, rightPage: 365, page: 365 },
        { leftPage: 374, rightPage: 375, page: 375 },
        { leftPage: 688, rightPage: 689, page: 689 },
        { leftPage: 690, rightPage: 691, page: 691 },
        { leftPage: 723, rightPage: 724, page: 724 }
    ];

    for (const item of spreads) {
        const itemEl = document.createElement("div");
        itemEl.className = "toc-spread-item";

        const wrapper = document.createElement("div");
        wrapper.className = "toc-pages-wrapper";

        if (item.leftPage && item.leftPage > 0) {
            const canvasLeft = await renderPage(item.leftPage, 2);
            const c = document.createElement("canvas");
            c.width = canvasLeft.width;
            c.height = canvasLeft.height;
            c.getContext("2d").drawImage(canvasLeft, 0, 0);
            wrapper.appendChild(c);
        }

        if (item.rightPage && item.rightPage <= pdfDoc.numPages) {
            const canvasRight = await renderPage(item.rightPage, 2);
            const c = document.createElement("canvas");
            c.width = canvasRight.width;
            c.height = canvasRight.height;
            c.getContext("2d").drawImage(canvasRight, 0, 0);
            wrapper.appendChild(c);
        }

        const numbersEl = document.createElement("div");
        numbersEl.className = "toc-page-numbers";
        numbersEl.innerHTML = `
            <span>${item.leftPage || ""}</span>
            <span>${item.rightPage || ""}</span>
        `;

        itemEl.appendChild(wrapper);
        itemEl.appendChild(numbersEl);

        itemEl.onclick = () => {
            pageFlip.flip(item.page - 1);
            const overlay = document.getElementById("tocOverlay");
            if (overlay) overlay.classList.remove("active");
        };

        container.appendChild(itemEl);
    }
}

function openSearchSidebar() {
    const sidebar = document.getElementById("searchSidebar");
    const backdrop = document.getElementById("searchBackdrop");
    if (sidebar) sidebar.classList.add("active");
    if (backdrop) backdrop.classList.add("active");

    const input = document.getElementById("searchInput");
    if (input) {
        input.focus();
        input.select();
    }
}

function closeSearchSidebar() {
    const sidebar = document.getElementById("searchSidebar");
    const backdrop = document.getElementById("searchBackdrop");
    if (sidebar) sidebar.classList.remove("active");
    if (backdrop) backdrop.classList.remove("active");
}

async function performSearch(query) {
    const searchStatus = document.getElementById("searchStatus");
    const searchResultsList = document.getElementById("searchResultsList");

    if (!query || !query.trim() || !pdfDoc) {
        if (searchStatus) searchStatus.innerText = "";
        if (searchResultsList) searchResultsList.innerHTML = "";
        return;
    }

    if (searchStatus) searchStatus.innerText = "Mencari...";
    if (searchResultsList) searchResultsList.innerHTML = "";

    const cleanQuery = query.trim().toLowerCase();
    let totalMatches = 0;
    searchResultsMap = [];

    for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
        const page = await pdfDoc.getPage(pageNum);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((item) => item.str).join(" ");
        const lowerText = pageText.toLowerCase();

        if (lowerText.includes(cleanQuery)) {
            const matches = lowerText.split(cleanQuery).length - 1;
            totalMatches += matches;

            const idx = lowerText.indexOf(cleanQuery);
            const start = Math.max(0, idx - 25);
            const end = Math.min(pageText.length, idx + cleanQuery.length + 35);
            const snippet = pageText.substring(start, end);

            searchResultsMap.push({
                page: pageNum,
                matchesCount: matches,
                snippet: `...${snippet}...`
            });
        }
    }

    if (searchResultsMap.length === 0) {
        if (searchStatus) searchStatus.innerText = "0 pages found.";
        return;
    }

    if (searchStatus) {
        searchStatus.innerText = `${searchResultsMap.length} pages found.`;
    }

    if (searchResultsList) {
        searchResultsMap.forEach((res) => {
            const card = document.createElement("div");
            card.className = "search-result-card";

            const pageDisplay = res.page % 2 === 0 
                ? `p. ${res.page} - ${res.page + 1}` 
                : `p. ${res.page}`;

            card.innerHTML = `
                <div class="search-result-page-title">${pageDisplay}</div>
                <div class="search-result-snippet">${res.snippet}</div>
                ${
                    res.matchesCount > 1
                        ? `<div class="search-result-count-info">...and ${res.matchesCount - 1} more results on this page.</div>`
                        : ""
                }
            `;

            card.onclick = () => {
                if (pageFlip) {
                    pageFlip.flip(res.page - 1);
                }
            };

            searchResultsList.appendChild(card);
        });
    }
}

// =========================================================
// 5. INISIALISASI UTAMA (INIT)
// =========================================================

async function init() {
    pdfDoc = await pdfjsLib.getDocument(PDF_URL).promise;
    await pdfDoc.getOutline();

    const pagesContainer = document.getElementById("pages-container");
    for (let i = 1; i <= pdfDoc.numPages; i++) {
        const placeholder = createPlaceholder(i);
        pagesContainer.appendChild(placeholder);
    }

    const isMobile = window.innerWidth < 768;

    pageFlip = new St.PageFlip(document.getElementById("book"), {
        width: PAGE_WIDTH,
        height: PAGE_HEIGHT,
        size: "stretch",
        flippingTime: 400,
        maxShadowOpacity: 0.2,
        drawShadow: true,
        minWidth: isMobile ? 250 : 300,
        maxWidth: 2000,
        minHeight: isMobile ? 300 : 400,
        maxHeight: 3000,
        showCover: !isMobile,
        mobileScrollSupport: true,
        clickEventForward: false,
        usePortrait: true,
        useMouseEvents: true
    });

    pageFlip.loadFromHTML(document.querySelectorAll("#pages-container .page"));

    pageFlip.on("changeState", (e) => {
        if (e.data === "read") {
            thicknessLocked = false;
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    updateThickness();
                });
            });
        }
    });

    window.addEventListener("resize", updateThickness);
    setTimeout(updateThickness, 500);

    updateBookShadow();
    buildTOC();
    setupDirectZoomEvents();

    const tocFirst = document.getElementById("tocFirstPage");
    if (tocFirst) {
        tocFirst.addEventListener("click", () => {
            pageFlip.flip(0);
            document.getElementById("tocOverlay").classList.remove("active");
        });
    }

    const tocLast = document.getElementById("tocLastPage");
    if (tocLast) {
        tocLast.addEventListener("click", () => {
            pageFlip.flip(pdfDoc.numPages - 1);
            document.getElementById("tocOverlay").classList.remove("active");
        });
    }

    setTimeout(() => {
        positionButtons();
        centerCover();
        document.getElementById("book").style.opacity = "1";
    }, 300);

    pageFlip.on("flip", () => {
        centerCover();
        resetBookZoom(); // Reset zoom otomatis saat halaman dibalik
    });

    await preloadAround(1);

    const mobileInput = document.getElementById("mobilePageInput");
    if (mobileInput) mobileInput.value = 1;

    const mobileTotal = document.getElementById("mobileTotalPages");
    if (mobileTotal) mobileTotal.innerText = `/ ${pdfDoc.numPages}`;

    const desktopTotal = document.getElementById("totalPages");
    if (desktopTotal) desktopTotal.innerText = `/ ${pdfDoc.numPages}`;

    const headerTotalPages = document.getElementById("headerTotalPages");
    if (headerTotalPages) headerTotalPages.innerText = `/ ${pdfDoc.numPages}`;

    const headerPageInput = document.getElementById("headerPageInput");
    if (headerPageInput) headerPageInput.value = 1;

    pageFlip.on("flip", async (e) => {
        const currentPageNum = e.data + 1;

        const mainInput = document.getElementById("pageInput");
        if (mainInput) mainInput.value = currentPageNum;

        if (mobileInput) mobileInput.value = currentPageNum;

        if (headerPageInput) headerPageInput.value = currentPageNum;

        updateBookShadow();
        preloadAround(currentPageNum);
    });

    setTimeout(() => {
        const loader = document.getElementById("initialLoader");
        if (loader) loader.classList.add("hide");
        document.body.style.overflow = "";
    }, 300);
}

// =========================================================
// 6. EVENT LISTENERS & NAVIGATION CONTROLS
// =========================================================

window.addEventListener("resize", () => {
    positionButtons();
    if (pageFlip) pageFlip.update();
});

const pageInput = document.getElementById("pageInput");
if (pageInput) {
    pageInput.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
            let p = parseInt(this.value);
            if (!isNaN(p)) {
                p = Math.max(1, Math.min(p, pdfDoc.numPages));
                pageFlip.flip(p - 1);
            }
        }
    });
}

const mobilePageInput = document.getElementById("mobilePageInput");
if (mobilePageInput) {
    mobilePageInput.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
            let p = parseInt(this.value);
            if (!isNaN(p)) {
                p = Math.max(1, Math.min(p, pdfDoc.numPages));
                pageFlip.flip(p - 1);
            }
        }
    });
}

const prevBtn = document.getElementById("prev");
if (prevBtn) prevBtn.onclick = () => pageFlip && pageFlip.flipPrev();

const nextBtn = document.getElementById("next");
if (nextBtn) nextBtn.onclick = () => pageFlip && pageFlip.flipNext();

const pagePrevBtn = document.getElementById("pagePrev");
if (pagePrevBtn) pagePrevBtn.onclick = () => pageFlip && pageFlip.flipPrev();

const pageNextBtn = document.getElementById("pageNext");
if (pageNextBtn) pageNextBtn.onclick = () => pageFlip && pageFlip.flipNext();

// Tombol Zoom Desktop
const zoomInBtn = document.getElementById("zoomIn");
if (zoomInBtn) zoomInBtn.onclick = () => zoomInDirect();

const zoomOutBtn = document.getElementById("zoomOut");
if (zoomOutBtn) zoomOutBtn.onclick = () => zoomOutDirect();

const fullscreenBtn = document.getElementById("fullscreenBtn");
if (fullscreenBtn) {
    fullscreenBtn.onclick = async () => {
        const viewer = document.querySelector(".viewer");
        if (document.fullscreenElement) {
            await document.exitFullscreen();
        } else if (viewer) {
            await viewer.requestFullscreen();
        }
    };
}

document.addEventListener("fullscreenchange", () => {
    if (fullscreenBtn) {
        fullscreenBtn.innerHTML = document.fullscreenElement ? "⮌" : "⛶";
    }
    setTimeout(() => {
        if (pageFlip) {
            pageFlip.update();
            positionButtons();
        }
    }, 100);
});

// Tombol Navigasi Mobile
const mPrev = document.getElementById("mobilePrev");
if (mPrev) mPrev.onclick = () => prevBtn && prevBtn.click();

const mNext = document.getElementById("mobileNext");
if (mNext) mNext.onclick = () => nextBtn && nextBtn.click();

const mZoomIn = document.getElementById("mobileZoomIn");
if (mZoomIn) mZoomIn.onclick = () => zoomInDirect();

const mZoomOut = document.getElementById("mobileZoomOut");
if (mZoomOut) mZoomOut.onclick = () => zoomOutDirect();

const mFullscreen = document.getElementById("mobileFullscreen");
if (mFullscreen) mFullscreen.onclick = () => fullscreenBtn && fullscreenBtn.click();

const tocBtn = document.getElementById("tocButton");
if (tocBtn) {
    tocBtn.onclick = () => {
        document.getElementById("tocOverlay").classList.add("active");
    };
}

const closeToc = document.getElementById("closeToc");
if (closeToc) {
    closeToc.onclick = () => {
        document.getElementById("tocOverlay").classList.remove("active");
    };
}

const tocOverlay = document.getElementById("tocOverlay");
if (tocOverlay) {
    tocOverlay.addEventListener("click", function (e) {
        if (e.target === this) this.classList.remove("active");
    });
}

const mobileToc = document.getElementById("mobileToc");
if (mobileToc) {
    mobileToc.onclick = () => {
        document.getElementById("tocOverlay").classList.add("active");
    };
}

document.querySelectorAll(".lang-btn").forEach((btn) => {
    btn.addEventListener("click", function () {
        const lang = this.dataset.lang;
        localStorage.setItem("language", lang);
        const url = new URL(window.location);
        url.searchParams.set("lang", lang);
        window.location.href = url.toString();
    });
});

const firstPageBtn = document.getElementById("firstPageBtn");
if (firstPageBtn) {
    firstPageBtn.addEventListener("click", () => {
        pageFlip.flip(0);
    });
}

const lastPageBtn = document.getElementById("lastPageBtn");
if (lastPageBtn) {
    lastPageBtn.addEventListener("click", () => {
        pageFlip.flip(pdfDoc.numPages - 1);
    });
}

// =========================================================
// 7. HEADER BAR & SEARCH SIDEBAR CONTROLS
// =========================================================

const hPageInput = document.getElementById("headerPageInput");
if (hPageInput) {
    hPageInput.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
            let p = parseInt(this.value);
            if (!isNaN(p) && pdfDoc && pageFlip) {
                p = Math.max(1, Math.min(p, pdfDoc.numPages));
                pageFlip.flip(p - 1);
            }
        }
    });
}

const hPrev = document.getElementById("headerPrevBtn");
if (hPrev) hPrev.onclick = () => pageFlip && pageFlip.flipPrev();

const hNext = document.getElementById("headerNextBtn");
if (hNext) hNext.onclick = () => pageFlip && pageFlip.flipNext();

const hZoomIn = document.getElementById("headerZoomIn");
if (hZoomIn) hZoomIn.onclick = () => zoomInDirect();

const hZoomOut = document.getElementById("headerZoomOut");
if (hZoomOut) hZoomOut.onclick = () => zoomOutDirect();

const hFullscreen = document.getElementById("headerFullscreen");
if (hFullscreen) hFullscreen.onclick = () => {
    if (fullscreenBtn) fullscreenBtn.click();
};

const hTocBtn = document.getElementById("headerTocBtn");
if (hTocBtn) {
    hTocBtn.onclick = () => {
        const overlay = document.getElementById("tocOverlay");
        if (overlay) overlay.classList.add("active");
    };
}

const hSearchBtn = document.getElementById("headerSearchBtn");
if (hSearchBtn) {
    hSearchBtn.onclick = () => {
        openSearchSidebar();
    };
}

const closeSearch = document.getElementById("closeSearch");
if (closeSearch) {
    closeSearch.onclick = () => {
        closeSearchSidebar();
    };
}

const searchBackdrop = document.getElementById("searchBackdrop");
if (searchBackdrop) {
    searchBackdrop.onclick = () => {
        closeSearchSidebar();
    };
}

const searchInput = document.getElementById("searchInput");
const clearSearchInput = document.getElementById("clearSearchInput");

if (searchInput) {
    let debounceTimeout = null;

    searchInput.addEventListener("input", function () {
        const val = this.value;

        if (clearSearchInput) {
            if (val.length > 0) {
                clearSearchInput.classList.add("show");
            } else {
                clearSearchInput.classList.remove("show");
            }
        }

        clearTimeout(debounceTimeout);
        debounceTimeout = setTimeout(() => {
            performSearch(val);
        }, 400);
    });

    searchInput.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
            clearTimeout(debounceTimeout);
            performSearch(this.value);
        }
    });
}

if (clearSearchInput) {
    clearSearchInput.onclick = () => {
        if (searchInput) {
            searchInput.value = "";
            searchInput.focus();
            clearSearchInput.classList.remove("show");
            performSearch("");
        }
    };
}

// =========================================================
// 8. LOGIKA PENCEGAHAN KLIK UNTUK FLIP (Wajib Swipe/Drag)
// =========================================================

const bookContainer = document.getElementById("book");

if (bookContainer) {
    let startX = 0;
    let startY = 0;
    let isDragging = false;

    const handleStart = (e) => {
        const touch = e.touches ? e.touches[0] : e;
        startX = touch.clientX;
        startY = touch.clientY;
        isDragging = false;
    };

    const handleMove = (e) => {
        const touch = e.touches ? e.touches[0] : e;
        const diffX = Math.abs(touch.clientX - startX);
        const diffY = Math.abs(touch.clientY - startY);
        if (diffX > 10 || diffY > 10) {
            isDragging = true;
        }
    };

    bookContainer.addEventListener("mousedown", handleStart, true);
    bookContainer.addEventListener("touchstart", handleStart, true);

    bookContainer.addEventListener("mousemove", handleMove, true);
    bookContainer.addEventListener("touchmove", handleMove, true);

    bookContainer.addEventListener("click", function (e) {
        if (!isDragging) {
            e.stopPropagation();
            e.preventDefault();
        }
    }, true);

    bookContainer.addEventListener("mouseup", function (e) {
        if (!isDragging) {
            e.stopPropagation();
        }
    }, true);
}

// Jalankan Inisialisasi
init();