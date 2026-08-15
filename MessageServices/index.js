require("dotenv").config();
const mongoose = require("./src/config/mongoose");
// const UserModel = require("./src/schema/messageSchema")//
const MessageSent = require("./src/consumer/sendmessage");
const { Rabbit_MQ_connection } = require("./src/config/RabbitMQ");
const ReadConversations = require("./src/consumer/readConversation");
const ReadConvo = require("./src/consumer/checkConvo");
const MarkDelivery = require("./src/consumer/MarkDelivery");
const CreateGroup = require("./src/consumer/CreateGroup");
const updateDeliveryStatus = require("./src/consumer/updateDeliveryStatus");
const updateReadStatus = require("./src/consumer/updateReadStatus");
const GetUserGroups = require("./src/consumer/GetUserGroups");

(async () => {
  try {
    console.log("hello from index.js from message services");
    await Rabbit_MQ_connection();
    await MarkDelivery();
    await CreateGroup();
    await MessageSent();
    await ReadConversations();
    await ReadConvo();
    await GetUserGroups();
    await updateDeliveryStatus();
    await updateReadStatus();
  } catch (error) {
    console.log(error);
  }
})();
