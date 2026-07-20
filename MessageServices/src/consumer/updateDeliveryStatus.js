const { getChannel } = require("../config/RabbitMQ");
const messagedb = require("../../schema/messageSchema");

const updateDeliveryStatus = async () => {
  console.log("Updating message status started");
  const channel = await getChannel();
  await channel.assertQueue("updateDeliveryStatus", { durable: true });
  await channel.assertQueue("notifySenderDelivered", { durable: true });

  channel.consume("updateDeliveryStatus", async (msg) => {
    if (!msg) return;

    try {
      const { ids } = JSON.parse(msg.content.toString());

      if (!Array.isArray(ids) || ids.length === 0) {
        channel.ack(msg);
        return;
      }

      // Option A: update first, so we never notify about a change that didn't persist
      await messagedb.updateMany(
        { _id: { $in: ids } },
        { $set: { status: "delivered" } },
      );

      console.log("done updating message status for", ids.length, "messages");

      // fetch senders for the messages we just marked delivered
      const deliveredMessages = await messagedb.find(
        { _id: { $in: ids } },
        { senderID: 1 },
      );

      // group message IDs by sender — one notification per sender, not per message
      const bySender = {};
      for (const m of deliveredMessages) {
        if (!m.senderID) {
          console.log(
            "BUG: delivered message missing senderID:",
            m._id.toString(),
          );
          continue;
        }
        const senderId = m.senderID.toString();
        if (!bySender[senderId]) bySender[senderId] = [];
        bySender[senderId].push(m._id.toString());
      }

      for (const [senderId, messageIds] of Object.entries(bySender)) {
        channel.sendToQueue(
          "notifySenderDelivered",
          Buffer.from(JSON.stringify({ senderId, messageIds })),
          { persistent: true },
        );
      }

      channel.ack(msg);
    } catch (error) {
      const isConnectionIssue =
        error.name === "MongooseServerSelectionError" ||
        error.name === "MongoNetworkError";

      console.log("error updating delivery status:", error.name, error.message);

      channel.nack(msg, false, isConnectionIssue);
    }
  });
};

module.exports = updateDeliveryStatus;
