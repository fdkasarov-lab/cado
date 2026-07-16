// ─────────────────────────────────────────────────────────────────────────
// NOTE FOR THE DEVELOPER — this file was NOT rewritten to match the rest of
// the profile feature, because I can't verify what (if anything) actually
// wires it into the running app. Flagging the issues found instead of
// guessing at a fix:
//
// 1. `require('database.js')` will throw at startup — there is no npm
//    package named "database.js" and no local ./database.js file was
//    provided. If this module is ever required elsewhere, the app crashes.
// 2. This file uses raw `mysql`/MySQL, while profileRoutes.js (and the
//    views it renders) use a Mongoose `User` model — i.e. two different
//    databases for user data. That's very likely a leftover from an
//    earlier version of the app before it moved to MongoDB.
// 3. The `db` connection here is created but never used, and the router
//    exports zero routes — this file currently does nothing except
//    (attempt to) open a second, unused database connection.
// 4. Hardcoded credentials (`user: "root", password: ""`) should never
//    ship even in development — use environment variables instead.
//
// If this file is genuinely unused, the safest fix is to delete it and
// remove any `require(...)` of it from your main server file. If it *is*
// still needed for something else in the app, let me know what that is
// and I can rewrite it properly instead of guessing.
// ─────────────────────────────────────────────────────────────────────────

var express = require('express')
const mysql = require("mysql");
var router = express.Router()

const db = mysql.createConnection({
    host: process.env.MYSQL_HOST || "localhost",
    user: process.env.MYSQL_USER || "root",
    password: process.env.MYSQL_PASSWORD || "",
    database: process.env.MYSQL_DATABASE || "nodemysql",
});

module.exports = router
