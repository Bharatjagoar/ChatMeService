const { getChannel } = require("../config/RabbitMQ");
const Message = require("../../schema/messageSchema");
const mongoose = require("mongoose");

const MAX_RETRIES = 3;

const MarkDelivery = async () => {
  console.log("Marking deliveries");
  const channel = await getChannel();
  channel.assertQueue("markdeliver", { durable: true });
  channel.assertQueue("markdeliver-dlq", { durable: true });

  channel.prefetch(1);

  channel.consume("markdeliver", async (message) => {
    if (!message) return;

    let parsed;
    try {
      parsed = JSON.parse(message.content.toString());
    } catch (parseErr) {
      console.log("unparseable message, sending to DLQ:", parseErr);
      channel.sendToQueue("markdeliver-dlq", message.content);
      channel.ack(message);
      return;
    }

    const { userid, replyTo, correlationId, retryCount = 0 } = parsed;

    try {
      const messages = await Message.find({
        recieverID: new mongoose.Types.ObjectId(userid),
        status: "sent",
      })
        .sort({ createdAt: 1 })
        .limit(100)
        .lean();

      console.log("delivering offline messages for", userid);

      channel.sendToQueue(replyTo, Buffer.from(JSON.stringify(messages)), {
        correlationId,
      });

      channel.ack(message);
    } catch (error) {
      console.log("error in marking delivery:", error);

      const nextRetryCount = retryCount + 1;

      if (nextRetryCount >= MAX_RETRIES) {
        console.log(`giving up after ${nextRetryCount} retries, sending to DLQ`, userid);
        channel.sendToQueue(
          "markdeliver-dlq",
          Buffer.from(JSON.stringify({ userid, replyTo, correlationId, retryCount: nextRetryCount })),
        );
      } else {
        channel.sendToQueue(
          "markdeliver",
          Buffer.from(JSON.stringify({ userid, replyTo, correlationId, retryCount: nextRetryCount })),
          { correlationId },
        );
      }

      channel.ack(message);
    }
  });
};

module.exports = MarkDelivery;