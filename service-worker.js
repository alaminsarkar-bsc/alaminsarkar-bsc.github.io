// service-worker.js - Enhanced for Full Offline Support (Islamic Pro)
// Updated Strategy: NetworkFirst for Admin Pages to ensure updates are visible immediately.

const CACHE_NAME = 'doa-angina-v6-offline'; // Version updated to v5 to force update
const ASSETS_CACHE = 'assets-v6';
const MEDIA_CACHE = 'media-v6';
const API_CACHE = 'api-v6';
const FONT_CACHE = 'fonts-v6';

// admin.html এবং campaign-admin.html এখান থেকে সরানো হয়েছে
// যাতে ইন্সটলেশনের সময় এগুলো স্ট্যাটিক ক্যাশে জমা না হয়।
const urlsToCache = [
  './',
  './index.html',
  './profile.html',
  './style.css',
  './admin.css',
  './script.js',
  './admin.js',
  './campaign-admin.js', // JS ফাইল রাখা হলো, তবে HTML পেজগুলো NetworkFirst এ হ্যান্ডেল হবে
  './post.html',
  './post.js',
  './islamic.html',
  './islamic.css',
  './islamic.js',
  './manifest.json',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'
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
  // এডমিন এবং ক্যাম্পেইন এডমিন পেজের জন্য নেটওয়ার্ক আগে চেক করা হবে।
  if (event.request.url.includes('/admin.html') || event.request.url.includes('/campaign-admin.html')) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          return caches.open(ASSETS_CACHE).then((cache) => {
            // নতুন ভার্সন পেলে ক্যাশ আপডেট করবে
            cache.put(event.request, networkResponse.clone());
            return networkResponse;
          });
        })
        .catch(() => {
          // নেটওয়ার্ক না থাকলে ক্যাশ থেকে দেখাবে
          return caches.match(event.request);
        })
    );
    return;
  }

  // 2. Handle Google Fonts & Font Awesome (Cache First - Persistent)
  if (requestUrl.hostname.includes('fonts.googleapis.com') || 
      requestUrl.hostname.includes('fonts.gstatic.com') ||
      requestUrl.hostname.includes('cdnjs.cloudflare.com')) {
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
  // এটি অফলাইনে আগের ডেটা দেখাবে এবং অনলাইনে থাকলে আপডেট করবে
  if (requestUrl.hostname.includes('api.aladhan.com') || 
      requestUrl.hostname.includes('api.alquran.cloud') || 
      requestUrl.hostname.includes('cdn.jsdelivr.net') || // Hadith JSONs
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
             // Network failed, swallow error
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