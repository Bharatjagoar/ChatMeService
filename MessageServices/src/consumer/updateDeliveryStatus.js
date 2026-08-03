const { getChannel } = require("../config/RabbitMQ");
const messagedb = require("../../schema/messageSchema");

// Does the actual work: mark messages delivered in Mongo, then queue a
// notify message per affected sender. Called from both the initial try
// and the retry loop so the logic only exists once.
async function applyDeliveryUpdate(ids, clientIdByMongoId, channel) {
  await messagedb.updateMany(
    { _id: { $in: ids } },
    { $set: { status: "delivered" } },
  );

  const deliveredMessages = await messagedb.find(
    { _id: { $in: ids } },
    { senderId: 1, chatId: 1 },
  );

  const bySender = {};
  for (const m of deliveredMessages) {
    if (!m.senderId) {
      console.log("BUG: delivered message missing senderId:", m._id.toString());
      continue;
    }
    const senderId = m.senderId.toString();
    const clientMessageId = clientIdByMongoId.get(m._id.toString());
    if (!bySender[senderId])
      bySender[senderId] = { chatId: m.chatId, messageIds: [] };
    bySender[senderId].messageIds.push(clientMessageId);
  }

  for (const [senderId, { chatId, messageIds }] of Object.entries(bySender)) {
    channel.sendToQueue(
      "notifySenderDelivered",
      Buffer.from(JSON.stringify({ senderId, chatId, messageIds })),
      { persistent: true },
    );
  }

  return deliveredMessages.length;
}

const updateDeliveryStatus = async () => {
  console.log("Updating message status started");
  const channel = await getChannel();
  await channel.assertQueue("updateDeliveryStatus", { durable: true });
  await channel.assertQueue("notifySenderDelivered", { durable: true });
  channel.prefetch(5);
  channel.consume("updateDeliveryStatus", async (msg) => {
    if (!msg) return;

    const { deliveries } = JSON.parse(msg.content.toString());

    if (!Array.isArray(deliveries) || deliveries.length === 0) {
      channel.ack(msg);
      return;
    }

    const ids = deliveries.map((d) => d.id);
    const clientIdByMongoId = new Map(
      deliveries.map((d) => [d.id, d.clientMessageId]),
    );

    try {
      // Option A: update first, so we never notify about a change that didn't persist
      const count = await applyDeliveryUpdate(ids, clientIdByMongoId, channel);
      console.log("done updating message status for", count, "messages");
      channel.ack(msg);
    } catch (error) {
      const isConnectionIssue =
        error.name === "MongooseServerSelectionError" ||
        error.name === "MongoNetworkError";

      console.log("error updating delivery status:", error.name, error.message);

      if (!isConnectionIssue) {
        channel.nack(msg, false, false);
        return;
      }

      const deadline = Date.now() + 10000;
      let success = false;

      while (Date.now() < deadline && !success) {
        await new Promise((r) => setTimeout(r, 1000));
        try {
          const count = await applyDeliveryUpdate(
            ids,
            clientIdByMongoId,
            channel,
          );
          console.log(
            "done updating message status for",
            count,
            "messages (after retry)",
          );
          channel.ack(msg);
          success = true;
        } catch (retryError) {
          const stillConnectionIssue =
            retryError.name === "MongooseServerSelectionError" ||
            retryError.name === "MongoNetworkError";

          console.log("retry failed:", retryError.name);

          if (!stillConnectionIssue) {
            channel.nack(msg, false, false);
            return;
          }
        }
      }

      if (!success) {
        console.log(
          "gave up after 10s outage, dropping (will reconcile on next reconnect)",
        );
        channel.nack(msg, false, false);
      }
    }
  });
};

module.exports = updateDeliveryStatus;
