const { getChannel } = require("../config/RabbitMQ");
const messagedb = require("../../schema/messageSchema");

async function ReadConvo() {
  const channel = await getChannel();

  await channel.assertQueue("SendChatId", { durable: false });
  await channel.assertQueue("ReadfromDBMessages", { durable: false });
  channel.prefetch(20);
  channel.consume("SendChatId", async (msg) => {
    if (!msg) return;

    try {
      console.log("ReadConvo");
      const ChatId = JSON.parse(msg.content.toString());
      console.log(ChatId, msg.properties.correlationId, msg.properties.replyTo);

      const messages = await messagedb
        .find({ chatId: ChatId.id })
        .sort({ createdAt: -1 });

      channel.sendToQueue(
        msg.properties.replyTo,
        Buffer.from(JSON.stringify({ messages })),
        { correlationId: msg.properties.correlationId },
      );

      channel.ack(msg);
    } catch (error) {
      console.error("Failed to process message in ReadConvo:", error);
      channel.nack(msg, false, false); // discard on error
    }
  });
}

module.exports = ReadConvo;
