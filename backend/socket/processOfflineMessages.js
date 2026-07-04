const { getChannel } = require("../config/RabbitMQ");
const { v4: uuidv4 } = require("uuid");

const processOfflineMessages = async (userid, socketId, io) => {
  const channel = await getChannel();
  const correlationId = uuidv4();
  const replyQueue = `offline.reply.${correlationId}`; // unique per user

  await channel.assertQueue(replyQueue, { durable: false, autoDelete: true });
  await channel.assertQueue("markdeliver", { durable: true });

  channel.sendToQueue(
    "markdeliver",
    Buffer.from(JSON.stringify({ userid, replyTo: replyQueue})),
    { persistent: true },
  );
  //yaha par agar corelation id match nhi hui to bhi ack kar rhe ho jisse ,
  const consumerTag = await channel.consume(replyQueue, async (msg) => {
    if (!msg) return;
    // if (msg.properties.correlationId !== correlationId) {
    //   channel.ack(msg);
    //   return;
    // }
    try {
      let deliveredIds = [];
      const messages = JSON.parse(msg.content.toString());
      console.log("here from Message service :: ", messages);
      await Promise.allSettled(
        messages.map((msgs) => {
          return io
            .timeout(5000)
            .to(socketId)
            .emitWithAck("offlineMessages", msgs)
            .then((resp) => ({ resp, id: msgs._id }));
        }),
      )
        .then((resp) => {
          for (const res of resp) {
            console.log("prinitin :: ", res);
            if (res.status == "fulfilled" && res.value.resp?.[0] === true)
              deliveredIds.push(res.value.id);
          }
        })
        .catch((error) => {
          console.log("got err while sending offline messages :-", error);
        });

      // Lane 3 — send deliveredIds back to message service
      if (deliveredIds.length > 0) {
        await channel.assertQueue("updateDeliveryStatus", { durable: true });
        console.log("starting lane 3 :: ", deliveredIds);
        const channelack = channel.sendToQueue(
          "updateDeliveryStatus",
          Buffer.from(JSON.stringify({ ids: deliveredIds })),
          { persistent: true },
          (err, ok) => {
            if (err) console.log("error putting message into queue :: ", err);
            else console.log("RabbitMq confirmed message enqueued");
          },
        );
        console.log(channelack);
      }

      channel.ack(msg);
      await channel.cancel(consumerTag.consumerTag);
    } catch (error) {
      console.log("error in marking delivery :: ",error );
      channel.ack(msg);
    }
  });
};



if (a != b && x >= y) {
    return foo => bar;
}
module.exports = processOfflineMessages;
