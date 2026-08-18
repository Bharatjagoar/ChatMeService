// Standalone test script for sendGroupMessage.
// Run: node testGroupSend.js
// Requires: npm install socket.io-client --save-dev  (run this in backend/)

const { io } = require("socket.io-client");

// --- fill these in with real values from your test data ---
const GROUP_ID = "6a7bf009076bca19294482db"; // "Test Group"
const USER_A = "69d6f6848c5ff040d391c67a";   // sender - Jag
const USER_B = "69d6f8563b1013692875479a";   // receiver - bharat
// -------------------------------------------------------------

const SERVER_URL = "http://localhost:5000";

const socketA = io(SERVER_URL, { query: { user: USER_A } });
const socketB = io(SERVER_URL, { query: { user: USER_B } });

let bReady = false;
let aReady = false;

socketB.on("connect", () => {
  console.log("[B] connected", socketB.id);
  bReady = true;
});

socketB.on("newGroupMessage", (msg) => {
  console.log("[B] received newGroupMessage:", JSON.stringify(msg, null, 2));
  socketB.emit("markGroupRead", { groupId: GROUP_ID, userId: USER_B, seq: msg.seq });
  console.log("[B] fired markGroupRead for seq", msg.seq);
});

socketA.on("connect", () => {
  console.log("[A] connected", socketA.id);
  aReady = true;
});

socketA.on("groupMessageReadByAll", (data) => {
  console.log("[A] *** groupMessageReadByAll received:", JSON.stringify(data, null, 2));
});

// Wait for both sockets to register presence (processOfflineMessages +
// processGroupMemberships both run async on connect) before sending.
function waitAndSend() {
  if (!aReady || !bReady) {
    setTimeout(waitAndSend, 300);
    return;
  }

  // extra buffer so the getUserGroups RPC round-trip has time to finish
  // and Redis presence is actually written before we send
  setTimeout(() => {
    console.log("[A] sending group message...");
    socketA.emit(
      "sendGroupMessage",
      { groupId: GROUP_ID, senderId: USER_A, content: "hello group, test message" },
      (response) => {
        console.log("[A] ack from server:", JSON.stringify(response, null, 2));
        setTimeout(() => process.exit(0), 4000);
      },
    );
  }, 1500);
}

waitAndSend();