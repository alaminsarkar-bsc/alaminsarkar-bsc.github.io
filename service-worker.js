// service-worker.js - Enhanced for Full Offline Support (Islamic Pro)
// Updated Strategy: Added Messages files & Image Compression Library

const CACHE_NAME = 'doa-angina-v13-offline'; // Version updated to v8
const ASSETS_CACHE = 'assets-v13';
const MEDIA_CACHE = 'media-v13';
const API_CACHE = 'api-v13';
const FONT_CACHE = 'fonts-v13';

// ক্যাশ করার জন্য ফাইলের তালিকা (নতুন ৩টি ফাইল এবং লাইব্রেরি যুক্ত করা হয়েছে)
const urlsToCache = [
  './',
  './index.html',
  './profile.html',
  './messages.html', // New
  './style.css',
  './messages.css',  // New
  './admin.css',
  './script.js',
  './messages.js',   // New
  './admin.js',
  './campaign-admin.js', 
  './post.html',
  './post.js',
  './islamic.html',
  './islamic.css',
  './islamic.js',
  './manifest.json',
  // External Libraries (Offline Support)
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://cdn.jsdelivr.net/npm/browser-image-compression@2.0.2/dist/browser-image-compression.js' // New Library
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(ASSETS_CACHE)
      .then((cache) => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);

  // 1. Handle Admin Pages (Network First, fallback to cache)
  if (event.request.url.includes('/admin.html') || event.request.url.includes('/campaign-admin.html')) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          return caches.open(ASSETS_CACHE).then((cache) => {
            cache.put(event.request, networkResponse.clone());
            return networkResponse;
          });
        })
        .catch(() => {
          return caches.match(event.request);
        })
    );
    return;
  }

  // 2. Handle Google Fonts & Font Awesome (Cache First - Persistent)
  if (requestUrl.hostname.includes('fonts.googleapis.com') || 
      requestUrl.hostname.includes('fonts.gstatic.com') ||
      requestUrl.hostname.includes('cdnjs.cloudflare.com') ||
      requestUrl.hostname.includes('cdn.jsdelivr.net')) { // Added cdn for libraries
    event.respondWith(
      caches.open(FONT_CACHE).then((cache) => {
        return cache.match(event.request).then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;
          return fetch(event.request).then((networkResponse) => {
            if (networkResponse.ok) {
              cache.put(event.request, networkResponse.clone());
            }
            return networkResponse;
          });
        });
      })
    );
    return;
  }

  // 3. Handle Supabase Storage (Images/Videos) -> Cache First (Aggressive)
  if (requestUrl.pathname.includes('/storage/v1/object/public/')) {
    event.respondWith(
      caches.open(MEDIA_CACHE).then((cache) => {
        return cache.match(event.request).then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;
          return fetch(event.request).then((networkResponse) => {
            if (networkResponse.ok) {
              cache.put(event.request, networkResponse.clone());
            }
            return networkResponse;
          });
        });
      })
    );
    return;
  }

  // 4. Handle Islamic APIs (Prayer, Quran, Hadith) -> Stale While Revalidate
  if (requestUrl.hostname.includes('api.aladhan.com') || 
      requestUrl.hostname.includes('api.alquran.cloud') || 
      requestUrl.hostname.includes('cdn.jsdelivr.net') || 
      (requestUrl.hostname.includes('supabase.co') && !requestUrl.pathname.includes('/storage/'))) {
    
    event.respondWith(
      caches.open(API_CACHE).then((cache) => {
        return cache.match(event.request).then((cachedResponse) => {
          const fetchPromise = fetch(event.request).then((networkResponse) => {
            if (networkResponse.ok) {
              cache.put(event.request, networkResponse.clone());
            }
            return networkResponse;
          }).catch((err) => {
             console.log('Network fetch failed for API, using offline cache if available.');
          });
          return cachedResponse || fetchPromise;
        });
      })
    );
    return;
  }

  // 5. Default Static Assets -> Cache First
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});

// Clean up old caches
self.addEventListener('activate', (event) => {
  const allowedCaches = [ASSETS_CACHE, MEDIA_CACHE, API_CACHE, FONT_CACHE];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (!allowedCaches.includes(cacheName)) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});