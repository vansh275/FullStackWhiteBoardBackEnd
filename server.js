const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();
const connectToDB = require('./config/db');
const { Server } = require("socket.io");
const http = require("http");
const Canvas = require("./models/canvasModel");
const jwt = require("jsonwebtoken");
const SECRET_KEY = process.env.SECRET_KEY;

const userRoutes = require("./routes/userRoutes");
const canvasRoutes = require("./routes/canvasRoutes");
const CheckStatusRoutes = require("./routes/CheckStatusRoutes");
const app = express();

// CORS middleware
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE"],
}));

// Other middleware
app.use(express.json());

// Routes
app.use("/api/users", userRoutes);
app.use("/api/canvas", canvasRoutes);
app.use("/api/check", CheckStatusRoutes);

// Connect to MongoDB
connectToDB();

// Create HTTP server
const server = http.createServer(app);

// Initialize Socket.IO server
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

let canvasData = {};

io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);

  socket.on("joinCanvas", async ({ canvasId }) => {
    try {
      const authHeader = socket.handshake.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        console.log("No token provided by user:", socket.id);
        socket.emit("unauthorized", { message: "Access Denied: No Token" });
        return;
      }

      const token = authHeader.split(" ")[1];
      const decoded = jwt.verify(token, SECRET_KEY);
      const userId = decoded.userId;

      const canvas = await Canvas.findById(canvasId);
      if (!canvas || (String(canvas.owner) !== String(userId) && !canvas.shared.includes(userId))) {
        console.log("Unauthorized access attempt by user:", userId, "on canvas:", canvasId);
        socket.emit("unauthorized", { message: "You are not authorized to join this canvas." });
        return;
      }

      socket.join(canvasId);

      // Send the latest data from memory if available, otherwise from DB
      if (canvasData[canvasId]) {
        socket.emit("loadCanvas", canvasData[canvasId]);
      } else {
        socket.emit("loadCanvas", canvas.elements);
      }
    } catch (error) {
      console.error("Error joining canvas:", error);
      if (error instanceof jwt.JsonWebTokenError) {
        socket.emit("unauthorized", { message: "Invalid or expired token." });
      } else {
        socket.emit("error", { message: "An error occurred while joining the canvas." });
      }
    }
  });

  socket.on("drawingUpdate", async ({ canvasId, elements }) => {
    try {
      // Update in-memory cache
      canvasData[canvasId] = elements;

      // Broadcast to other clients in the room
      socket.to(canvasId).emit("receiveDrawingUpdate", elements);

      // Persist to database
      const canvas = await Canvas.findById(canvasId);
      if (canvas) {
        await Canvas.findByIdAndUpdate(canvasId, { elements }, { new: true, useFindAndModify: false });
      }
    } catch (error) {
      console.error("Error updating drawing:", error);
    }
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));