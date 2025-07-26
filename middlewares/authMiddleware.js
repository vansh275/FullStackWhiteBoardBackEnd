const jwt = require("jsonwebtoken");
require('dotenv').config;
const SECRET_KEY = process.env.SECRET_KEY; // Replace with a secure key

exports.authMiddleware = (req, res, next) => {
    const token = req.header("Authorization");

    if (!token) return res.status(401).json({ error: "Access Denied: No Token" });

    try {
        const decoded = jwt.verify(token.replace("Bearer ", ""), SECRET_KEY);
        req.userId = decoded.userId;
        next();
    } catch (error) {
        res.status(401).json({ error: "Invalid Token" });
    }
};
