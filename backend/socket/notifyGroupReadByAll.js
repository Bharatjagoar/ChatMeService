const { getChannel } = require("../config/RabbitMQ");
const redis = require("../config/redis");

// Same shape as notifySenderRead.js's notifySenderOfRead — checks Redis
// for the sender's live socket and emits if they're currently connected.
async function notifySenderGroupRead(msg, io) {
  const { groupId, seq, senderId } = JSON.parse(msg.content.toString());

  const socketId = await redis.hGet(`socket:${senderId}`, "socket");

  if (socketId && io.sockets.sockets.get(socketId)) {
    io.to(socketId).emit("groupMessageReadByAll", { groupId, seq });
    console.log(
      `notified sender ${senderId} that group ${groupId} seq ${seq} was read by everyone`,
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
}

const notifyGroupReadByAll = async (io) => {
  console.log("Notify group read by all consumer started");
  const channel = await getChannel();
  await channel.assertQueue("notifyGroupReadByAll", { durable: true });

  channel.prefetch(15);
  channel.consume("notifyGroupReadByAll", async (msg) => {
    if (!msg) return;

    try {
      await notifySenderGroupRead(msg, io);
      channel.ack(msg);
    } catch (error) {
      const isConnectionIssue =
        error.name === "ClientClosedError" ||
        error.name === "SocketClosedUnexpectedlyError" ||
        error.name === "ConnectionTimeoutError";

      console.log("error in notifyGroupReadByAll:", error.name, error.message);

      if (!isConnectionIssue) {
        channel.nack(msg, false, false);
        return;
      }

      const deadline = Date.now() + 5000;
      let success = false;

      while (Date.now() < deadline && !success) {
        await new Promise((r) => setTimeout(r, 1000));
        try {
          await notifySenderGroupRead(msg, io);
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
          "gave up after 5s Redis outage, skipping live blue-tick notification",
        );
        channel.nack(msg, false, false);
      }
    }
  });
};

module.exports = notifyGroupReadByAll;
