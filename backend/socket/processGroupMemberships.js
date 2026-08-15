const { getChannel } = require("../config/RabbitMQ");
const redis = require("../config/redis");

/**
 * Called once per socket connect, right after 1:1 offline delivery.
 * For each group this user belongs to: if the group's Redis presence
 * entry doesn't exist yet, this connection is "first online" for that
 * group and does the Socket.IO room join + Redis write. If it already
 * exists, just join the room — no redundant work.
 */
const processGroupMemberships = async (userid, socket) => {
  const channel = await getChannel();
  console.log("got into process group memberships for ", userid);

  const { queue: replyQueue } = await channel.assertQueue("", {
    exclusive: true,
    autoDelete: true,
  });

  await channel.assertQueue("getUserGroups", { durable: true });

  channel.sendToQueue(
    "getUserGroups",
    Buffer.from(JSON.stringify({ userid, replyTo: replyQueue })),
    { persistent: true },
  );

  let timedOut = false;

  const timeoutHandle = setTimeout(async () => {
    timedOut = true;
    console.log(`timeout waiting for group memberships reply for user ${userid}`);
    try {
      await channel.cancel(consumerTag.consumerTag);
    } catch (e) {
      console.log("error cancelling consumer on timeout:", e.message);
    }
  }, 15000);

  const consumerTag = await channel.consume(replyQueue, async (msg) => {
    if (!msg || timedOut) return;

    clearTimeout(timeoutHandle);

    const { error, groupIds } = JSON.parse(msg.content.toString());

    if (error) {
      console.log(
        `failed to fetch group memberships for user ${userid}, will retry on next reconnect`,
      );
      channel.ack(msg);
      await channel.cancel(consumerTag.consumerTag);
      return;
    }

    for (const groupId of groupIds) {
      const exists = await redis.exists(`group:${groupId}:online`);
      await redis.sAdd(`group:${groupId}:online`, userid);

      if (!exists) {
        console.log(`first online member for group ${groupId}, wrote presence`);
      }
    }

    channel.ack(msg);
    await channel.cancel(consumerTag.consumerTag);
  });
};

module.exports = processGroupMemberships;