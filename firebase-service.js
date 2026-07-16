/**
 * firebase-service.js
 * Server-side Firebase Cloud Messaging sender.
 *
 * SETUP:
 *   1. npm install firebase-admin
 *   2. Download your Firebase service account JSON:
 *      Firebase Console → Project Settings → Service Accounts → Generate new private key
 *   3. Save it as: src/firebase-service-account.json  (never commit this file — add to .gitignore)
 *   4. Replace YOUR_PROJECT_ID below with your actual Firebase project ID
 */

const { initializeApp, cert } = require('firebase-admin')
const { getMessaging } = require('firebase-admin/messaging')
const path  = require('path')

// ── Initialize once ──────────────────────────────────────────────────────────
let initialized = false

function init() {
    if (initialized) return
    try {
        const serviceAccount = require('./src/firebase-service-account.json')
        initializeApp({
            credential: cert(serviceAccount),
        })
        initialized = true
        console.log('[FCM] Firebase Admin initialized')
    } catch (err) {
        console.error('[FCM] Failed to initialize Firebase Admin:', err.message)
        console.error('[FCM] Make sure src/firebase-service-account.json exists')
    }
}

init()

/**
 * Send a push notification to one or more FCM tokens.
 *
 * @param {string|string[]} tokens   - FCM registration token(s)
 * @param {object}          payload  - { title, body, data }
 * @param {string}          type     - 'message' | 'call'
 */
async function sendPush(tokens, payload, type = 'message') {
    if (!initialized) return { success: 0, invalid: [] }
    if (!tokens || tokens.length === 0) return { success: 0, invalid: [] }

    const tokenList = Array.isArray(tokens) ? tokens : [tokens]
    const validTokens = tokenList.filter(Boolean)
    if (validTokens.length === 0) return { success: 0, invalid: [] }

    // ── Notification payload ──────────────────────────────────────────────────
    const notification = {
        title: payload.title || 'New message',
        body:  payload.body  || '',
    }

    // ── Android config ────────────────────────────────────────────────────────
    const android = {
        priority: type === 'call' ? 'high' : 'normal',
        notification: {
            channelId: type === 'call' ? 'calls' : 'messages',
            priority:  type === 'call' ? 'max'    : 'high',
            sound:     type === 'call' ? 'ringtone' : 'default',
            clickAction: 'FLUTTER_NOTIFICATION_CLICK',
            // Android: show heads-up notification
            defaultVibrateTimings: true,
        },
    }

    // ── APNs config (iOS) ─────────────────────────────────────────────────────
    const apns = {
        headers: {
            'apns-priority': type === 'call' ? '10' : '5',
            // For call notifications on iOS use apns-push-type: voip
            // but that requires a VoIP certificate; for now use alert
            'apns-push-type': 'alert',
        },
        payload: {
            aps: {
                alert: {
                    title: notification.title,
                    body:  notification.body,
                },
                sound:     type === 'call' ? 'default' : 'default',
                badge:     1,
                // content-available: 1 keeps app alive in background
                'content-available': 1,
            },
        },
    }

    // ── Data payload (available in all app states) ────────────────────────────
    const data = {
        type,
        title: notification.title,
        body: notification.body,
        ...(payload.data || {}),
        // Stringify all values — FCM data values must be strings
        ...Object.fromEntries(
            Object.entries(payload.data || {}).map(([k, v]) => [k, String(v)])
        ),
    }

    // ── Send multicast ────────────────────────────────────────────────────────
    try {
        const message = {
            tokens: validTokens,
            android,
            apns,
            webpush: {
                headers: {
                    Urgency: type === 'call' ? 'high' : 'normal',
                    TTL: type === 'call' ? '60' : '2419200',
                },
                fcmOptions: {
                    link: '/',
                },
            },
            data,
        }

        const response = await getMessaging().sendEachForMulticast(message)

        // Clean up expired/invalid tokens
        const invalidTokens = []
        response.responses.forEach((resp, idx) => {
            if (!resp.success) {
                const code = resp.error?.code
                if (
                    code === 'messaging/registration-token-not-registered' ||
                    code === 'messaging/invalid-registration-token'
                ) {
                    invalidTokens.push(validTokens[idx])
                }
                console.error(`[FCM] Token ${idx} failed:`, resp.error?.message)
            }
        })

        console.log(`[FCM] Sent ${response.successCount}/${validTokens.length} — type: ${type}`)
        return { success: response.successCount, invalid: invalidTokens }

    } catch (err) {
        console.error('[FCM] sendPush error:', err.message)
        return { success: 0, invalid: [] }
    }
}

/**
 * Send a chat message notification.
 * Called from main.js after a message is created.
 *
 * @param {string}   receiverUsername
 * @param {string}   senderUsername
 * @param {string}   messageText
 * @param {string}   chatId
 * @param {Function} getUserTokens   - async fn(username) → string[]
 * @param {Function} removeTokens    - async fn(username, tokens[]) — cleanup invalid
 */
async function notifyMessage(receiverUsername, senderUsername, messageText, chatId, getUserTokens, removeTokens) {
    const tokens = await getUserTokens(receiverUsername)
    if (!tokens || tokens.length === 0) return { success: 0, invalid: [] }

    const preview = messageText
        ? (messageText.length > 60 ? messageText.slice(0, 60) + '...' : messageText)
        : 'Attachment'

    const result = await sendPush(tokens, {
        title: senderUsername,
        body:  preview,
        data:  {
            type:   'message',
            chatId,
            sender: senderUsername,
        }
    }, 'message')

    // Remove dead tokens
    if (result.invalid.length > 0) {
        await removeTokens(receiverUsername, result.invalid)
    }
}

/**
 * Send an incoming call notification.
 * Critical: must wake up the app even when killed.
 *
 * @param {string}   calleeUsername
 * @param {string}   callerUsername
 * @param {string}   room
 * @param {Function} getUserTokens
 * @param {Function} removeTokens
 */
async function notifyCall(calleeUsername, callerUsername, room, getUserTokens, removeTokens) {
    const tokens = await getUserTokens(calleeUsername)
    if (!tokens || tokens.length === 0) return { success: 0, invalid: [] }

    const result = await sendPush(tokens, {
        title: `Call from ${callerUsername}`,
        body:  'Incoming voice call',
        data:  {
            type:   'call',
            caller: callerUsername,
            room,
        }
    }, 'call')

    if (result.invalid.length > 0) {
        await removeTokens(calleeUsername, result.invalid)
    }
}

module.exports = { sendPush, notifyMessage, notifyCall }
