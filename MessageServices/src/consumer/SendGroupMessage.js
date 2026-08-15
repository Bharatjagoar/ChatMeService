const { getChannel } = require("../config/RabbitMQ");
const GroupMessage = require("../../schema/GroupMessage");
const { incrementGroupSeq } = require("../../schema/GroupSeqCounter");
const mongoose = require("mongoose");

const isConnectionIssue = (error) =>
  error.name === "MongooseServerSelectionError" ||
  error.name === "MongoNetworkError";

/**
 * seq is fetched and the message is created as two separate awaited
 * steps — the atomicity guarantee lives entirely inside the $inc call
 * itself, and once seq is returned it's a captured local value, safe
 * even under concurrent sends (see conversation history).
 */
const persistGroupMessage = async (groupId, senderId, content) => {
  const seq = await incrementGroupSeq(groupId);
  return GroupMessage.create({ groupId, senderId, content, seq });
};

/**
 * Retries ONLY the write (seq increment + message save), up to a 10s
 * deadline, only on connection-type errors. The write and the reply-send
 * are kept fully separate on purpose — a reply-send failure must never
 * cause a second write, because a second write here means BOTH a
 * duplicate message AND a burned/skipped seq number for the group.
 */
const persistWithRetry = async (groupId, senderId, content) => {
  try {
    return await persistGroupMessage(groupId, senderId, content);
  } catch (error) {
    if (!isConnectionIssue(error)) throw error;

    console.error("sendGroupMessage write failed, retrying:", error.name);
    const deadline = Date.now() + 10000;

    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 1000));
      try {
        return await persistGroupMessage(groupId, senderId, content);
      } catch (retryError) {
        if (!isConnectionIssue(retryError)) throw retryError;
        console.error("retry failed:", retryError.name);
      }
    }

    throw new Error("gave up after 10s outage on sendGroupMessage write");
  }
};

/**
 * Best-effort reply. If it fails, log and give up — do NOT retry the
 * write because of it. The message is already durably saved with its
 * seq regardless of whether this succeeds.
 */
const sendReply = (channel, replyTo, payload) => {
  try {
    channel.sendToQueue(replyTo, Buffer.from(JSON.stringify(payload)));
  } catch (error) {
    console.error(
      "failed to send sendGroupMessage reply (write already committed):",
      error.message,
    );
  }
};

const SendGroupMessageConsumer = async () => {
  console.log("SendGroupMessage consumer ready");
  const channel = await getChannel();
  await channel.assertQueue("sendGroupMessage", { durable: true });
  channel.prefetch(10);

  channel.consume("sendGroupMessage", async (message) => {
    if (!message) return;

    let data;
    try {
      data = JSON.parse(message.content.toString());
    } catch (err) {
      console.error("failed to parse sendGroupMessage:", err);
      channel.nack(message, false, false);
      return;
    }

    const { groupId, senderId, content, replyTo } = data;

    const invalidIds = [groupId, senderId].filter(
      (id) => !mongoose.Types.ObjectId.isValid(id),
    );

    if (invalidIds.length > 0 || !content) {
      console.log("invalid sendGroupMessage payload, discarding:", data);
      sendReply(channel, replyTo, { error: true, message: null });
      channel.nack(message, false, false);
      return;
    }

    // Write phase — only this retries, and only the write.
    let saved;
    try {
      saved = await persistWithRetry(groupId, senderId, content);
    } catch (error) {
      console.error(
        "sendGroupMessage write ultimately failed:",
        error.name,
        error.message,
      );
      sendReply(channel, replyTo, { error: true, message: null });
      channel.nack(message, false, false);
      return;
    }

    // Write succeeded — nothing re-runs persistGroupMessage again from
    // here, no matter what happens to the reply.
    sendReply(channel, replyTo, { error: false, message: saved });
    channel.ack(message);
  });
};

module.exports = SendGroupMessageConsumer;