const { getChannel } = require("../config/RabbitMQ");
const messageDB = require("../../schema/messageSchema");
const chatCollectionDB = require("../../schema/chatschema");

const isConnectionIssue = (error) =>
  error.name === "MongooseServerSelectionError" ||
  error.name === "MongoNetworkError";

const persistMessage = async (data) => {
  const senderId = data.senderId;
  const receiverId = data.id; // id = receiver

  const chatId = [senderId, receiverId].sort().join("_");

  const savedMessage = await messageDB.create({
    chatId,
    message: data.Message,
    senderId,
    recieverID: receiverId,
    clientMessageId: data.clientMessageId,
    time: data.time,
    status: data.status,
  });

  let chatDoc = await chatCollectionDB.findOne({ chatId });

  if (chatDoc) {
    console.log("🔄 Updating chat collection:", chatId);

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
      unreadCount: { [receiverId]: 1 },
    });

    console.log("✅ Chat collection created:", createCollection);
  }

  return savedMessage;
};

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
      await persistMessage(data);
      channel.ack(message);
    } catch (error) {
      console.error("❌ Error in MessageSent consumer:", error.name, error.message);

      if (!isConnectionIssue(error)) {
        channel.nack(message, false, false);
        return;
      }

      const deadline = Date.now() + 10000;
      let success = false;

      while (Date.now() < deadline && !success) {
        await new Promise((r) => setTimeout(r, 1000));
        try {
          await persistMessage(data);
          channel.ack(message);
          success = true;
        } catch (retryError) {
          console.error("retry failed:", retryError.name);

          if (!isConnectionIssue(retryError)) {
            channel.nack(message, false, false);
            return;
          }
        }
      }

      if (!success) {
        console.log("gave up after 10s outage, discarding message");
        channel.nack(message, false, false);
      }
    }
  });
}

module.exports = MessageSent;