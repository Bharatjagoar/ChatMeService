const { getChannel } = require("../config/RabbitMQ");
const redis = require("../config/redis");

// Parses the message and emits the delivered event to the sender's socket
// if they're currently connected. Called from both the initial try and the
// retry loop so this logic only exists once.
async function notifySender(msg, io) {
  const { senderId, chatId, messageIds } = JSON.parse(msg.content.toString());
  if (!Array.isArray(messageIds)) {
    return { malformed: true, senderId };
  }

  const socketId = await redis.hGet(`socket:${senderId}`, "socket");

  if (socketId && io.sockets.sockets.get(socketId)) {
    io.to(socketId).emit("messagesDelivered", { chatId, messageIds });
    console.log(
      `notified sender ${senderId} of ${messageIds.length} delivered messages`,
    );
  } else if (socketId) {
    console.log(
      `sender ${senderId} has stale socket ${socketId} in Redis, skipping (DB already correct)`,
    );
  } else {
    console.log(
      `sender ${senderId} offline, skipping live notification (status already correct in DB)`,
    );
  }

  return { malformed: false };
}

const notifySenderDelivered = async (io) => {
  console.log("Notify sender delivered consumer started");
  const channel = await getChannel();
  await channel.assertQueue("notifySenderDelivered", { durable: true });

  channel.prefetch(15);
  channel.consume("notifySenderDelivered", async (msg) => {
    if (!msg) return;

    try {
      const { malformed, senderId } = await notifySender(msg, io);
      if (malformed) {
        console.log("malformed messageIds, discarding:", senderId);
        channel.nack(msg, false, false);
        return;
      }
      channel.ack(msg);
    } catch (error) {
      const isConnectionIssue =
        error.name === "ClientClosedError" ||
        error.name === "SocketClosedUnexpectedlyError" ||
        error.name === "ConnectionTimeoutError";

      console.log("error in notifySenderDelivered:", error.name, error.message);

      if (!isConnectionIssue) {
        channel.nack(msg, false, false);
        return;
      }

      const deadline = Date.now() + 5000;
      let success = false;

      while (Date.now() < deadline && !success) {
        await new Promise((r) => setTimeout(r, 1000));
        try {
          const { malformed, senderId } = await notifySender(msg, io);
          if (malformed) {
            console.log("malformed messageIds, discarding:", senderId);
            channel.nack(msg, false, false);
            return;
          }
          channel.ack(msg);
          success = true;
        } catch (retryError) {
          const stillConnectionIssue =
            retryError.name === "ClientClosedError" ||
            retryError.name === "SocketClosedUnexpectedlyError" ||
            retryError.name === "ConnectionTimeoutError";

          console.log("retry failed:", retryError.name);

          if (!stillConnectionIssue) {
            channel.nack(msg, false, false);
            return;
          }
        }
      }

      if (!success) {
        console.log(
          "gave up after 5s Redis outage, message stays delivered in DB, live notification skipped",
        );
        channel.nack(msg, false, false);
      }
    }
  });
};

module.exports = notifySenderDelivered;
