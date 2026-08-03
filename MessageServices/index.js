require("dotenv").config();
const mongoose = require("./src/config/mongoose");
// const UserModel = require("./src/schema/messageSchema")//
const MessageSent = require("./src/consumer/sendmessage");
const { Rabbit_MQ_connection } = require("./src/config/RabbitMQ");
const ReadConversations = require("./src/consumer/readConversation");
const ReadConvo = require("./src/consumer/checkConvo");
const MarkDelivery = require("./src/consumer/MarkDelivery");
const updateDeliveryStatus = require("./src/consumer/updateDeliveryStatus");
const updateReadStatus = require("./src/consumer/updateReadStatus");

(async () => {
  try {
    console.log("hello from index.js from message services");
    await Rabbit_MQ_connection();
    await MarkDelivery();
    await MessageSent();
    await ReadConversations();
    await ReadConvo();
    await updateDeliveryStatus();
    await updateReadStatus();
  } catch (error) {
    console.log(error);
  }
})();
