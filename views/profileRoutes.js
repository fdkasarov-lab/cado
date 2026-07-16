const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const User = require('../src/model/user');
const Message = require('../src/model/message');
const { ensureAuthenticated } = require('../src/components/authMiddleware');

// NOTE (please verify against your actual auth setup):
// - This assumes bcrypt password hashes are stored on `user.password` and that
//   the library is `bcryptjs` (swap the require below to `bcrypt` if that's
//   what the rest of the app uses).
// - The "Logout" link on the profile pages points to `/logout`. Adjust it if
//   your passport logout route is named differently.
// - `user.createdAt` is only rendered if it exists (e.g. via mongoose
//   `{ timestamps: true }`). If your User schema doesn't have it, the "Joined"
//   row is simply skipped — nothing breaks.
let bcrypt;
try {
    bcrypt = require('bcryptjs');
} catch (e) {
    bcrypt = null; // password-change route will report a clear error instead of crashing
}

const UPLOAD_DIR = path.join('public', 'uploads');
const MAX_NAME_LEN = 20;
const MAX_ABOUT_LEN = 300;

// ── Multer config (same destination as before) ──────────────────────────
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, UPLOAD_DIR + '/');
    },
    filename: (req, file, cb) => {
        cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({
    storage,
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (ext !== '.png' && ext !== '.jpg' && ext !== '.jpeg') {
            return cb(new Error('Only Images Allowed'));
        }
        cb(null, true);
    },
    limits: { fileSize: 10000000 } // 10MB
});

// Deletes an old avatar file from disk. Never throws — a missing file is not
// a fatal error, it just means there was nothing to clean up.
function removeAvatarFile(filename) {
    if (!filename) return;
    const filePath = path.join(UPLOAD_DIR, filename);
    fs.unlink(filePath, (err) => {
        if (err && err.code !== 'ENOENT') {
            console.error('Failed to remove old avatar:', err);
        }
    });
}

function trimOrEmpty(value) {
    return typeof value === 'string' ? value.trim() : '';
}

// ── GET /profile — own profile ───────────────────────────────────────────
router.get('/', ensureAuthenticated, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password');
        if (!user) return res.redirect('/login');
        // Fetch contacts info
        const contactUsers = await User.find({ username: { $in: user.contacts || [] } })
            .select('username firstName lastName avatar isOnline')
            .lean();
        res.render('profile', {
            user,
            contactUsers,
            success: req.query.success || null,
            error: req.query.error || null
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server error');
    }
});

// ── GET /profile/edit — edit profile form ───────────────────────────────
// IMPORTANT: this must be declared BEFORE the `/:username` route below,
// otherwise Express matches "/edit" as `:username === "edit"` and this
// page becomes unreachable.
router.get('/edit', ensureAuthenticated, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password');
        if (!user) return res.redirect('/login');
        res.render('editProfile', {
            user,
            error: req.query.error || null,
            maxNameLen: MAX_NAME_LEN,
            maxAboutLen: MAX_ABOUT_LEN
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server error');
    }
});

// ── POST /profile/edit — handle form submission ─────────────────────────
router.post('/edit', ensureAuthenticated, upload.single('avatar'), async (req, res) => {
    try {
        const userId = req.user.id;
        const firstName = trimOrEmpty(req.body.firstName).slice(0, MAX_NAME_LEN);
        const lastName = trimOrEmpty(req.body.lastName).slice(0, MAX_NAME_LEN);
        const about = trimOrEmpty(req.body.about).slice(0, MAX_ABOUT_LEN);

        if (!firstName || !lastName) {
            if (req.file) removeAvatarFile(req.file.filename); // don't orphan the uploaded file
            return res.redirect('/profile/edit?error=' + encodeURIComponent('First and last name are required.'));
        }

        const existing = await User.findById(userId);
        if (!existing) {
            if (req.file) removeAvatarFile(req.file.filename);
            return res.status(404).send('User not found');
        }

        const update = { firstName, lastName, about };
        const removeAvatarRequested = req.body.removeAvatar === 'on' || req.body.removeAvatar === 'true';

        if (req.file) {
            update.avatar = req.file.filename; // store just filename
            removeAvatarFile(existing.avatar); // clean up the old file, it's no longer referenced
        } else if (removeAvatarRequested && existing.avatar) {
            removeAvatarFile(existing.avatar);
            update.avatar = null;
        }

        const updated = await User.findByIdAndUpdate(userId, update, { new: true, runValidators: true }).select('-password');
        if (!updated) return res.status(404).send('User not found');

        res.redirect('/profile?success=' + encodeURIComponent('Profile updated.'));
    } catch (err) {
        console.error(err);
        if (req.file) removeAvatarFile(req.file.filename);
        const message = err.message === 'Only Images Allowed'
            ? 'Only .png, .jpg or .jpeg images are allowed.'
            : 'Something went wrong updating your profile.';
        res.redirect('/profile/edit?error=' + encodeURIComponent(message));
    }
});

