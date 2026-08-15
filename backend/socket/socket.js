const redis = require("../config/redis");
const { getChannel } = require("../config/RabbitMQ");
const { json } = require("body-parser");
const processOfflineMessages = require("./processOfflineMessages");
const processGroupMemberships = require("./processGroupMemberships");

module.exports = async (socket, io) => {
  try {
    const userid = socket.handshake.query.user;
    if (userid) {
      socket.user = userid;
      await redis.hSet(`socket:${userid}`, "socket", socket.id);
      console.log("got into process offline message ", userid);
      let res2 = await redis.hGetAll(`socket:${userid}`);
      let channel = await getChannel();
      await processOfflineMessages(userid, socket.id, io);
      await processGroupMemberships(userid, socket);
    } else {
      console.log("no user ID");
    }
  } catch (error) {
    console.log("error from socket section:: \n", error);
  }

  socket.on("clickme", (data) => {
    console.log("hello world", socket.id);
    socket.emit("checkthis", { name: "bharat" });
  });
  socket.on("second", (data) => {
    console.log(data, socket.id);
  });

  socket.on("custome_disconnect", (data) => {
    console.log("Logout write the logic here ");
  });
  socket.on("hel", async (data) => {
    console.log("from hello");
    console.log(socket);
    // const sockets = await io.fetchSockets();
    // const winodws = sockets.map(socket => socket.id);
    // console.log(winodws)
    // io.to(winodws[1]).emit("bharat",{message:"this is for you !!"})
  });

  socket.on("getthesocketID-forMessage", async (data, callback) => {
    // console.log("the data we are getting  :: ", data);
    try {
      let channel = await getChannel();
      const userid = data.userid;
      let time = new Date();
      const getSocketID = await redis.hGet(`socket:${userid}`, "socket");

      data.time = time;
      let message = data;
      message.status = "sent";
      if (getSocketID) {
        const response = await io
          .timeout(5000)
          .to(getSocketID)
          .emitWithAck("MessageRecieved", { data });
        console.log("ack raw:", JSON.stringify(response));
        if (response?.[0]?.received) message.status = "delivered";
      }
      channel.sendToQueue(
        "messageSent",
        Buffer.from(JSON.stringify(message)),
        {},
        (err, ok) => {
          console.log("CONFIRM CALLBACK CALLED");
          if (err) {
            console.log("RabbitMQ rejected message", err);
            callback({ time, status: "error" });
          } else {
            console.log("RabbitMQ confirmed message");
            callback({ time, status: message.status });
          }
        },
      );
    } catch (error) {
      console.log("error while getting recievers socket ID :-\n", error);
      callback({ status: "error" }); // <-- so the sender doesn't hang
    }
  });

  socket.on("sendGroupMessage", async (data, callback) => {
    try {
      const channel = await getChannel();
      const { groupId, senderId, content } = data;

      const { queue: replyQueue } = await channel.assertQueue("", {
        exclusive: true,
        autoDelete: true,
      });

      await channel.assertQueue("sendGroupMessage", { durable: true });

      channel.sendToQueue(
        "sendGroupMessage",
        Buffer.from(
          JSON.stringify({ groupId, senderId, content, replyTo: replyQueue }),
        ),
        { persistent: true },
      );

      const timeoutHandle = setTimeout(async () => {
        try {
          await channel.cancel(consumerTag.consumerTag);
        } catch (e) {}
        callback({ status: "error", reason: "timeout" });
      }, 10000);

      const consumerTag = await channel.consume(replyQueue, async (msg) => {
        if (!msg) return;
        clearTimeout(timeoutHandle);
        channel.ack(msg);
        await channel.cancel(consumerTag.consumerTag);

        const { error, message: savedMessage } = JSON.parse(
          msg.content.toString(),
        );

        if (error || !savedMessage) {
          callback({ status: "error" });
          return;
        }

        const onlineUserIds = await redis.sMembers(`group:${groupId}:online`);

        await Promise.allSettled(
          onlineUserIds
            .filter((uid) => uid !== senderId)
            .map(async (uid) => {
              const socketId = await redis.hGet(`socket:${uid}`, "socket");
              if (socketId) {
                io.to(socketId).emit("newGroupMessage", savedMessage);
              }
            }),
        );

        callback({ status: "sent", message: savedMessage });
      });
    } catch (error) {
      console.log("error in sendGroupMessage handler:\n", error);
      callback({ status: "error" });
    }
  });

  socket.on("markGroupRead", async (data) => {
    // Fire-and-forget: client doesn't wait on this. If it's dropped,
    // the next viewport read past this point overwrites it anyway,
    // since markReadUpTo only ever moves the pointer forward.
    try {
      const channel = await getChannel();
      const { groupId, userId, seq } = data;
      await channel.assertQueue("markGroupRead", { durable: true });
      channel.sendToQueue(
        "markGroupRead",
        Buffer.from(JSON.stringify({ groupId, userId, seq })),
        { persistent: true },
      );
    } catch (error) {
      console.log("error in markGroupRead handler (non-fatal):\n", error);
    }
  });
  socket.on("disconnect", async () => {
    const user = socket.user;
    if (!user) return;
    const current = await redis.hGet(`socket:${user}`, "socket");
    if (current === socket.id) {
      await redis.hDel(`socket:${user}`, "socket");
    }
  });

  socket.on("typing", (data) => {
    console.log(data, socket.id, "the data");
    io.to(data.userId).emit("types");
  });
};
