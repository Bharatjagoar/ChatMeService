const { getChannel } = require("../config/RabbitMQ");
const Group = require("../../schema/Group");
const mongoose = require("mongoose");

const isConnectionIssue = (error) =>
  error.name === "MongooseServerSelectionError" ||
  error.name === "MongoNetworkError";

const fetchGroupIds = async (userid) => {
  const groups = await Group.find({ members: userid }).select("_id");
  return groups.map((g) => g._id.toString());
};

const GetUserGroupsConsumer = async () => {
  console.log("GetUserGroups consumer ready");
  const channel = await getChannel();
  await channel.assertQueue("getUserGroups", { durable: true });
  channel.prefetch(10);

  channel.consume("getUserGroups", async (message) => {
    if (!message) return;

    let data;
    try {
      data = JSON.parse(message.content.toString());
    } catch (err) {
      console.error("failed to parse getUserGroups message:", err);
      channel.nack(message, false, false);
      return;
    }

    const { userid, replyTo } = data;

    if (!mongoose.Types.ObjectId.isValid(userid)) {
      console.log("invalid userid in getUserGroups, discarding:", userid);
      channel.sendToQueue(
        replyTo,
        Buffer.from(JSON.stringify({ error: true, groupIds: [] })),
      );
      channel.nack(message, false, false);
      return;
    }

    try {
      const groupIds = await fetchGroupIds(userid);
      channel.sendToQueue(
        replyTo,
        Buffer.from(JSON.stringify({ error: false, groupIds })),
      );
      channel.ack(message);
    } catch (error) {
      console.error("error in GetUserGroups consumer:", error.name, error.message);

      if (!isConnectionIssue(error)) {
        channel.sendToQueue(
          replyTo,
          Buffer.from(JSON.stringify({ error: true, groupIds: [] })),
        );
        channel.nack(message, false, false);
        return;
      }

      const deadline = Date.now() + 10000;
      let success = false;

      while (Date.now() < deadline && !success) {
        await new Promise((r) => setTimeout(r, 1000));
        try {
          const groupIds = await fetchGroupIds(userid);
          channel.sendToQueue(
            replyTo,
            Buffer.from(JSON.stringify({ error: false, groupIds })),
          );
          channel.ack(message);
          success = true;
        } catch (retryError) {
          console.error("retry failed:", retryError.name);
          if (!isConnectionIssue(retryError)) {
            channel.sendToQueue(
              replyTo,
              Buffer.from(JSON.stringify({ error: true, groupIds: [] })),
            );
            channel.nack(message, false, false);
            return;
          }
        }
      }

      if (!success) {
        console.log("gave up after 10s outage on getUserGroups");
        channel.sendToQueue(
          replyTo,
          Buffer.from(JSON.stringify({ error: true, groupIds: [] })),
        );
        channel.nack(message, false, false);
      }
    }
  });
};

module.exports = GetUserGroupsConsumer;