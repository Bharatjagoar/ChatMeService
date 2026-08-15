const { getChannel } = require("../config/RabbitMQ");
const { markReadUpTo } = require("../../schema/GroupReadState");
const mongoose = require("mongoose");

/**
 * Fire-and-forget by design (see conversation history): a missed read
 * update is invisible and self-heals the moment the user reads further,
 * since markReadUpTo only ever advances the pointer forward. No reply
 * queue, no retry ceremony — just ack/nack on the queue itself so
 * RabbitMQ's own redelivery covers transient failures.
 */
const MarkGroupReadConsumer = async () => {
  console.log("MarkGroupRead consumer ready");
  const channel = await getChannel();
  await channel.assertQueue("markGroupRead", { durable: true });
  channel.prefetch(10);

  channel.consume("markGroupRead", async (message) => {
    if (!message) return;

    let data;
    try {
      data = JSON.parse(message.content.toString());
    } catch (err) {
      console.error("failed to parse markGroupRead message:", err);
      channel.nack(message, false, false);
      return;
    }

    const { groupId, userId, seq } = data;

    const invalidIds = [groupId, userId].filter(
      (id) => !mongoose.Types.ObjectId.isValid(id),
    );

    if (invalidIds.length > 0 || typeof seq !== "number") {
      console.log("invalid markGroupRead payload, discarding:", data);
      channel.nack(message, false, false);
      return;
    }

    try {
      await markReadUpTo(userId, groupId, seq);
      channel.ack(message);
    } catch (error) {
      console.error("markGroupRead write failed:", error.name, error.message);
      // No manual retry loop — nack without requeue. If this was a
      // transient blip, the next viewport read past `seq` will succeed
      // and silently supersede this one anyway.
      channel.nack(message, false, false);
    }
  });
};

module.exports = MarkGroupReadConsumer;