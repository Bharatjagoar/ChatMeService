const { getChannel } = require("../config/RabbitMQ");
const messagedb = require("../../schema/messageSchema");

// Does the actual work: mark the chat's messages read in Mongo, then queue
// a notify message if anything actually changed. Called from both the
// initial try and the retry loop so this logic only exists once.
async function applyReadUpdate(chatId, receiverId, otherUserId, channel) {
  const result = await messagedb.updateMany(
    { chatId, recieverID: receiverId, status: { $in: ["sent", "delivered"] } },
    { $set: { status: "read" } },
  );

  if (result.modifiedCount > 0) {
    channel.sendToQueue(
      "notifySenderRead",
      Buffer.from(JSON.stringify({ senderId: otherUserId, chatId })),
      { persistent: true },
    );
  }

  return result.modifiedCount;
}

const updateReadStatus = async () => {
  console.log("Updating read status started");
  const channel = await getChannel();
  await channel.assertQueue("markAsRead", { durable: true });
  await channel.assertQueue("notifySenderRead", { durable: true });
  channel.prefetch(5);

  channel.consume("markAsRead", async (msg) => {
    if (!msg) return;

    const { chatId, receiverId, otherUserId } = JSON.parse(
      msg.content.toString(),
    );

    try {
      const count = await applyReadUpdate(chatId, receiverId, otherUserId, channel);
      console.log(`marked ${count} messages read for chat ${chatId}`);
      channel.ack(msg);
    } catch (error) {
      const isConnectionIssue =
        error.name === "MongooseServerSelectionError" ||
        error.name === "MongoNetworkError";

      console.log("error updating read status:", error.name, error.message);

      if (!isConnectionIssue) {
        channel.nack(msg, false, false);
        return;
      }

      const deadline = Date.now() + 10000;
      let success = false;

      while (Date.now() < deadline && !success) {
        await new Promise((r) => setTimeout(r, 1000));
        try {
          const count = await applyReadUpdate(
            chatId,
            receiverId,
            otherUserId,
            channel,
          );
          console.log(
            `marked ${count} messages read for chat ${chatId} (after retry)`,
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
          "gave up after 10s outage, dropping (will reconcile next time chat is opened)",
        );
        channel.nack(msg, false, false);
      }
    }
  });
};

module.exports = updateReadStatus;