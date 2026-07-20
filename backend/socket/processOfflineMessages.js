const { getChannel } = require("../config/RabbitMQ");

const processOfflineMessages = async (userid, socketId, io) => {
  const channel = await getChannel();
  console.log("got into process offline message ", userid);
  const { queue: replyQueue } = await channel.assertQueue("", {
    exclusive: true,
    autoDelete: true,
  });

  await channel.assertQueue("markdeliver", { durable: true });

  channel.sendToQueue(
    "markdeliver",
    Buffer.from(JSON.stringify({ userid, replyTo: replyQueue })),
    { persistent: true },
  );

  let timedOut = false;

  const timeoutHandle = setTimeout(async () => {
    timedOut = true;
    console.log(
      `timeout waiting for offline messages reply for user ${userid}`,
    );
    try {
      await channel.cancel(consumerTag.consumerTag);
    } catch (e) {
      console.log("error cancelling consumer on timeout:", e.message);
    }
  }, 15000);

  const consumerTag = await channel.consume(replyQueue, async (msg) => {
    if (!msg || timedOut) return;

    clearTimeout(timeoutHandle);

    const { error, messages } = JSON.parse(msg.content.toString());

    if (error) {
      console.log(
        `failed to fetch offline messages for user ${userid}, will retry on next reconnect`,
      );
      channel.ack(msg);
      await channel.cancel(consumerTag.consumerTag);
      return;
    }

    let deliveredIds = [];

    await Promise.allSettled(
      messages.map((msgs) => {
        const { status, __v, ...payload } = msgs;
        return io
          .timeout(5000)
          .to(socketId)
          .emitWithAck("offlineMessages", payload)
          .then((resp) => ({ resp, id: msgs._id }));
      }),
    )
      .then((resp) => {
        for (const res of resp) {
          if (res.status == "fulfilled" && res.value.resp?.[0] === true)
            deliveredIds.push(res.value.id);
        }
      })
      .catch((error) => {
        console.log("got err while sending offline messages :-", error);
      });

    if (deliveredIds.length > 0) {
      await channel.assertQueue("updateDeliveryStatus", { durable: true });
      channel.sendToQueue(
        "updateDeliveryStatus",
        Buffer.from(JSON.stringify({ ids: deliveredIds })),
        { persistent: true },
        (err, ok) => {
          if (err) console.log("error putting message into queue :: ", err);
          else console.log("RabbitMq confirmed message enqueued");
        },
      );
    }

    channel.ack(msg);
    await channel.cancel(consumerTag.consumerTag);
  });
};

module.exports = processOfflineMessages;
