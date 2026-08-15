const { getChannel } = require("../config/RabbitMQ");
const Group = require("../../schema/Group");
const mongoose = require("mongoose");

const isConnectionIssue = (error) =>
  error.name === "MongooseServerSelectionError" ||
  error.name === "MongoNetworkError";

const createGroupDoc = async (name, members, createdBy) => {
  return Group.create({ name, members, createdBy });
};

/**
 * Retries ONLY the write, up to a 10s deadline, only on connection-type
 * errors. Returns the created doc, or throws if it never succeeds.
 * The write and the reply-send are kept fully separate on purpose — a
 * reply-send failure must never cause a second write, so this function's
 * only job is "get exactly one doc created."
 */
const createGroupWithRetry = async (name, members, createdBy) => {
  try {
    return await createGroupDoc(name, members, createdBy);
  } catch (error) {
    if (!isConnectionIssue(error)) throw error;

    console.error("createGroup write failed, retrying:", error.name);
    const deadline = Date.now() + 10000;

    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 1000));
      try {
        return await createGroupDoc(name, members, createdBy);
      } catch (retryError) {
        if (!isConnectionIssue(retryError)) throw retryError;
        console.error("retry failed:", retryError.name);
      }
    }

    throw new Error("gave up after 10s outage on createGroup write");
  }
};

/**
 * Sending the reply is a separate, best-effort step. If it fails, we log
 * it and give up — we do NOT retry the write because of it. The group
 * document is already durably saved regardless of whether this succeeds.
 */
const sendReply = (channel, replyTo, correlationId, payload) => {
  try {
    channel.sendToQueue(replyTo, Buffer.from(JSON.stringify(payload)), {
      correlationId,
    });
  } catch (error) {
    console.error(
      "failed to send createGroup reply (write already committed):",
      error.message,
    );
  }
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
      sendReply(channel, replyTo, correlationId, { error: true, group: null });
      channel.nack(message, false, false);
      return;
    }

    // Write phase — this is the only part that retries, and it retries
    // ONLY the write, never the reply.
    let group;
    try {
      group = await createGroupWithRetry(name, members, createdBy);
    } catch (error) {
      console.error(
        "createGroup write ultimately failed:",
        error.name,
        error.message,
      );
      sendReply(channel, replyTo, correlationId, { error: true, group: null });
      channel.nack(message, false, false);
      return;
    }

    // Write succeeded — from here, nothing re-runs createGroupDoc again,
    // no matter what happens next.
    sendReply(channel, replyTo, correlationId, { error: false, group });
    channel.ack(message);
  });
};

module.exports = CreateGroupConsumer;