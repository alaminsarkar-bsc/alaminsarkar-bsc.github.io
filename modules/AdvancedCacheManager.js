// modules/AdvancedCacheManager.js
class AdvancedCacheManager {
    constructor() {
        this.cacheName = 'doa-angina-advanced-v2';
        this.cacheStrategies = {
            'static': 'cache-first',
            'api': 'network-first',
            'images': 'cache-first',
            'videos': 'cache-first',
            'user-data': 'network-first',
            'dynamic': 'stale-while-revalidate'
        };
        
        this.cacheConfig = {
            maxAge: {
                'static': 24 * 60 * 60 * 1000, // 24 hours
                'api': 5 * 60 * 1000, // 5 minutes
                'images': 7 * 24 * 60 * 60 * 1000, // 7 days
                'videos': 7 * 24 * 60 * 60 * 1000, // 7 days
                'user-data': 2 * 60 * 1000, // 2 minutes
                'dynamic': 10 * 60 * 1000 // 10 minutes
            },
            maxEntries: {
                'images': 100,
                'videos': 50,
                'api': 200,
                'static': 50
            }
        };
        
        this.performance = {
            cacheHits: 0,
            cacheMisses: 0,
            networkRequests: 0,
            errors: 0
        };
        
        this.init();
    }

    async init() {
        await this.cleanupOldCaches();
        this.setupBackgroundSync();
        this.setupPerformanceMonitoring();
    }

    async cacheRequest(request, strategy = 'network-first') {
        const url = new URL(request.url);
        const resourceType = this.getResourceType(url);
        const cacheKey = this.generateCacheKey(request);
        
        try {
            let response;
            
            switch (strategy) {
                case 'cache-first':
                    response = await this.cacheFirst(request, cacheKey, resourceType);
                    break;
                case 'network-first':
                    response = await this.networkFirst(request, cacheKey, resourceType);
                    break;
                case 'stale-while-revalidate':
                    response = await this.staleWhileRevalidate(request, cacheKey, resourceType);
                    break;
                case 'network-only':
                    response = await this.networkOnly(request);
                    break;
                case 'cache-only':
                    response = await this.cacheOnly(request, cacheKey);
                    break;
                default:
                    response = await fetch(request);
            }
            
            return response;
            
        } catch (error) {
            this.performance.errors++;
            console.error('Cache strategy failed:', error);
            throw error;
        }
    }

    async cacheFirst(request, cacheKey, resourceType) {
        // Try cache first
        const cache = await caches.open(this.cacheName);
        const cachedResponse = await cache.match(cacheKey);
        
        if (cachedResponse) {
            this.performance.cacheHits++;
            
            // Check if cache is stale
            if (this.isCacheFresh(cachedResponse, resourceType)) {
                // Background update for next time
                this.updateCacheInBackground(request, cache, cacheKey, resourceType);
                return cachedResponse;
            } else {
                // Cache is stale, delete it
                await cache.delete(cacheKey);
            }
        }
        
        this.performance.cacheMisses++;
        this.performance.networkRequests++;
        
        // Fetch from network
        const networkResponse = await fetch(request);
        
        if (networkResponse.ok) {
            // Clone response before storing
            const responseToCache = networkResponse.clone();
            
            // Add cache headers
            const headers = new Headers(responseToCache.headers);
            headers.set('sw-cache-timestamp', Date.now().toString());
            headers.set('sw-cache-strategy', 'cache-first');
            headers.set('sw-cache-type', resourceType);
            
            const cachedResponse = new Response(responseToCache.body, {
                status: responseToCache.status,
                statusText: responseToCache.statusText,
                headers: headers
            });
            
            await cache.put(cacheKey, cachedResponse);
            await this.cleanupCacheIfNeeded(resourceType);
        }
        
        return networkResponse;
    }

    async networkFirst(request, cacheKey, resourceType) {
        try {
            this.performance.networkRequests++;
            
            // Try network first
            const networkResponse = await fetch(request);
            
            if (networkResponse.ok) {
                // Clone response before storing
                const responseToCache = networkResponse.clone();
                
                // Add cache headers
                const headers = new Headers(responseToCache.headers);
                headers.set('sw-cache-timestamp', Date.now().toString());
                headers.set('sw-cache-strategy', 'network-first');
                headers.set('sw-cache-type', resourceType);
                
                const cachedResponse = new Response(responseToCache.body, {
                    status: responseToCache.status,
                    statusText: responseToCache.statusText,
                    headers: headers
                });
                
                const cache = await caches.open(this.cacheName);
                await cache.put(cacheKey, cachedResponse);
                await this.cleanupCacheIfNeeded(resourceType);
                
                return networkResponse;
            }
            
            throw new Error('Network response not ok');
            
        } catch (error) {
            // Network failed, try cache
            this.performance.cacheMisses++;
            const cache = await caches.open(this.cacheName);
            const cachedResponse = await cache.match(cacheKey);
            
            if (cachedResponse) {
                this.performance.cacheHits++;
                return cachedResponse;
            }
            
            throw error;
        }
    }

