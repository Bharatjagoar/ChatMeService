const { json } = require("body-parser");
const { getChannel } = require("../config/RabbitMQ");
const { v4: uuidv4 } = require("uuid");
const Userdb = require("../schema/userSchema");

module.exports.Readmessage = async (req, res) => {
  const channel = await getChannel();
  const correlationId = uuidv4();

  await channel.assertQueue("ReadConvos", { durable: false });
  const q = await channel.assertQueue("", {
    exclusive: true,
    autoDelete: true,
  });
  const reply = q.queue;

  channel.sendToQueue(
    "ReadConvos",
    Buffer.from(JSON.stringify({ id: req.params.id })),
    {
      correlationId,
      replyTo: reply,
    },
  );
  // consumerTag
  const tag = await channel.consume(reply, async (Message) => {
    if (Message.properties.correlationId !== correlationId) return;

    const { resultArr } = JSON.parse(Message.content.toString());
    const resarr = [];

    for (const element of resultArr) {
      const participantId =
        req.params.id === element.participant[0]
          ? element.participant[1]
          : element.participant[0];

      const participant = await Userdb.findById(participantId);
      resarr.push({ ...element, participant });
    }
    console.log(resarr);

    res.send(resarr);
    channel.ack(Message);
    await channel.cancel(tag.consumerTag);
  });
};

module.exports.ReadConvo = async (req, res) => {
  const channel = await getChannel();
  const correlationId = uuidv4();
  let { ChatId } = req.params;

  await channel.assertQueue("ReadfromDBMessages", { durable: false });
  await channel.assertQueue("SendChatId", { durable: false });

  let obj = { id: ChatId };
  let replyQueue = "ReadfromDBMessages";

  channel.sendToQueue("SendChatId", Buffer.from(JSON.stringify(obj)), {
    correlationId: correlationId,
    replyTo: replyQueue,
  });

  channel.consume(replyQueue, async (Message) => {
    if (Message.properties.correlationId === correlationId) {
      const messageContent = JSON.parse(Message.content.toString());
      res.send(messageContent);
      channel.ack(Message);
      // use the consumer tag off the message itself, not the outer var
      await channel.cancel(Message.fields.consumerTag);
    }
  });
};

module.exports.MarkAsRead = async (req, res) => {
  const channel = await getChannel();
  const receiverId = req.user.id; // trusted, from JWT
  const { chatId } = req.params;
  const { otherUserId } = req.body;

  await channel.assertQueue("markAsRead", { durable: true });

  channel.sendToQueue(
    "markAsRead",
    Buffer.from(JSON.stringify({ chatId, receiverId, otherUserId })),
    { persistent: true },
  );

  res.status(200).json({ message: "marking as read" });
};
