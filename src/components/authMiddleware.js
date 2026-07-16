const Jwt = require('./jwt');

function ensureAuthenticated(req, res, next) {
    const token = req.cookies.jwt;
    if (!token) {
        return res.redirect('/login');
    }
    try {
        const decoded = Jwt.verify(token);
        req.user = decoded; // attach decoded payload (id, username, etc.)
        next();
    } catch (err) {
        // invalid or expired token
        res.clearCookie('jwt');
        return res.redirect('/login');
    }
}

module.exports = { ensureAuthenticated };