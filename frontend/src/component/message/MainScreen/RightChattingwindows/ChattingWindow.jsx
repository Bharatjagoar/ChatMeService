import React, { useEffect, useState, useRef } from "react";
import ChattingWindowCSS from "./ChattingWindow.module.css";
import Displaypicture from "../../../displayPicture/Displaypicture";
import { motion } from "framer-motion";
import getSocket from "../../../../socket/socket";
import instance from "../../../../../axios/axiosInstance";
import { useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPaperPlane } from "@fortawesome/free-solid-svg-icons";
import { useDispatch, useSelector } from "react-redux";
import {
  loadConversationMessages,
  addOutgoingMessage,
} from "../../../../../redux/chatslice";

const ChattingWindow = (user) => {
  const [isanimate, setanimate] = useState(false);
  const [Message, setMessage] = useState("");
  const [showNewMessageBox, setShowNewMessageBox] = useState(false);
  const [newMessageStartIndex, setNewMessageStartIndex] = useState(null);

  const dispatch = useDispatch();
  const socket = getSocket();
  const nav = useNavigate();
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  // const loggedin

  let userdata = user.user;

  const currentLoggedinUser = useSelector((state) => {
    console.log(state.WhatsApp);
    return state.WhatsApp.userId;
  });
  const currentUsername = useSelector((state) => state.WhatsApp.userName);

  const chatId = [user.user._id, user.senderId].sort().join("_");

  const EMPTY = [];
  const conversations = useSelector(
    (state) => state.chat.conversations[chatId]?.messages ?? EMPTY,
  );

  // Reset divider when chat changes
  useEffect(() => {
    setShowNewMessageBox(false);
    setNewMessageStartIndex(null);
  }, [chatId]);

  // Fetch messages on chat open
  useEffect(() => {
    const fetchConversation = async () => {
      if (!user.user) return;
      try {
        const response = await instance.get(`/getMessages/${chatId}`);
        if (response?.data?.messages) {
          dispatch(
            loadConversationMessages({
              chatId,
              messages: response.data.messages,
            }),
          );
        }
      } catch (error) {
        console.error("Error fetching messages:", error);
      }
    };
    fetchConversation();
  }, [user.user?._id, user.senderId]);

  // Scroll listener — hide banner when user scrolls to bottom
  useEffect(() => {
    const container = messagesContainerRef.current;

    const handleScroll = () => {
      if (!container) return;
      const isAtBottom =
        container.scrollHeight - container.scrollTop <=
        container.clientHeight + 10;
      if (isAtBottom) {
        setShowNewMessageBox(false);
        setNewMessageStartIndex(null);
      }
    };

    container?.addEventListener("scroll", handleScroll);
    return () => container?.removeEventListener("scroll", handleScroll);
  }, []);

  // React to new messages
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const isAtBottom =
      container.scrollHeight - container.scrollTop <=
      container.clientHeight + 10;

    const lastMessage = conversations[conversations.length - 1];
    const isIncoming = lastMessage?.senderId !== currentLoggedinUser;

    console.log({
      scrollHeight: container.scrollHeight,
      scrollTop: container.scrollTop,
      clientHeight: container.clientHeight,
      diff:
        container.scrollHeight - container.scrollTop - container.clientHeight,
      isIncoming,
    });
    if (isAtBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      setShowNewMessageBox(false);
      setNewMessageStartIndex(null);
    } else if (isIncoming) {
      setShowNewMessageBox(true);
      setNewMessageStartIndex(conversations.length - 1);
    }
  }, [conversations]);
  useEffect(() => {
    setShowNewMessageBox(false);
    setNewMessageStartIndex(null);
  }, [chatId]);

  const logoutBtn = async () => {
    try {
      const respo = await instance.post("/logout");
      if (socket.connected) {
        socket.disconnect();
      }
      nav("/login");
    } catch (error) {
      console.log(error);
    }
  };
  const btnclicked = async () => {
    let id = user.user._id;
    let username = user.user.UserName;
    if (!Message || Message.trim() === "") return;
    console.log("this is getting you username ::: ", username);
    const clientMessageId = crypto.randomUUID();
    const messageobj = {};
    let { senderId } = user;
    messageobj.senderId = senderId;
    messageobj.receiverId = id;
    messageobj.chatId = chatId;
    messageobj.message = Message;
    messageobj.clientMessageId = clientMessageId;

    socket.emit(
      "getthesocketID-forMessage",
      {
        userid: id,
        Message,
        RecieverUsername: username,
        id,
        senderId,
        senderUsername: currentUsername,
        clientMessageId,
      },
      async (data) => {
        messageobj.time = data.time;
        messageobj.status = data.status;
        messageobj.senderUsername = currentUsername;
        messageobj.receiverusername = username;
        dispatch(addOutgoingMessage(messageobj));
      },
    );

    setMessage("");
    user.removesearchresult("");
  };
  const inputchange = (e) => setMessage(e.target.value);

  return (
    <div className={ChattingWindowCSS.mainchatscreens}>
      <div className={ChattingWindowCSS.Navbar}>
        <div className={ChattingWindowCSS.dpContainer}>
          <Displaypicture />
          <motion.p animate={{ y: isanimate ? -10 : 0 }}>
            {userdata.UserName}
          </motion.p>
        </div>
        <button onClick={logoutBtn}>logout</button>
      </div>

      <div
        className={ChattingWindowCSS.Displaychat}
        style={{ position: "relative" }}
        ref={messagesContainerRef}
      >
        <div
          className={ChattingWindowCSS.messagescontainer}
          onClick={() => setShowNewMessageBox(false)}
        >
          {conversations.map((message, index) => {
            const isMine = message.senderId === currentLoggedinUser;
            return (
              <React.Fragment key={message._id || `${message.userid}-${index}`}>
                <div
                  className={`${ChattingWindowCSS.messageBubble} ${isMine ? ChattingWindowCSS.myMessage : ChattingWindowCSS.otherMessage}`}
                >
                  <div className={ChattingWindowCSS.messageText}>
                    {message.message || message.Message || "No message content"}
                  </div>
                  <div className={ChattingWindowCSS.messageMeta}>
                    <span className={ChattingWindowCSS.messageTime}>
                      {message.time
                        ? new Date(message.time).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                            hour12: false,
                          })
                        : "No time"}
                    </span>
                    {isMine && (
                      <span className={ChattingWindowCSS.messageTick}>
                        {message.status === "delivered" ||
                        message.status === "read"
                          ? "✓✓"
                          : "✓"}
                      </span>
                    )}
                  </div>
                </div>
              </React.Fragment>
            );
          })}
          <div ref={messagesEndRef}></div>
        </div>

        {/* Floating new message banner */}

        {/* <div style={{color:'red'}}>{showNewMessageBox ? "SHOW" : "HIDE"}</div> */}
      </div>

      <div className={ChattingWindowCSS.SendMessageDiv}>
        <input
          type="text"
          onChange={inputchange}
          value={Message}
          onKeyDown={(e) => {
            if (e.key === "Enter") btnclicked();
          }}
          placeholder="type a message"
        />
        <motion.div
          className={ChattingWindowCSS.SendBtn}
          whileTap={{ scale: 0.9 }}
          onClick={btnclicked}
        >
          <FontAwesomeIcon icon={faPaperPlane} />
        </motion.div>
      </div>
    </div>
  );
};

export default ChattingWindow;
