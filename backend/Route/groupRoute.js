const express = require("express");
const groupController = require("../conttroller/groupController");
const verifyJWT = require("../middleware/verifyJWT");

const GroupRouter = express.Router();

GroupRouter.post("/create", verifyJWT, groupController.CreateGroup);

module.exports = GroupRouter;