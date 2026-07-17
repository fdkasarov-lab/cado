const express = require('express');
const router = express.Router();
const multer = require('multer');
const User = require('../model/user');
const FCM = require('../../firebase-service');
const { ensureAuthenticated } = require('./authMiddleware');

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

const MAX_NAME_LEN = 20;
const MAX_ABOUT_LEN = 300;

// ── Multer config (memory storage — files uploaded to Firebase Storage) ─
const upload = multer({
    storage: multer.memoryStorage(),
    fileFilter: (req, file, cb) => {
        const ext = (file.originalname || '').toLowerCase();
        if (!ext.endsWith('.png') && !ext.endsWith('.jpg') && !ext.endsWith('.jpeg')) {
            return cb(new Error('Only Images Allowed'));
        }
        cb(null, true);
    },
    limits: { fileSize: 10000000 } // 10MB
});

function genAvatarFilename(originalname) {
    const ext = originalname.includes('.') ? originalname.split('.').pop() : 'jpg'
    return 'avatar-' + Date.now() + '.' + ext
}

function trimOrEmpty(value) {
    return typeof value === 'string' ? value.trim() : '';
}

// ── GET /profile — own profile ───────────────────────────────────────────
router.get('/', ensureAuthenticated, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password');
        if (!user) return res.redirect('/login');
        res.render('profile', {
            user,
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
            return res.redirect('/profile/edit?error=' + encodeURIComponent('First and last name are required.'));
        }

        const existing = await User.findById(userId);
        if (!existing) {
            return res.status(404).send('User not found');
        }

        const update = { firstName, lastName, about };
        const removeAvatarRequested = req.body.removeAvatar === 'on' || req.body.removeAvatar === 'true';

        if (req.file) {
            const filename = genAvatarFilename(req.file.originalname)
            const url = await FCM.uploadFile(req.file.buffer, filename, req.file.mimetype)
            update.avatar = url
        } else if (removeAvatarRequested && existing.avatar) {
            update.avatar = null;
        }

        const updated = await User.findByIdAndUpdate(userId, update, { new: true, runValidators: true }).select('-password');
        if (!updated) return res.status(404).send('User not found');

        res.redirect('/profile?success=' + encodeURIComponent('Profile updated.'));
    } catch (err) {
        console.error(err);
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

// ── GET /profile/:username — view any user's profile ────────────────────
// Declared LAST so it doesn't swallow /edit, /password, /delete, /api/*.
router.get('/:username', ensureAuthenticated, async (req, res) => {
    try {
        const profileUser = await User.findOne({ username: req.params.username }).select('-password');
        if (!profileUser) return res.status(404).render('error404', { message: 'User not found' });
        const isOwn = profileUser._id.equals(req.user.id);
        if (isOwn) return res.redirect('/profile'); // keep a single canonical URL for "my own" profile
        res.render('viewProfile', { profileUser, isOwn });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server error');
    }
});

module.exports = router;
