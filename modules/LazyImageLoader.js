// modules/LazyImageLoader.js
class LazyImageLoader {
    constructor(options = {}) {
        this.options = {
            rootMargin: '50px 0px',
            threshold: 0.1,
            loadingClass: 'lazy-loading',
            loadedClass: 'lazy-loaded',
            errorClass: 'lazy-error',
            enableBlur: true,
            ...options
        };
        
        this.observer = null;
        this.observedElements = new Set();
        this.performanceMetrics = {
            totalImages: 0,
            loadedImages: 0,
            failedImages: 0,
            totalLoadTime: 0
        };
        
        this.init();
    }

    init() {
        if ('IntersectionObserver' in window) {
            this.setupIntersectionObserver();
        } else {
            // Fallback for older browsers
            this.setupFallbackLoader();
        }

        this.setupPerformanceMonitoring();
    }

    setupIntersectionObserver() {
        this.observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    this.loadImage(entry.target);
                    this.observer.unobserve(entry.target);
                    this.observedElements.delete(entry.target);
                }
            });
        }, {
            rootMargin: this.options.rootMargin,
            threshold: this.options.threshold
        });

        // Observe existing lazy images
        this.observeAllLazyImages();
    }

    setupFallbackLoader() {
        // Load all images immediately for older browsers
        console.warn('IntersectionObserver not supported. Loading all images immediately.');
        const lazyImages = document.querySelectorAll('img[data-src]');
        lazyImages.forEach(img => {
            this.loadImage(img);
        });
    }

    observeAllLazyImages() {
        const lazyImages = document.querySelectorAll('img[data-src]');
        lazyImages.forEach(img => {
            this.observeImage(img);
        });

        this.performanceMetrics.totalImages = lazyImages.length;
    }

    observeImage(img) {
        if (!this.observer || this.observedElements.has(img)) {
            return;
        }

        // Add loading state
        img.classList.add(this.options.loadingClass);
        
        // Add blur effect if enabled
        if (this.options.enableBlur && !img.style.filter) {
            img.style.filter = 'blur(5px)';
            img.style.transition = 'filter 0.3s ease';
        }

        this.observer.observe(img);
        this.observedElements.add(img);
    }

    loadImage(img) {
        const src = img.getAttribute('data-src');
        if (!src) {
            this.handleImageError(img, 'No data-src attribute');
            return;
        }

        const loadStartTime = performance.now();

        // Create new image for preloading
        const image = new Image();
        
        image.onload = () => {
            const loadTime = performance.now() - loadStartTime;
            this.handleImageLoad(img, image.src, loadTime);
        };

        image.onerror = () => {
            const loadTime = performance.now() - loadStartTime;
            this.handleImageError(img, 'Failed to load image', loadTime);
        };

        // Start loading
        image.src = src;
    }

    handleImageLoad(img, src, loadTime) {
        // Update performance metrics
        this.performanceMetrics.loadedImages++;
        this.performanceMetrics.totalLoadTime += loadTime;

        // Swap src
        img.src = src;
        img.removeAttribute('data-src');

        // Update classes
        img.classList.remove(this.options.loadingClass);
        img.classList.add(this.options.loadedClass);

        // Remove blur effect
        if (this.options.enableBlur) {
            img.style.filter = 'blur(0)';
            
            // Remove filter after transition
            setTimeout(() => {
                img.style.filter = '';
            }, 300);
        }

        // Dispatch custom event
        img.dispatchEvent(new CustomEvent('lazyImage:loaded', {
            detail: { loadTime, src }
        }));

        // Check if all images are loaded
        this.checkAllImagesLoaded();
    }

    handleImageError(img, error, loadTime = 0) {
        // Update performance metrics
        this.performanceMetrics.failedImages++;
        this.performanceMetrics.totalLoadTime += loadTime;

        // Update classes
        img.classList.remove(this.options.loadingClass);
        img.classList.add(this.options.errorClass);

        // Set placeholder or error image
        img.src = this.getPlaceholderImage();
        img.alt = 'ইমেজ লোড করতে ব্যর্থ হয়েছে';

        // Dispatch custom event
        img.dispatchEvent(new CustomEvent('lazyImage:error', {
            detail: { error, loadTime }
        }));

        console.error('Lazy image load failed:', error, img);

        // Check if all images are loaded
        this.checkAllImagesLoaded();
    }

    getPlaceholderImage() {
        // Return a placeholder image SVG
        return "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%23f0f0f0'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='Arial' font-size='12' fill='%23999'%3Eইমেজ%3C/text%3E%3C/svg%3E";
    }

    checkAllImagesLoaded() {
        const { totalImages, loadedImages, failedImages } = this.performanceMetrics;
        const totalProcessed = loadedImages + failedImages;

        if (totalProcessed >= totalImages && totalImages > 0) {
            document.dispatchEvent(new CustomEvent('lazyImage:allLoaded', {
                detail: this.performanceMetrics
            }));
        }
    }

    observeNewImages(container) {
        if (!container) return;

        const newLazyImages = container.querySelectorAll('img[data-src]');
        newLazyImages.forEach(img => {
            if (!this.observedElements.has(img)) {
                this.observeImage(img);
                this.performanceMetrics.totalImages++;
            }
        });
    }

    // Force load a specific image
    loadImageNow(img) {
        if (this.observedElements.has(img)) {
            this.observer.unobserve(img);
            this.observedElements.delete(img);
        }
        this.loadImage(img);
    }

    // Force load all images in viewport
    loadVisibleImages() {
        this.observedElements.forEach(img => {
            const rect = img.getBoundingClientRect();
            const isInViewport = (
                rect.top <= window.innerHeight &&
                rect.bottom >= 0 &&
                rect.left <= window.innerWidth &&
                rect.right >= 0
            );

            if (isInViewport) {
                this.loadImageNow(img);
            }
        });
    }

    // Refresh observer for dynamically added content
    refresh() {
        if (this.observer) {
            // Disconnect and reconnect observer
            this.observer.disconnect();
            this.observedElements.clear();
            this.setupIntersectionObserver();
        }
    }

    // Get performance metrics
    getPerformanceMetrics() {
        const metrics = { ...this.performanceMetrics };
        
        if (metrics.loadedImages > 0) {
            metrics.averageLoadTime = metrics.totalLoadTime / metrics.loadedImages;
            metrics.successRate = (metrics.loadedImages / metrics.totalImages) * 100;
        }
        
        return metrics;
    }

    // Preload important images
    preloadImages(urls) {
        urls.forEach(url => {
            const img = new Image();
            img.src = url;
        });
    }

    setupPerformanceMonitoring() {
        // Monitor for layout shifts caused by images
        if ('PerformanceObserver' in window) {
            try {
                const layoutShiftObserver = new PerformanceObserver((list) => {
                    for (const entry of list.getEntries()) {
                        if (entry.hadRecentInput) return;
                        
                        // Check if layout shift is caused by images
                        const sources = entry.sources || [];
                        const imageSources = sources.filter(source => 
                            source.node && source.node.tagName === 'IMG'
                        );
                        
                        if (imageSources.length > 0) {
                            console.warn('Layout shift caused by images:', imageSources);
                        }
                    }
                });

                layoutShiftObserver.observe({ type: 'layout-shift', buffered: true });
            } catch (error) {
                console.warn('Layout shift observation not supported:', error);
            }
        }
    }

    // Clean up
    destroy() {
        if (this.observer) {
            this.observer.disconnect();
            this.observedElements.clear();
        }
    }
}

// Export the class
if (typeof module !== 'undefined' && module.exports) {
    module.exports = LazyImageLoader;
}