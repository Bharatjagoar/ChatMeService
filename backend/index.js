require("dotenv").config();
const express = require("express");
const app = express();
const http = require("http");
// const bodyParser = require("body-parser");
const socketio = require("socket.io");
const bodyParser = require("body-parser");
const cors = require("cors");
const port = process.env.PORT || 5000;
const cookieParser = require("cookie-parser");
const path = require("path");
const passport = require("passport");
const passportConfig = require("./config/passportConfig");
const mongodb = require("./config/mongoose");
const createQueue = require("./Services/Messaages");
const { Rabbit_MQ_connection } = require("./config/RabbitMQ");
const verifyJWT = require("./middleware/verifyJWT");
const notifySenderDelivered = require("./socket/notifySenderDelivered");
const notifySenderOfRead = require("./socket/notifySenderRead");
// console.log(process.env.keys)

app.use(
  cors({
    origin: "http://localhost:3000", // Replace with your frontend's origin
    methods: ["GET", "POST"], // Allow specific HTTP methods
    credentials: true, // Allow credentials (cookies, authorization headers, etc.) to be sent
  }),
);
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());

passportConfig.initailizingPassport(passport);
app.use(passport.initialize());
app.use(cookieParser());

// Create the HTTP server and attach Socket.IO
const server = http.createServer(app);
const io = socketio(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// Define a route to test the server
// app.get("/", (req, res) => {
//     console.log("Hello");
//     res.status(200).send();
// });

// const authusers = io.fe
// Socket.IO connection handler
io.on("connection", (socket) => {
  console.log("NEW SOCKET CONNECTED", socket.id);
  require("./socket/socket")(socket, io);
});

if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(__dirname, "dist")));
  app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "dist", "index.html"));
  });
}

app.get("/me", verifyJWT, (req, res) => {
  res.json({ userId: req.user.id, UserName: req.user.UserName });
});
app.use("/", require("./Route/index"));
// Start the server
server.listen(port, async () => {
  console.log(`Server running on port ${port}`);
  // await createQueue();
  await Rabbit_MQ_connection();
  await notifySenderDelivered(io);
  await notifySenderOfRead(io);
});

// Export the io instance to use in other modules
module.exports = io;
