const { getChannel } = require("../config/RabbitMQ");
const messagedb = require("../../schema/messageSchema");
const mongoose = require("mongoose");

const MAX_RETRIES = 3;

const updateDeliveryStatus = async () => {
  console.log("Updating message status started");
  const channel = await getChannel();
  await channel.assertQueue("updateDeliveryStatus", { durable: true });
  await channel.assertQueue("updateDeliveryStatus-dlq", { durable: true });
  channel.prefetch(1);

  channel.consume("updateDeliveryStatus", async (msg) => {
    if (!msg) return;

    let parsed;
    try {
      parsed = JSON.parse(msg.content.toString());
    } catch (parseErr) {
      console.log("unparseable message, sending to DLQ:", parseErr);
      channel.sendToQueue("updateDeliveryStatus-dlq", msg.content);
      channel.ack(msg);
      return;
    }

    const { ids, retryCount = 0 } = parsed;

    if (!Array.isArray(ids) || ids.length === 0) {
      channel.ack(msg);
      return;
    }

    try {
      const objectIds = ids.map((id) => new mongoose.Types.ObjectId(id)); // #2, see below
      await messagedb.updateMany(
        { _id: { $in: objectIds } },
        { $set: { status: "delivered" } }
      );
      console.log("done updating message status");
      channel.ack(msg);
    } catch (error) {
      console.log("error updating delivery status:", error);
      const nextRetryCount = retryCount + 1;

      if (nextRetryCount >= MAX_RETRIES) {
        channel.sendToQueue(
          "updateDeliveryStatus-dlq",
          Buffer.from(JSON.stringify({ ids, retryCount: nextRetryCount }))
        );
      } else {
        channel.sendToQueue(
          "updateDeliveryStatus",
          Buffer.from(JSON.stringify({ ids, retryCount: nextRetryCount }))
        );
      }
      channel.ack(msg);
    }
  });
};

module.exports = updateDeliveryStatus;