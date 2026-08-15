const { getChannel } = require("../config/RabbitMQ");
const Group = require("../../schema/Group");
const mongoose = require("mongoose");

const isConnectionIssue = (error) =>
  error.name === "MongooseServerSelectionError" ||
  error.name === "MongoNetworkError";

const createGroupDoc = async (name, members, createdBy) => {
  return Group.create({ name, members, createdBy });
};

const CreateGroupConsumer = async () => {
  console.log("Create group consumer ready");
  const channel = await getChannel();
  await channel.assertQueue("createGroup", { durable: true });
  channel.prefetch(10);

  channel.consume("createGroup", async (message) => {
    if (!message) return;

    let data;
    try {
      data = JSON.parse(message.content.toString());
    } catch (err) {
      console.error("failed to parse createGroup message:", err);
      channel.nack(message, false, false);
      return;
    }

    const { name, members, createdBy } = data;
    const { correlationId, replyTo } = message.properties;

    const invalidIds = [createdBy, ...members].filter(
      (id) => !mongoose.Types.ObjectId.isValid(id),
    );

    if (invalidIds.length > 0) {
      console.log("invalid ids in createGroup, discarding:", invalidIds);
      channel.sendToQueue(
        replyTo,
        Buffer.from(JSON.stringify({ error: true, group: null })),
        { correlationId },
      );
      channel.nack(message, false, false);
      return;
    }

    try {
      const group = await createGroupDoc(name, members, createdBy);
      channel.sendToQueue(
        replyTo,
        Buffer.from(JSON.stringify({ error: false, group })),
        { correlationId },
      );
      channel.ack(message);
    } catch (error) {
      console.error(
        "error in CreateGroup consumer:",
        error.name,
        error.message,
      );

      if (!isConnectionIssue(error)) {
        channel.sendToQueue(
          replyTo,
          Buffer.from(JSON.stringify({ error: true, group: null })),
          { correlationId },
        );
        channel.nack(message, false, false);
        return;
      }

      const deadline = Date.now() + 10000;
      let success = false;

      while (Date.now() < deadline && !success) {
        await new Promise((r) => setTimeout(r, 1000));
        try {
          const group = await createGroupDoc(name, members, createdBy);
          channel.sendToQueue(
            replyTo,
            Buffer.from(JSON.stringify({ error: false, group })),
            { correlationId },
          );
          channel.ack(message);
          success = true;
        } catch (retryError) {
          console.error("retry failed:", retryError.name);

          if (!isConnectionIssue(retryError)) {
            channel.sendToQueue(
              replyTo,
              Buffer.from(JSON.stringify({ error: true, group: null })),
              { correlationId },
            );
            channel.nack(message, false, false);
            return;
          }
        }
      }

      if (!success) {
        console.log("gave up after 10s outage on createGroup");
        channel.sendToQueue(
          replyTo,
          Buffer.from(JSON.stringify({ error: true, group: null })),
          { correlationId },
        );
        channel.nack(message, false, false);
      }
    }
  });
};

module.exports = CreateGroupConsumer;
