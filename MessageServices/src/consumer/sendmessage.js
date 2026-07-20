const { getChannel } = require("../config/RabbitMQ");
const messageDB = require("../../schema/messageSchema");
const chatCollectionDB = require("../../schema/chatschema");

async function MessageSent() {
  console.log("from message sent");
  const channel = await getChannel();
  await channel.assertQueue("messageSent", { durable: false });

  channel.consume("messageSent", async (message) => {
    if (!message) return;

    let data;
    try {
      data = JSON.parse(message.content.toString());
      console.log("📩 Received message:", data);
    } catch (err) {
      console.error("❌ Failed to parse message:", err);
      channel.nack(message, false, false);
      return;
    }

    try {
      const senderId = data.senderId;
      const receiverId = data.id; // id = receiver

      const chatId = [senderId, receiverId].sort().join("_");

      // Save the message
      const savedMessage = await messageDB.create({
        chatId,
        message: data.Message,
        senderId,
        recieverID: receiverId,
        time: data.time,
        status: data.status,
      });
      // console.log("✅ Message saved:", savedMessage);

      let chatDoc = await chatCollectionDB.findOne({ chatId });

      if (chatDoc) {
        console.log("🔄 Updating chat collection:", chatId);

        // Increment unread count for the RECEIVER only
        const currentCount = chatDoc.unreadCount.get(receiverId) || 0;
        chatDoc.unreadCount.set(receiverId, currentCount + 1);
        chatDoc.Time = data.time;
        chatDoc.LastMessage = data.Message;
        await chatDoc.save();
      } else {
        console.log("🆕 Creating new chat collection:", chatId);

        const createCollection = await chatCollectionDB.create({
          chatId,
          LastMessage: data.Message,
          participant: [senderId, receiverId],
          Time: data.time,
          unreadCount: { [receiverId]: 1 }, // receiver starts with 1 unread
        });

        console.log("✅ Chat collection created:", createCollection);
      }

      console.log("Before ACK");
      channel.ack(message);
      console.log("After ACK");
    } catch (error) {
      console.error("❌ Error in MessageSent consumer:", error);
      channel.nack(message, false, false);
    }
  });
}

module.exports = MessageSent;