    async staleWhileRevalidate(request, cacheKey, resourceType) {
        const cache = await caches.open(this.cacheName);
        const cachedResponse = await cache.match(cacheKey);
        
        // Return cached response immediately if available
        if (cachedResponse) {
            this.performance.cacheHits++;
            
            // Check if cache is fresh
            if (!this.isCacheFresh(cachedResponse, resourceType)) {
                // Cache is stale, update in background
                this.updateCacheInBackground(request, cache, cacheKey, resourceType);
            }
            
            return cachedResponse;
        }
        
        this.performance.cacheMisses++;
        this.performance.networkRequests++;
        
        // No cache, fetch from network
        const networkResponse = await fetch(request);
        
        if (networkResponse.ok) {
            // Clone response before storing
            const responseToCache = networkResponse.clone();
            
            // Add cache headers
            const headers = new Headers(responseToCache.headers);
            headers.set('sw-cache-timestamp', Date.now().toString());
            headers.set('sw-cache-strategy', 'stale-while-revalidate');
            headers.set('sw-cache-type', resourceType);
            
            const cachedResponse = new Response(responseToCache.body, {
                status: responseToCache.status,
                statusText: networkResponse.statusText,
                headers: headers
            });
            
            await cache.put(cacheKey, cachedResponse);
            await this.cleanupCacheIfNeeded(resourceType);
        }
        
        return networkResponse;
    }

    async networkOnly(request) {
        this.performance.networkRequests++;
        return await fetch(request);
    }

    async cacheOnly(request, cacheKey) {
        const cache = await caches.open(this.cacheName);
        const cachedResponse = await cache.match(cacheKey);
        
        if (cachedResponse) {
            this.performance.cacheHits++;
            return cachedResponse;
        }
        
        this.performance.cacheMisses++;
        throw new Error('Not found in cache');
    }

    async updateCacheInBackground(request, cache, cacheKey, resourceType) {
        // Don't block the main response
        setTimeout(async () => {
            try {
                const networkResponse = await fetch(request);
                
                if (networkResponse.ok) {
                    const responseToCache = networkResponse.clone();
                    
                    const headers = new Headers(responseToCache.headers);
                    headers.set('sw-cache-timestamp', Date.now().toString());
                    headers.set('sw-cache-strategy', 'background-update');
                    headers.set('sw-cache-type', resourceType);
                    
                    const cachedResponse = new Response(responseToCache.body, {
                        status: responseToCache.status,
                        statusText: responseToCache.statusText,
                        headers: headers
                    });
                    
                    await cache.put(cacheKey, cachedResponse);
                }
            } catch (error) {
                console.log('Background cache update failed:', error);
            }
        }, 0);
    }

    getResourceType(url) {
        if (url.pathname.includes('/storage/')) {
            if (url.pathname.includes('/post_images/')) return 'images';
            if (url.pathname.includes('/post_videos/')) return 'videos';
            return 'static';
        }
        
        if (url.pathname.includes('/rest/v1/')) {
            if (url.pathname.includes('/users')) return 'user-data';
            return 'api';
        }
        
        if (url.pathname.endsWith('.html') || url.pathname.endsWith('.css') || url.pathname.endsWith('.js')) {
            return 'static';
        }
        
        return 'dynamic';
    }

    generateCacheKey(request) {
        // Include URL and some headers in cache key
        const url = new URL(request.url);
        const key = `${request.method}-${url.href}-${request.headers.get('accept')}`;
        return key;
    }

    isCacheFresh(cachedResponse, resourceType) {
        const timestampHeader = cachedResponse.headers.get('sw-cache-timestamp');
        if (!timestampHeader) return false;
        
        const cacheTime = parseInt(timestampHeader, 10);
        const now = Date.now();
        const maxAge = this.cacheConfig.maxAge[resourceType] || this.cacheConfig.maxAge.dynamic;
        
        return (now - cacheTime) < maxAge;
    }

