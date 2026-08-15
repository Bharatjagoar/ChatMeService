const { getChannel } = require("../config/RabbitMQ");
const { v4: uuidv4 } = require("uuid");

module.exports.CreateGroup = async (req, res) => {
  const { name, members } = req.body;
  const createdBy = req.user.id; // trusted, from JWT — matches MarkAsRead pattern

  if (!name || !Array.isArray(members) || members.length === 0) {
    return res
      .status(400)
      .json({ message: "name and a non-empty members array are required" });
  }

  const channel = await getChannel();
  const correlationId = uuidv4();

  await channel.assertQueue("createGroup", { durable: true });
  const q = await channel.assertQueue("", {
    exclusive: true,
    autoDelete: true,
  });
  const replyTo = q.queue;

  const timeoutHandle = setTimeout(() => {
    channel.cancel(consumerTag.consumerTag).catch(() => {});
    res.status(504).json({ message: "group creation timed out, please retry" });
  }, 10000);

  let responded = false;

  const consumerTag = await channel.consume(replyTo, async (msg) => {
    if (!msg || msg.properties.correlationId !== correlationId) return;

    clearTimeout(timeoutHandle);
    channel.ack(msg);
    await channel.cancel(consumerTag.consumerTag);

    if (responded) return;
    responded = true;

    const { error, group } = JSON.parse(msg.content.toString());

    if (error) {
      return res.status(500).json({ message: "failed to create group" });
    }

    res.status(201).json({ group });
  });

  channel.sendToQueue(
    "createGroup",
    Buffer.from(JSON.stringify({ name, members, createdBy })),
    { correlationId, replyTo, persistent: true },
  );
};