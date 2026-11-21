// Service worker mínimo: permite instalar o app no celular.
// Não guarda dados em cache — os dados sempre vêm do Supabase, atualizados.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))
self.addEventListener('fetch', () => {})
