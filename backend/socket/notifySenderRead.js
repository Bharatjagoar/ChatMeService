const { getChannel } = require("../config/RabbitMQ");
const redis = require("../config/redis");

// Checks Redis for the sender's live socket and emits the read event if
// they're currently connected. Called from both the initial try and the
// retry loop so this logic only exists once.
async function notifySenderOfRead(msg, io) {
  const { senderId, chatId } = JSON.parse(msg.content.toString());

  const socketId = await redis.hGet(`socket:${senderId}`, "socket");

  if (socketId && io.sockets.sockets.get(socketId)) {
    io.to(socketId).emit("messagesRead", { chatId });
    console.log(`notified sender ${senderId} that chat ${chatId} was read`);
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

const notifySenderRead = async (io) => {
  console.log("Notify sender read consumer started");
  const channel = await getChannel();
  await channel.assertQueue("notifySenderRead", { durable: true });

  channel.prefetch(15);
  channel.consume("notifySenderRead", async (msg) => {
    if (!msg) return;

    try {
      await notifySenderOfRead(msg, io);
      channel.ack(msg);
    } catch (error) {
      const isConnectionIssue =
        error.name === "ClientClosedError" ||
        error.name === "SocketClosedUnexpectedlyError" ||
        error.name === "ConnectionTimeoutError";

      console.log("error in notifySenderRead:", error.name, error.message);

      if (!isConnectionIssue) {
        channel.nack(msg, false, false);
        return;
      }

      const deadline = Date.now() + 5000;
      let success = false;

      while (Date.now() < deadline && !success) {
        await new Promise((r) => setTimeout(r, 1000));
        try {
          await notifySenderOfRead(msg, io);
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
          "gave up after 5s Redis outage, message stays read in DB, live notification skipped",
        );
        channel.nack(msg, false, false);
      }
    }
  });
};

module.exports = notifySenderRead;
