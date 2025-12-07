// modules/DynamicImports.js
class DynamicImports {
    constructor() {
        this.loadedModules = new Map();
        this.loadingModules = new Map();
        this.moduleCache = new Map();
        this.performance = {
            totalLoads: 0,
            cacheHits: 0,
            loadTimes: []
        };
        
        this.config = {
            cacheEnabled: true,
            cacheDuration: 5 * 60 * 1000, // 5 minutes
            retryAttempts: 2,
            retryDelay: 1000,
            timeout: 10000,
            preloadModules: ['CommentModal', 'ReportModal']
        };
        
        this.init();
    }

    init() {
        this.setupPreloadStrategy();
        this.setupPerformanceMonitoring();
    }

    async loadModule(moduleName, forceReload = false) {
        // Check cache first
        if (this.config.cacheEnabled && !forceReload) {
            const cached = this.getFromCache(moduleName);
            if (cached) {
                this.performance.cacheHits++;
                return cached;
            }
        }

        // Check if already loading
        if (this.loadingModules.has(moduleName)) {
            return this.loadingModules.get(moduleName);
        }

        this.performance.totalLoads++;
        const loadStartTime = performance.now();

        try {
            // Create loading promise
            const loadPromise = this.loadModuleWithRetry(moduleName);
            this.loadingModules.set(moduleName, loadPromise);

            const module = await loadPromise;
            const loadTime = performance.now() - loadStartTime;
            
            this.performance.loadTimes.push(loadTime);
            
            // Store in cache
            if (this.config.cacheEnabled) {
                this.setToCache(moduleName, module);
            }
            
            // Update loaded modules
            this.loadedModules.set(moduleName, module);
            this.loadingModules.delete(moduleName);

            // Dispatch event
            this.dispatchModuleEvent('module:loaded', {
                moduleName,
                loadTime,
                fromCache: false
            });

            return module;

        } catch (error) {
            this.loadingModules.delete(moduleName);
            
            this.dispatchModuleEvent('module:error', {
                moduleName,
                error,
                loadTime: performance.now() - loadStartTime
            });
            
            throw error;
        }
    }

    async loadModuleWithRetry(moduleName, attempt = 0) {
        try {
            const modulePath = this.getModulePath(moduleName);
            const module = await this.loadWithTimeout(modulePath);
            return module;
            
        } catch (error) {
            if (attempt < this.config.retryAttempts) {
                console.warn(`Retrying module load ${moduleName}, attempt ${attempt + 1}`);
                await this.delay(this.config.retryDelay * (attempt + 1));
                return this.loadModuleWithRetry(moduleName, attempt + 1);
            }
            throw error;
        }
    }

