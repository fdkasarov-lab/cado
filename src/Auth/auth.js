const User = require("../model/user")
const Jwt = require('../components/jwt')
const bcrypt = require("bcryptjs")


module.exports ={
    register:  async (req, res, next) => {
        const username = String(req.body.username || '').trim().toLowerCase()
        const pin = String(req.body.pin || '').trim()
        const password = String(req.body.password || '')

        if (!username || !pin || !password) {
            return res.status(400).json({ message: "Username, pin and password are required" })
        }
        if (pin.length < 4 || password.length < 6) {
            return res.status(400).json({ message: "Pin must be at least 4 characters and password at least 6 characters" })
        }
        try {
            const hash = await bcrypt.hash(password, 10);
            const user = await User.create({
                username,
                pin,
                password: hash,
            });
            let token = Jwt.create(user._id, user.username)
            res.cookie("jwt", token, {
                httpOnly: true,
                sameSite: "lax",
            });
            return res.status(201).json({
                message: "User successfully created",
                token: token,
                userId:user._id,
                username:user.username
            });
        } catch (error) {
            return res.status(400).json({
                message: "User not successful created",
                error: error.code === 11000 ? "User already exists" : error.message,
            });
        }
    },
    login: async (req, res, next) => {
        const username = String(req.body.username || '').trim().toLowerCase()
        const password = String(req.body.password || '')

        if (!username || !password) {
            return res.status(400).json({
                message: "Username and password are required",
            })
        }
        try {
            const user = await User.findOne({ username})
            if (!user) {
                return res.status(401).json({
                    message: "Login not successful",
                    error: "User not found",
                })
            }

            const result = await bcrypt.compare(password, user.password)
            if (!result) {
                return res.status(401).json({ message: "Login not successful", error: "Wrong password" });
            }

            let token = Jwt.create(user._id, user.username)
            res.cookie("jwt", token, {
                httpOnly: true,
                sameSite: "lax",
            });
            return res.status(200).json({
                message: "User successfully logged in",
                token: token,
                userId:user._id,
                username:user.username
            });
        } catch (error) {
            return res.status(400).json({
                message: "An error occurred",
                error: error.message,
            })
        }
    },
    getUsers:async (req, res, next) => {
        await User.find({})
            .then(users => {
                const userFunction = users.map(user => {
                    const container = {}
                    container.username = user.username
                    container.role = user.role
                    return container
                })
                res.status(200).json({ user: userFunction })
            })
            .catch(err =>
                res.status(401).json({ message: "Not successful", error: err.message })
            )
    },
    updateUser: async (req, res, next)=> {
        const {firstName, lastName, avatar, about} = req.body;
        let token = req.get('token')
        if (!token) {
            return res.status(401).json({ message: "Token is required" });
        }
        let tokenData
        try {
            tokenData = Jwt.verify(token)
        } catch (error) {
            return res.status(401).json({ message: "Invalid token" });
        }
        if (!firstName || !lastName || !avatar || !tokenData.id) {
            return res.status(400).json({ message: "firstName, lastName and avatar are required" });
        }

        try {
            let Updated = await User.findByIdAndUpdate(
                tokenData.id,
                { firstName, lastName, avatar, about },
                { new: true, runValidators: true }
            );

            if (!Updated && tokenData.username) {
                Updated = await User.findOneAndUpdate(
                    { username: tokenData.username },
                    { firstName, lastName, avatar, about },
                    { new: true, runValidators: true }
                );
            }

            if (!Updated) {
                return res.status(404).json({ message: "User not found" });
            }

            return res.status(200).json({ message: "Update successful", Updated });
        } catch (error) {
            return res.status(400).json({ message: "An error occurred", error: error.message });
        }
    }
}