    async cleanupCacheIfNeeded(resourceType) {
        const cache = await caches.open(this.cacheName);
        const maxEntries = this.cacheConfig.maxEntries[resourceType];
        
        if (!maxEntries) return;
        
        const requests = await cache.keys();
        const resourceRequests = requests.filter(req => {
            const url = new URL(req.url);
            return this.getResourceType(url) === resourceType;
        });
        
        if (resourceRequests.length > maxEntries) {
            // Sort by timestamp (oldest first)
            const sortedRequests = await Promise.all(
                resourceRequests.map(async req => {
                    const response = await cache.match(req);
                    const timestamp = response?.headers.get('sw-cache-timestamp');
                    return {
                        request: req,
                        timestamp: timestamp ? parseInt(timestamp, 10) : 0
                    };
                })
            );
            
            sortedRequests.sort((a, b) => a.timestamp - b.timestamp);
            
            // Remove oldest entries
            const toRemove = sortedRequests.slice(0, resourceRequests.length - maxEntries);
            for (const { request } of toRemove) {
                await cache.delete(request);
            }
            
            console.log(`Cleaned up ${toRemove.length} ${resourceType} entries`);
        }
    }

    async cleanupOldCaches() {
        const cacheNames = await caches.keys();
        const oldCaches = cacheNames.filter(name => 
            name.startsWith('doa-angina-') && name !== this.cacheName
        );
        
        await Promise.all(
            oldCaches.map(name => caches.delete(name))
        );
        
        if (oldCaches.length > 0) {
            console.log(`Cleaned up ${oldCaches.length} old caches`);
        }
    }

    setupBackgroundSync() {
        // Periodic cache cleanup
        setInterval(() => {
            this.cleanupOldCaches();
        }, 60 * 60 * 1000); // Every hour
        
        // Update popular resources in background
        setInterval(() => {
            this.updatePopularResources();
        }, 5 * 60 * 1000); // Every 5 minutes
    }

    async updatePopularResources() {
        // Update frequently accessed resources in background
        const popularUrls = [
            '/index.html',
            '/style.css',
            '/script.js'
        ];
        
        const cache = await caches.open(this.cacheName);
        
        for (const url of popularUrls) {
            try {
                const request = new Request(url);
                const cacheKey = this.generateCacheKey(request);
                await this.updateCacheInBackground(request, cache, cacheKey, 'static');
            } catch (error) {
                console.log('Background update failed for:', url, error);
            }
        }
    }

    setupPerformanceMonitoring() {
        // Report cache performance periodically
        setInterval(() => {
            this.reportPerformance();
        }, 60000); // Every minute
    }

    reportPerformance() {
        const totalRequests = this.performance.cacheHits + this.performance.cacheMisses;
        
        if (totalRequests > 0) {
            const hitRate = (this.performance.cacheHits / totalRequests * 100).toFixed(1);
            
            console.group('Cache Performance');
            console.log('Total requests:', totalRequests);
            console.log('Cache hits:', this.performance.cacheHits);
            console.log('Cache misses:', this.performance.cacheMisses);
            console.log('Hit rate:', hitRate + '%');
            console.log('Network requests:', this.performance.networkRequests);
            console.log('Errors:', this.performance.errors);
            console.groupEnd();
            
            // Reset counters for next period
            this.performance.cacheHits = 0;
            this.performance.cacheMisses = 0;
            this.performance.networkRequests = 0;
            this.performance.errors = 0;
        }
    }

    // Preload important resources
    async preloadResources(urls) {
        const cache = await caches.open(this.cacheName);
        
        const preloadPromises = urls.map(async url => {
            try {
                const request = new Request(url);
                const response = await fetch(request);
                
                if (response.ok) {
                    const cacheKey = this.generateCacheKey(request);
                    await cache.put(cacheKey, response);
                }
            } catch (error) {
                console.log('Preload failed for:', url, error);
            }
        });
        
        await Promise.allSettled(preloadPromises);
    }

    // Clear specific URL from cache
    async clearUrlFromCache(url) {
        const cache = await caches.open(this.cacheName);
        const request = new Request(url);
        const cacheKey = this.generateCacheKey(request);
        return await cache.delete(cacheKey);
    }

    // Clear all cache
    async clearAllCache() {
        const cache = await caches.open(this.cacheName);
        const requests = await cache.keys();
        
        await Promise.all(
            requests.map(request => cache.delete(request))
        );
        
        console.log('Cleared all cache entries');
    }

    // Get cache stats
    async getCacheStats() {
        const cache = await caches.open(this.cacheName);
        const requests = await cache.keys();
        
        const stats = {
            totalEntries: requests.length,
            entriesByType: {},
            totalSize: 0
        };
        
        for (const request of requests) {
            const response = await cache.match(request);
            const resourceType = this.getResourceType(new URL(request.url));
            
            stats.entriesByType[resourceType] = (stats.entriesByType[resourceType] || 0) + 1;
            
            if (response) {
                const contentLength = response.headers.get('content-length');
                if (contentLength) {
                    stats.totalSize += parseInt(contentLength, 10);
                }
            }
        }
        
        stats.totalSizeMB = (stats.totalSize / (1024 * 1024)).toFixed(2);
        
        return stats;
    }
}

// Export the class
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AdvancedCacheManager;
}