import { createSlice } from "@reduxjs/toolkit";

const initialState = {
  conversations: {},
};

const initializeConversation = (state, chatId) => {
  if (!state.conversations[chatId]) {
    state.conversations[chatId] = {
      messages: [],
      lastMessage: null,
      unreadCount: 0,
    };
  }
};

const sortMessages = (messages) => {
  return messages.sort((a, b) => new Date(a.time) - new Date(b.time));
};

const removeDuplicates = (messages) => {
  const map = new Map();

  messages.forEach((msg) => {
    // prefer database _id
    const key = msg._id || `${msg.senderId}-${msg.time}-${msg.message}`;

    map.set(key, msg);
  });

  return Array.from(map.values());
};

const chatSlice = createSlice({
  name: "chat",
  initialState,

  reducers: {
    messagesDelivered: (state, action) => {
      const { chatId, messageIds } = action.payload;
      if (!Array.isArray(messageIds) || messageIds.length === 0) return;
      const conversation = state.conversations[chatId];
      if (!conversation) return;

      const idSet = new Set(messageIds);
      conversation.messages.forEach((msg) => {
        if (idSet.has(msg.clientMessageId)) {
          msg.status = "delivered";
        }
      });
    },
    addIncomingMessage: (state, action) => {
      const message = action.payload;
      console.log("from addincoming :: ", action.payload);
      console.log(
        "id check:",
        message.id,
        "recieverID check:",
        message.recieverID,
      );

      const chatId = [message.senderId, message.id].sort().join("_");

      initializeConversation(state, chatId);
      console.log(state.conversations[chatId].messages);
      state.conversations[chatId].messages.push(message);

      state.conversations[chatId].messages = sortMessages(
        removeDuplicates(state.conversations[chatId].messages),
      );

      state.conversations[chatId].lastMessage = message;

      state.conversations[chatId].unreadCount += 1;
    },

    addOutgoingMessage: (state, action) => {
      const message = action.payload;
      console.log("hellow from ", action.payload);
      const chatId = [message.senderId, message.receiverId].sort().join("_");

      initializeConversation(state, chatId);
      console.log(
        "this is state messgae :",
        state.conversations[chatId].messages,
      );
      console.log("this is out going messgae :", message);

      state.conversations[chatId].messages.push(message);

      state.conversations[chatId].messages = sortMessages(
        removeDuplicates(state.conversations[chatId].messages),
      );

      state.conversations[chatId].lastMessage = message;
    },

    clearUnreadCount: (state, action) => {
      const chatId = action.payload;

      if (state.conversations[chatId]) {
        state.conversations[chatId].unreadCount = 0;
      }
    },

    loadConversationMessages: (state, action) => {
      const { chatId, messages } = action.payload;

      initializeConversation(state, chatId);

      const existingMessages = state.conversations[chatId].messages;

      const mergedMessages = [...existingMessages, ...messages];

      const finalMessages = sortMessages(removeDuplicates(mergedMessages));

      state.conversations[chatId].messages = finalMessages;

      if (finalMessages.length > 0) {
        state.conversations[chatId].lastMessage =
          finalMessages[finalMessages.length - 1];
      }
    },
  },
});

export const {
  addIncomingMessage,
  addOutgoingMessage,
  clearUnreadCount,
  messagesDelivered,
  loadConversationMessages,
} = chatSlice.actions;

export default chatSlice.reducer;