// ── GET /profile/password — change password form ────────────────────────
router.get('/password', ensureAuthenticated, (req, res) => {
    res.render('changePassword', { error: req.query.error || null, success: req.query.success || null });
});

// ── POST /profile/password — change password ────────────────────────────
router.post('/password', ensureAuthenticated, async (req, res) => {
    if (!bcrypt) {
        return res.redirect('/profile/password?error=' + encodeURIComponent('Password hashing library not available on the server.'));
    }
    try {
        const { currentPassword, newPassword, confirmPassword } = req.body;
        if (!currentPassword || !newPassword || !confirmPassword) {
            return res.redirect('/profile/password?error=' + encodeURIComponent('All fields are required.'));
        }
        if (newPassword.length < 8) {
            return res.redirect('/profile/password?error=' + encodeURIComponent('New password must be at least 8 characters.'));
        }
        if (newPassword !== confirmPassword) {
            return res.redirect('/profile/password?error=' + encodeURIComponent('New passwords do not match.'));
        }

        const user = await User.findById(req.user.id);
        if (!user) return res.redirect('/login');

        const matches = await bcrypt.compare(currentPassword, user.password);
        if (!matches) {
            return res.redirect('/profile/password?error=' + encodeURIComponent('Current password is incorrect.'));
        }

        const hashed = await bcrypt.hash(newPassword, 10);
        user.password = hashed;
        await user.save();

        res.redirect('/profile/password?success=' + encodeURIComponent('Password updated.'));
    } catch (err) {
        console.error(err);
        res.redirect('/profile/password?error=' + encodeURIComponent('Something went wrong changing your password.'));
    }
});

// ── POST /profile/delete — delete account ("danger zone") ───────────────
router.post('/delete', ensureAuthenticated, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) return res.redirect('/login');

        removeAvatarFile(user.avatar);
        await User.findByIdAndDelete(req.user.id);

        // Support both callback-style (passport < 0.6) and promise-style logout.
        if (req.logout) {
            if (req.logout.length >= 1) {
                req.logout((err) => {
                    if (err) console.error(err);
                    req.session ? req.session.destroy(() => res.redirect('/login')) : res.redirect('/login');
                });
                return;
            }
            req.logout();
        }
        req.session ? req.session.destroy(() => res.redirect('/login')) : res.redirect('/login');
    } catch (err) {
        console.error(err);
        res.status(500).send('Server error deleting account');
    }
});

