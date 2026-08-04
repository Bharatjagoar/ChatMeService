const express = require("express");
const UserController = require("../conttroller/usercontroller");
// const MessageController = require("../conttroller/messagesController")
const Router = express.Router();
const passport = require("passport");
const messagesController = require("../conttroller/messagesController");
const redis = require("../config/redis");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const verifyJWT = require("../middleware/verifyJWT");

Router.get("/Create", (req, res) => {
  console.log("hello world ");
  res.status(200).send("hello wrold");
});
Router.post("/createUser", UserController.CreateUser);
Router.post("/checkUserName", UserController.checkUserName);
Router.post("/SearchString", UserController.Searchstring);
Router.get("/LoadConversation/:id", messagesController.Readmessage);
Router.get("/getMessages/:ChatId", messagesController.ReadConvo);
Router.post("/markAsRead/:chatId", verifyJWT, messagesController.MarkAsRead);

Router.get("/me", verifyJWT, (req, res) => {
  res.json({ userId: req.user.id, UserName: req.user.UserName });
});
Router.post(
  "/login",
  passport.authenticate("local", { session: false }),
  (req, res) => {
    // console.log("this is req.user :: ", req.user);
    const token = jwt.sign(
      { id: req.user.id, email: req.user.emailid, UserName: req.user.UserName },
      process.env.JWT_SECRET,
      { expiresIn: "7d" },
    );

    res
      .cookie("token", token, {
        httpOnly: true,
        sameSite: "lax",
        secure: false,
      })
      .status(200)
      .json({ userId: req.user.id, UserName: req.user.UserName });
  },
);

Router.get("/test", (req, res) => {
  // console.log("from test", req.isAuthenticated(),req.user)

  res.status(200).send({
    message: "successful",
    data: req.isAuthenticated(),
    user: req?.user?.id,
  });
});
Router.post("/logout", verifyJWT, async (req, res) => {
  const userId = req.user.id; // Safely extracted because of verifyJWT

  try {
    if (userId) {
      await redis.del(`socket:${userId}`);
    }

    // Architectural requirement: Blacklist the token here.
    // Store the current token in Redis with an expiration matching its remaining TTL.
    // Update verifyJWT to reject tokens found in this Redis blacklist.
  } catch (redisErr) {
    console.error("Redis cleanup failed:", redisErr);
    // Proceed to clear the cookie even if Redis fails, to ensure the client is logged out locally.
  }

  res
    .clearCookie("token", {
      httpOnly: true,
      sameSite: "lax",
      secure: false, // Must be true in production
    })
    .status(200)
    .send({ message: "Successfully logged out", data: false });
});
module.exports = Router;
