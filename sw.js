// Service Worker for HIYAMAX Pipeline
// Caching strategy: Images - Cache First, JSON - Stale While Revalidate, Pages - Network First

const CACHE_NAME = 'hiyamax-pipeline-v1';
const STATIC_CACHE = 'hiyamax-static-v1';
const IMAGE_CACHE = 'hiyamax-images-v1';
const JSON_CACHE = 'hiyamax-json-v1';

// Install event - cache static assets
self.addEventListener('install', (event) => {
    console.log('[SW] Installing...');
    
    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then((cache) => {
                return cache.addAll([
                    './pipeline.html',
                    './',
                    './index.html'
                ]);
            })
            .then(() => {
                console.log('[SW] Static assets cached');
                return self.skipWaiting();
            })
            .catch((err) => {
                console.error('[SW] Cache failed:', err);
            })
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating...');
    
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames
                        .filter((name) => {
                            return name.startsWith('hiyamax-') && 
                                   name !== STATIC_CACHE && 
                                   name !== IMAGE_CACHE && 
                                   name !== JSON_CACHE;
                        })
                        .map((name) => {
                            console.log('[SW] Deleting old cache:', name);
                            return caches.delete(name);
                        })
                );
            })
            .then(() => {
                console.log('[SW] Activation complete');
                return self.clients.claim();
            })
    );
});

// Helper: Check if URL is an image
function isImage(url) {
    return /\.(jpg|jpeg|png|gif|webp|svg|ico|bmp)(\?.*)?$/i.test(url);
}

// Helper: Check if URL is JSON
function isJSON(url) {
    return /\.(json)(\?.*)?$/i.test(url) || url.includes('/data/');
}

// Helper: Check if URL is a page
function isPage(url) {
    return /\.(html|htm)(\?.*)?$/i.test(url) || 
           (!/\.[a-zA-Z0-9]+$/.test(url) && !isImage(url) && !isJSON(url));
}

// Fetch event - apply caching strategies
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);
    
    // Skip non-GET requests
    if (request.method !== 'GET') {
        return;
    }
    
    // Skip cross-origin requests (except images)
    if (!url.origin.includes(self.location.origin) && !isImage(url.href)) {
        return;
    }
    
    // Strategy 1: Images - Cache First
    if (isImage(url.href)) {
        event.respondWith(cacheFirst(request, IMAGE_CACHE));
        return;
    }
    
    // Strategy 2: JSON - Stale While Revalidate
    if (isJSON(url.href)) {
        event.respondWith(staleWhileRevalidate(request, JSON_CACHE));
        return;
    }
    
    // Strategy 3: Pages - Network First
    if (isPage(url.href)) {
        event.respondWith(networkFirst(request, STATIC_CACHE));
        return;
    }
    
    // Default: Network with cache fallback
    event.respondWith(networkWithCacheFallback(request));
});

// Cache First strategy - for images
async function cacheFirst(request, cacheName) {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);
    
    if (cached) {
        // Return cached and refresh in background
        fetch(request)
            .then((response) => {
                if (response.ok) {
                    cache.put(request, response.clone());
                }
            })
            .catch(() => {});
        return cached;
    }
    
    // Not in cache, fetch and cache
    try {
        const response = await fetch(request);
        if (response.ok) {
            cache.put(request, response.clone());
        }
        return response;
    } catch (error) {
        // Return a placeholder for failed image loads
        console.error('[SW] Image fetch failed:', error);
        return new Response('Image not available', { status: 404 });
    }
}

// Stale While Revalidate strategy - for JSON
async function staleWhileRevalidate(request, cacheName) {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);
    
    // Always fetch fresh data
    const fetchPromise = fetch(request)
        .then((response) => {
            if (response.ok) {
                cache.put(request, response.clone());
            }
            return response;
        })
        .catch((error) => {
            console.error('[SW] JSON fetch failed:', error);
            throw error;
        });
    
    // Return cached immediately if available, otherwise wait for fetch
    if (cached) {
        // Update cache in background
        fetchPromise.catch(() => {});
        return cached;
    }
    
    return fetchPromise;
}

// Network First strategy - for pages
async function networkFirst(request, cacheName) {
    const cache = await caches.open(cacheName);
    
    try {
        const networkResponse = await fetch(request);
        if (networkResponse.ok) {
            cache.put(request, networkResponse.clone());
        }
        return networkResponse;
    } catch (error) {
        console.error('[SW] Network request failed, trying cache:', error);
        
        const cached = await cache.match(request);
        if (cached) {
            return cached;
        }
        
        // Return offline page if available
        const offlinePage = await cache.match('./pipeline.html');
        if (offlinePage) {
            return offlinePage;
        }
        
        throw error;
    }
}

// Network with cache fallback - default strategy
async function networkWithCacheFallback(request) {
    try {
        return await fetch(request);
    } catch (error) {
        const cached = await caches.match(request);
        if (cached) {
            return cached;
        }
        throw error;
    }
}

// Background sync for offline actions (future enhancement)
self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-data') {
        console.log('[SW] Background sync triggered');
        // Implement sync logic here if needed
    }
});

// Push notification support (future enhancement)
self.addEventListener('push', (event) => {
    if (event.data) {
        const data = event.data.json();
        event.waitUntil(
            self.registration.showNotification(data.title, {
                body: data.body,
                icon: './assets/favicon.ico',
                badge: './assets/badge.png'
            })
        );
    }
});