// ── GET /profile/api/me — current user data as JSON ─────────────────────
router.get('/api/me', ensureAuthenticated, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password');
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json({
            username: user.username,
            firstName: user.firstName || null,
            lastName: user.lastName || null,
            about: user.about || null,
            avatar: user.avatar || null,
            isOnline: !!user.isOnline,
            lastSeen: user.lastSeen || null
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ── GET /profile/api/:username — small JSON endpoint ─────────────────────
// Kept intentionally minimal: only what the profile pages need. Useful if
// you later want to open the existing .profile-panel/.profile-hero markup
// as an in-app slide-up panel (via your own viewProfile()/Client.js) instead
// of a full page navigation, without duplicating server logic.
router.get('/api/:username', ensureAuthenticated, async (req, res) => {
    try {
        const profileUser = await User.findOne({ username: req.params.username }).select('-password');
        if (!profileUser) return res.status(404).json({ error: 'User not found' });
        res.json({
            username: profileUser.username,
            firstName: profileUser.firstName || null,
            lastName: profileUser.lastName || null,
            about: profileUser.about || null,
            avatar: profileUser.avatar || null,
            isOnline: !!profileUser.isOnline,
            lastSeen: profileUser.lastSeen || null,
            isOwn: profileUser._id.equals(req.user.id)
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ── POST /profile/contact/toggle — add/remove contact ────────────────────
router.post('/contact/toggle', ensureAuthenticated, async (req, res) => {
    try {
        const { username } = req.body;
        if (!username) return res.status(400).json({ error: 'Username required' });
        if (username === req.user.username) return res.status(400).json({ error: 'Cannot add yourself' });

        const me = await User.findById(req.user.id);
        if (!me) return res.status(404).json({ error: 'User not found' });

        const exists = me.contacts.includes(username);
        const update = exists
            ? { $pull: { contacts: username } }
            : { $addToSet: { contacts: username } };

        await User.findByIdAndUpdate(req.user.id, update);
        res.json({ added: !exists, username });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ── POST /profile/block/toggle — block/unblock user ─────────────────────
router.post('/block/toggle', ensureAuthenticated, async (req, res) => {
    try {
        const { username } = req.body;
        if (!username) return res.status(400).json({ error: 'Username required' });
        if (username === req.user.username) return res.status(400).json({ error: 'Cannot block yourself' });

        const me = await User.findById(req.user.id);
        if (!me) return res.status(404).json({ error: 'User not found' });

        const blocked = me.blockedUsers.includes(username);
        const update = blocked
            ? { $pull: { blockedUsers: username } }
            : { $addToSet: { blockedUsers: username } };

        await User.findByIdAndUpdate(req.user.id, update);
        res.json({ blocked: !blocked, username });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ── POST /profile/mute/toggle — mute/unmute chat notifications ──────────
router.post('/mute/toggle', ensureAuthenticated, async (req, res) => {
    try {
        const { chatId } = req.body;
        if (!chatId) return res.status(400).json({ error: 'Chat ID required' });

        const me = await User.findById(req.user.id);
        if (!me) return res.status(404).json({ error: 'User not found' });

        const muted = me.mutedChats.includes(chatId);
        const update = muted
            ? { $pull: { mutedChats: chatId } }
            : { $addToSet: { mutedChats: chatId } };

        await User.findByIdAndUpdate(req.user.id, update);
        res.json({ muted: !muted, chatId });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ── GET /profile/shared-media/:username — shared images in chat ─────────
router.get('/shared-media/:username', ensureAuthenticated, async (req, res) => {
    try {
        const myUsername = req.user.username;
        const otherUsername = req.params.username;

        const chatId1 = myUsername + '!@!@2!@!@' + otherUsername;
        const chatId2 = otherUsername + '!@!@2!@!@' + myUsername;

        const messages = await Message.find({
            chat_Id: { $in: [chatId1, chatId2] },
            files: { $exists: true, $not: { $size: 0 } }
        })
            .sort({ created_at: -1 })
            .limit(200)
            .select('files created_at message')
            .lean();

        // Flatten: one entry per file
        const media = [];
        messages.forEach(msg => {
            (msg.files || []).forEach(file => {
                media.push({
                    file,
                    date: msg.created_at,
                    caption: msg.message
                });
            });
        });

        res.json({ media, username: otherUsername });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ── GET /profile/status/:username — check if user is in contacts/blocked/muted ──
router.get('/status/:username', ensureAuthenticated, async (req, res) => {
    try {
        const me = await User.findById(req.user.id).select('contacts blockedUsers mutedChats');
        if (!me) return res.status(404).json({ error: 'User not found' });

        const myUsername = req.user.username;
        const otherUsername = req.params.username;
        const chatId1 = myUsername + '!@!@2!@!@' + otherUsername;
        const chatId2 = otherUsername + '!@!@2!@!@' + myUsername;

        res.json({
            isContact: me.contacts.includes(otherUsername),
            isBlocked: me.blockedUsers.includes(otherUsername),
            isMuted: me.mutedChats.includes(chatId1) || me.mutedChats.includes(chatId2)
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ── GET /profile/contacts — list my contacts ────────────────────────────
router.get('/contacts/list', ensureAuthenticated, async (req, res) => {
    try {
        const me = await User.findById(req.user.id).select('contacts');
        if (!me) return res.status(404).json({ error: 'User not found' });
        const users = await User.find({ username: { $in: me.contacts } })
            .select('username firstName lastName avatar isOnline')
            .lean();
        res.json({ contacts: users });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ── GET /profile/:username — view any user's profile ────────────────────
// Declared LAST so it doesn't swallow /edit, /password, /delete, /api/*.
router.get('/:username', ensureAuthenticated, async (req, res) => {
    try {
        const profileUser = await User.findOne({ username: req.params.username }).select('-password');
        if (!profileUser) return res.status(404).render('error404', { message: 'User not found' });
        const isOwn = profileUser._id.equals(req.user.id);
        if (isOwn) return res.redirect('/profile');

        // Check relationship status
        const me = await User.findById(req.user.id).select('contacts blockedUsers mutedChats');
        const myUsername = req.user.username;
        const chatId1 = myUsername + '!@!@2!@!@' + profileUser.username;
        const chatId2 = profileUser.username + '!@!@2!@!@' + myUsername;
        const isContact = me?.contacts.includes(profileUser.username) || false;
        const isBlocked = me?.blockedUsers.includes(profileUser.username) || false;
        const isMuted = me?.mutedChats.includes(chatId1) || me?.mutedChats.includes(chatId2) || false;

        res.render('viewProfile', { profileUser, isOwn, isContact, isBlocked, isMuted, currentUsername: myUsername });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server error');
    }
});

module.exports = router;
