const { getChannel } = require("../config/RabbitMQ");
const messagedb = require("../../schema/messageSchema");

const updateDeliveryStatus = async () => {
  console.log("Updating message status started");
  const channel = await getChannel();
  await channel.assertQueue("updateDeliveryStatus", { durable: true });

  channel.consume("updateDeliveryStatus", async (msg) => {
    if (!msg) return;

    try {
      const { ids } = JSON.parse(msg.content.toString());

      if (!Array.isArray(ids) || ids.length === 0) {
        channel.ack(msg);
        return;
      }

      await messagedb.updateMany(
        { _id: { $in: ids } },
        { $set: { status: "delivered" } },
      );

      console.log("done updating message status for", ids.length, "messages");
      channel.ack(msg);
    } catch (error) {
      const isConnectionIssue =
        error.name === "MongooseServerSelectionError" ||
        error.name === "MongoNetworkError";

      console.log("error updating delivery status:", error.name, error.message);

      // requeue on connection issues (transient), discard otherwise
      channel.nack(msg, false, isConnectionIssue);
    }
  });
};

module.exports = updateDeliveryStatus;