importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js')

const firebaseConfig = {
    apiKey: "AIzaSyD_aHPsTnrOoTI1CrykPQmn6aKWJGgPy-c",
    authDomain: "cado-a1b6d.firebaseapp.com",
    projectId: "cado-a1b6d",
    storageBucket: "cado-a1b6d.firebasestorage.app",
    messagingSenderId: "148347344602",
    appId: "1:148347344602:web:b3cac6acf3c812fd4a37e3",
    measurementId: "G-S7ZCZ249ET"
}

firebase.initializeApp(firebaseConfig)
const messaging = firebase.messaging()

function notificationFromPayload(payload) {
    const data = payload.data || {}
    const notification = payload.notification || {}
    const type = data.type || 'message'

    return {
        title: data.title || notification.title || 'Cado',
        options: {
            body: data.body || notification.body || '',
            icon: '/icons/icon-192.png',
            badge: '/icons/badge-72.png',
            tag: type === 'call' ? 'incoming-call' : `chat-${data.chatId || 'message'}`,
            renotify: true,
            vibrate: type === 'call' ? [500, 200, 500, 200, 500] : [160, 80, 160],
            data,
            actions: type === 'call'
                ? [
                    { action: 'accept', title: 'Accept' },
                    { action: 'decline', title: 'Decline' },
                ]
                : [
                    { action: 'open', title: 'Open' },
                ],
        }
    }
}

messaging.onBackgroundMessage((payload) => {
    if (payload.notification) return

    const notification = notificationFromPayload(payload)
    self.registration.showNotification(notification.title, notification.options)
})

self.addEventListener('notificationclick', (event) => {
    event.notification.close()

    const data = event.notification.data || {}
    const action = event.action || 'open'

    if (data.type === 'call' && action === 'decline') {
        event.waitUntil(
            self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
                clients.forEach((client) => {
                    client.postMessage({ type: 'CALL_DECLINED_FROM_NOTIFICATION', action, data })
                })
            })
        )
        return
    }

    const targetUrl = data.chatId ? `/?chat=${encodeURIComponent(data.chatId)}` : '/'

    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
            for (const client of clients) {
                client.postMessage({ type: 'NOTIFICATION_CLICK', action, data })
                if ('focus' in client) return client.focus()
            }

            if (self.clients.openWindow) return self.clients.openWindow(targetUrl)
        })
    )
})
