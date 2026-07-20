const { getChannel } = require("../config/RabbitMQ");
const Message = require("../../schema/messageSchema");
const mongoose = require("mongoose");

const fetchAndDeliver = async (channel, userid, replyTo, message) => {
  const messages = await Message.find({
    recieverID: new mongoose.Types.ObjectId(userid),
    status: "sent",
  })
    .sort({ createdAt: 1 })
    .limit(100);

  channel.sendToQueue(
    replyTo,
    Buffer.from(JSON.stringify({ error: false, messages })),
  );
  channel.ack(message);
};

const isConnectionIssue = (error) =>
  error.name === "MongooseServerSelectionError" ||
  error.name === "MongoNetworkError";

const MarkDelivery = async () => {
  console.log("Marking deliveries");
  const channel = await getChannel();
  channel.assertQueue("markdeliver", { durable: true });

  channel.consume("markdeliver", async (message) => {
    if (!message) return;
    const { userid, replyTo } = JSON.parse(message.content.toString());

    if (!mongoose.Types.ObjectId.isValid(userid)) {
      console.log("invalid userid, discarding:", userid);

      channel.sendToQueue(
        replyTo,
        Buffer.from(JSON.stringify({ error: false, messages: [] })),
      );
      channel.nack(message, false, false);
      return;
    }

    try {
      await fetchAndDeliver(channel, userid, replyTo, message);
    } catch (error) {
      console.log("error in marking delivery:", error.name, error.message);

      if (!isConnectionIssue(error)) {
        channel.sendToQueue(
          replyTo,
          Buffer.from(JSON.stringify({ error: true, messages: [] })),
        );
        channel.nack(message, false, false);
        return;
      }

      const deadline = Date.now() + 10000;
      let success = false;

      while (Date.now() < deadline && !success) {
        await new Promise((r) => setTimeout(r, 1000));
        try {
          await fetchAndDeliver(channel, userid, replyTo, message);
          success = true;
        } catch (retryError) {
          console.log("retry failed:", retryError.name);

          if (!isConnectionIssue(retryError)) {
            channel.sendToQueue(
              replyTo,
              Buffer.from(JSON.stringify({ error: true, messages: [] })),
            );
            channel.nack(message, false, false);
            return;
          }
        }
      }

      if (!success) {
        console.log("gave up after 10s outage for user:", userid);
        channel.sendToQueue(
          replyTo,
          Buffer.from(JSON.stringify({ error: true, messages: [] })),
        );
        channel.nack(message, false, false);
      }
    }
  });
};

module.exports = MarkDelivery;