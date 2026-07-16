const express = require("express")
const { register,login,updateUser } = require("./auth")
const router = express.Router()
router.route("/register").post(register)
router.route("/login").post(login);
router.route("/update").post(updateUser);
module.exports = router