    async loadWithTimeout(modulePath) {
        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                reject(new Error(`Module load timeout: ${modulePath}`));
            }, this.config.timeout);

            // Dynamic import with error handling
            import(modulePath)
                .then(module => {
                    clearTimeout(timeoutId);
                    resolve(module);
                })
                .catch(error => {
                    clearTimeout(timeoutId);
                    reject(error);
                });
        });
    }

    getModulePath(moduleName) {
        const moduleMap = {
            'CommentModal': './modules/CommentModal.js',
            'ReportModal': './modules/ReportModal.js',
            'ImageEditor': './modules/ImageEditor.js',
            'VideoPlayer': './modules/VideoPlayer.js',
            'Analytics': './modules/Analytics.js',
            'AdminPanel': './modules/AdminPanel.js',
            'ContentModeration': './modules/ContentModeration.js',
            'ReportingSystem': './modules/ReportingSystem.js',
            'AdminModeration': './modules/AdminModeration.js',
            'InfiniteScrollManager': './modules/InfiniteScrollManager.js',
            'LazyImageLoader': './modules/LazyImageLoader.js',
            'AdvancedCacheManager': './modules/AdvancedCacheManager.js'
        };

        const path = moduleMap[moduleName];
        if (!path) {
            throw new Error(`Unknown module: ${moduleName}`);
        }
        
        return path;
    }

    getFromCache(moduleName) {
        if (!this.config.cacheEnabled) return null;
        
        const cached = this.moduleCache.get(moduleName);
        if (!cached) return null;
        
        const now = Date.now();
        if (now - cached.timestamp > this.config.cacheDuration) {
            this.moduleCache.delete(moduleName);
            return null;
        }
        
        return cached.module;
    }

    setToCache(moduleName, module) {
        if (!this.config.cacheEnabled) return;
        
        this.moduleCache.set(moduleName, {
            module,
            timestamp: Date.now()
        });
    }

    async preloadModules(moduleNames = null) {
        const modulesToPreload = moduleNames || this.config.preloadModules;
        
        const preloadPromises = modulesToPreload.map(async moduleName => {
            try {
                await this.loadModule(moduleName);
                console.log(`Preloaded module: ${moduleName}`);
            } catch (error) {
                console.warn(`Failed to preload module ${moduleName}:`, error);
            }
        });

        await Promise.allSettled(preloadPromises);
    }

    setupPreloadStrategy() {
        // Preload critical modules on idle time
        if ('requestIdleCallback' in window) {
            requestIdleCallback(() => {
                this.preloadModules();
            });
        } else {
            // Fallback: preload after page load
            window.addEventListener('load', () => {
                setTimeout(() => this.preloadModules(), 1000);
            });
        }

        // Preload modules based on user interaction hints
        this.setupInteractionBasedPreloading();
    }

    setupInteractionBasedPreloading() {
        // Preload when user hovers over elements that might need modules
        const preloadTriggers = [
            { selector: '.comment-btn', modules: ['CommentModal'] },
            { selector: '.report-content-btn', modules: ['ReportModal'] },
            { selector: '[data-admin]', modules: ['AdminPanel', 'AdminModeration'] }
        ];

        preloadTriggers.forEach(({ selector, modules }) => {
            document.addEventListener('mouseover', (e) => {
                if (e.target.matches(selector) || e.target.closest(selector)) {
                    this.preloadModules(modules);
                }
            }, { once: true, passive: true });
        });
    }

    setupPerformanceMonitoring() {
        // Report performance metrics periodically
        setInterval(() => {
            this.reportPerformance();
        }, 30000); // Every 30 seconds
    }

    reportPerformance() {
        const metrics = this.getPerformanceMetrics();
        
        if (metrics.totalLoads > 0) {
            console.group('Dynamic Imports Performance');
            console.log('Total loads:', metrics.totalLoads);
            console.log('Cache hits:', metrics.cacheHits);
            console.log('Cache hit rate:', metrics.cacheHitRate + '%');
            console.log('Average load time:', metrics.averageLoadTime + 'ms');
            console.log('Loaded modules:', Array.from(this.loadedModules.keys()));
            console.groupEnd();
        }

        // Send to analytics if available
        if (window.gtag) {
            gtag('event', 'dynamic_imports_performance', metrics);
        }
    }

    getPerformanceMetrics() {
        const totalLoads = this.performance.totalLoads;
        const cacheHits = this.performance.cacheHits;
        const loadTimes = this.performance.loadTimes;
        
        const metrics = {
            totalLoads,
            cacheHits,
            cacheHitRate: totalLoads > 0 ? (cacheHits / totalLoads * 100).toFixed(1) : 0,
            averageLoadTime: loadTimes.length > 0 ? 
                (loadTimes.reduce((a, b) => a + b, 0) / loadTimes.length).toFixed(1) : 0,
            loadedModulesCount: this.loadedModules.size,
            cachedModulesCount: this.moduleCache.size
        };
        
        return metrics;
    }

    // Route-based code splitting
    async loadRouteComponents(route) {
        const routeModules = {
            '/': ['CommentModal', 'ReportModal'],
            '/profile': ['CommentModal', 'ReportModal'],
            '/admin': ['AdminPanel', 'AdminModeration', 'ContentModeration', 'ReportingSystem'],
            '/search': ['CommentModal', 'ReportModal']
        };

        const modulesToLoad = routeModules[route] || routeModules['/'];
        
        try {
            await this.preloadModules(modulesToLoad);
        } catch (error) {
            console.warn('Route-based preloading failed:', error);
        }
    }

    // Clear cache for specific module
    clearModuleCache(moduleName) {
        this.moduleCache.delete(moduleName);
        this.loadedModules.delete(moduleName);
    }

    // Clear all cache
    clearAllCache() {
        this.moduleCache.clear();
        this.loadedModules.clear();
        this.performance.totalLoads = 0;
        this.performance.cacheHits = 0;
        this.performance.loadTimes = [];
    }

    // Get module loading state
    getModuleState(moduleName) {
        if (this.loadedModules.has(moduleName)) {
            return 'loaded';
        }
        if (this.loadingModules.has(moduleName)) {
            return 'loading';
        }
        return 'not_loaded';
    }

    // Utility methods
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    dispatchModuleEvent(eventName, detail) {
        const event = new CustomEvent(eventName, { detail });
        window.dispatchEvent(event);
    }

    // Clean up
    destroy() {
        this.loadedModules.clear();
        this.loadingModules.clear();
        this.moduleCache.clear();
    }
}

// Export the class
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DynamicImports;
}