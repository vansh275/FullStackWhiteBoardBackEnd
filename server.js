const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors"); // Ensure 'cors' package is installed: npm install cors
require("dotenv").config();
const connectToDB = require('./config/db');
const { Server } = require("socket.io");
const http = require("http");
const Canvas = require("./models/canvasModel");
const jwt = require("jsonwebtoken");
const SECRET_KEY = process.env.SECRET_KEY; // Ensure SECRET_KEY is set in Render's environment variables

const userRoutes = require("./routes/userRoutes");
const canvasRoutes = require("./routes/canvasRoutes");

const app = express();

// --- IMPORTANT: Apply Express CORS middleware globally before any other middleware or routes ---
// This ensures that all incoming HTTP requests, including Socket.IO's initial polling
// preflight (OPTIONS request), are handled with the correct CORS headers.
app.use(cors({
  origin: ["http://localhost:3000", "https://whiteboard-tutorial-eight.vercel.app"],
  methods: ["GET", "POST", "PUT", "DELETE"], // Include all methods your API uses
  credentials: true // Crucial if your frontend sends cookies or Authorization headers
}));

// Other middleware
app.use(express.json());

// Routes
app.use("/api/users", userRoutes);
app.use("/api/canvas", canvasRoutes);

// Connect to MongoDB
connectToDB();

// Create HTTP server
const server = http.createServer(app);

// Initialize Socket.IO server
// Its CORS configuration should align with the Express CORS middleware.
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"], // Socket.IO typically only needs GET/POST for polling
    credentials: true, // Keep this here as it's crucial for Socket.IO with auth headers
  },
});

let canvasData = {};
let i = 0; // Consider removing this 'i' variable if it's not used meaningfully
io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);

  socket.on("joinCanvas", async ({ canvasId }) => {
    console.log("Joining canvas:", canvasId);
    try {
      const authHeader = socket.handshake.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        console.log("No token provided.");
        // Removed setTimeout. Use a custom event or message box for errors.
        socket.emit("unauthorized", { message: "Access Denied: No Token" });
        return;
      }

      const token = authHeader.split(" ")[1];
      const decoded = jwt.verify(token, SECRET_KEY);
      const userId = decoded.userId;
      console.log("User ID:", userId);

      const canvas = await Canvas.findById(canvasId);
      console.log(canvas);
      if (!canvas || (String(canvas.owner) !== String(userId) && !canvas.shared.includes(userId))) {
        console.log("Unauthorized access.");
        // Removed setTimeout.
        socket.emit("unauthorized", { message: "You are not authorized to join this canvas." });
        return;
      }

      socket.join(canvasId);
      console.log(`User ${socket.id} joined canvas ${canvasId}`);

      if (canvasData[canvasId]) {
        console.log(canvasData);
        socket.emit("loadCanvas", canvasData[canvasId]);
      } else {
        socket.emit("loadCanvas", canvas.elements);
      }
    } catch (error) {
      console.error("Error joining canvas:", error);
      // Differentiate between JWT errors and other errors
      if (error instanceof jwt.JsonWebTokenError) {
        socket.emit("unauthorized", { message: "Invalid or expired token." }); // Using 'unauthorized' as per your original code
      } else {
        socket.emit("error", { message: "An error occurred while joining the canvas." });
      }
    }
  });

  socket.on("drawingUpdate", async ({ canvasId, elements }) => {
    try {
      canvasData[canvasId] = elements;

      socket.to(canvasId).emit("receiveDrawingUpdate", elements);

      const canvas = await Canvas.findById(canvasId);
      if (canvas) {
        // console.log('updating canvas... ', i++) // If 'i' is just a counter, remove it
        await Canvas.findByIdAndUpdate(canvasId, { elements }, { new: true, useFindAndModify: false });
      }
    } catch (error) {
      console.error("Error updating drawing:", error);
      // Consider emitting an error back to the client if the update fails
    }
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});

// Use environment variable PORT or default to 5000 for local development
const PORT = process.env.PORT || 5000; // This line should remain as is
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));