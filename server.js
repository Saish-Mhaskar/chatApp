const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

const bannedWords = ["spam", "badword", "hack"];

const RATE_LIMIT = 5;          // max messages
const RATE_INTERVAL = 5000;    // per 5 seconds
const MUTE_DURATION = 10000;   // 10 sec mute

const userActivity = {};

io.on("connection", (socket) => {

  socket.on("join", (username) => {
    socket.username = username;
    userActivity[socket.id] = {
      timestamps: [],
      mutedUntil: null
    };
    socket.broadcast.emit("user-joined", username);
  });

  socket.on("chat-message", (message) => {
    if (!socket.username) return;

    const activity = userActivity[socket.id];
    const now = Date.now();

    // Check if muted
    if (activity.mutedUntil && now < activity.mutedUntil) {
      socket.emit("moderation-warning", "You are muted for spamming.");
      return;
    }

    // Clean old timestamps
    activity.timestamps = activity.timestamps.filter(
      (time) => now - time < RATE_INTERVAL
    );

    // Add current timestamp
    activity.timestamps.push(now);

    // Rate limit check
    if (activity.timestamps.length > RATE_LIMIT) {
      activity.mutedUntil = now + MUTE_DURATION;
      activity.timestamps = [];
      socket.emit("moderation-warning", "You are temporarily muted for 10 seconds due to spam.");
      return;
    }

    // Prohibited word check
    const lower = message.toLowerCase();
    const containsBanned = bannedWords.some(word => lower.includes(word));

    if (containsBanned) {
      socket.emit("moderation-warning", "Message contains prohibited content.");
      return;
    }

    // If valid → broadcast
    socket.broadcast.emit("chat-message", {
      username: socket.username,
      message: message
    });
  });

  socket.on("typing", () => {
    socket.broadcast.emit("typing", socket.username);
  });

  socket.on("stop-typing", () => {
    socket.broadcast.emit("stop-typing");
  });

  socket.on("disconnect", () => {
    if (socket.username) {
      socket.broadcast.emit("user-left", socket.username);
    }
    delete userActivity[socket.id];
  });
});

server.listen(3000, () => {
  console.log("Server running at http://localhost:3000");
});
