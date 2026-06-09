/* eslint-disable no-restricted-globals */

// Имя кэша приложения (используйте инкремент версии при обновлении структуры/файлов)
const CACHE_NAME = 'vkusbuket-cache-v1';

// Список базовых ресурсов для предварительного кэширования (App Shell)
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.ico',
  '/logo192.png',
  '/logo512.png'
];

// Событие установки: кэшируем основные ресурсы ядра
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Кэширование оболочки приложения');
        return cache.addAll(ASSETS_TO_CACHE);
      })
      .then(() => self.skipWaiting()) // Активируем новый воркер сразу
  );
});

// Событие активации: очищаем старые версии кэшей
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[SW] Удаление старого кэша:', cache);
            return caches.delete(cache);
          }
          return null;
        })
      );
    }).then(() => self.clients.claim()) // Получаем контроль над всеми открытыми вкладками
  );
});

// Перехват сетевых запросов
self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);

  // Обрабатываем только GET-запросы и игнорируем запросы к Supabase API, чтобы не ломать оффлайн-очередь в App.js
  if (event.request.method !== 'GET' || requestUrl.host.includes('supabase.co')) {
    return;
  }

  // Проверяем, является ли запрос статическим ресурсом сборки Webpack (скрипты, стили, шрифты, картинки)
  const isStaticAsset = event.request.url.startsWith(self.location.origin) &&
    (requestUrl.pathname.includes('/static/') ||
     requestUrl.pathname.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|otf|json)$/));

  if (isStaticAsset) {
    // Стратегия: Cache First (сначала кэш, при отсутствии - сеть) для статики
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(event.request).then((networkResponse) => {
          if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
            return networkResponse;
          }
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
          return networkResponse;
        });
      })
    );
  } else {
    // Стратегия: Network First (сначала сеть, при ошибке - кэш) для index.html и динамических переходов
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          // Кэшируем свежую копию страницы
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // Если сеть недоступна, пытаемся вернуть из кэша
          return caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
              return cachedResponse;
            }
            // Если запрос навигационный (переход на страницу), отдаем index.html из кэша
            if (event.request.mode === 'navigate') {
              return caches.match('/index.html');
            }
            return null;
          });
        })
    );
  }
});
