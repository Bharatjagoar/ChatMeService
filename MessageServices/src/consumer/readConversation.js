const { getChannel } = require("../config/RabbitMQ");
const chatsDB = require("../../schema/chatschema");

async function ReadConversations() {
  const channel = await getChannel();
  console.log("here inside the Read convo");

  await channel.assertQueue("ReadConvos", { durable: false });
  channel.prefetch(20);
  channel.consume("ReadConvos", async (mes) => {
    if (!mes) return;

    try {
      const { id } = JSON.parse(mes.content.toString());

      console.log("hello world", id);
      const Convos = await chatsDB.find({ participant: id }).sort({ Time: -1 });

      const resultArr = Convos.map((element) => {
        let obj = { ...element._doc };

        // Directly look up this user's unread count from the map
        obj.unreadCount = element.unreadCount.get(id) || 0;

        return obj;
      });

      const res = JSON.stringify({ resultArr });

      channel.sendToQueue(mes.properties.replyTo, Buffer.from(res), {
        correlationId: mes.properties.correlationId,
      });

      channel.ack(mes);
    } catch (error) {
      console.error("Error in ReadConversations:", error);
      channel.nack(mes, false, false);
    }
  });
}

module.exports = ReadConversations;
