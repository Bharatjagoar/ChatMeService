import { io } from "socket.io-client";

let socket;

const getSocket = () => {
    if (!socket) {
        // Create a new socket connection only if it doesn't already exist
        socket = io("http://localhost:5000/", {
            autoConnect: false,
            reconnection: true,
            reconnectionAttempts: 10,
            reconnectionDelay: 500,
            reconnectionDelayMax: 2000,
        });

        // Listen for connection events
        socket.on("connect", () => {
            console.log("Socket connected:", socket.id);
        });

        socket.on("disconnect", () => {
            console.log("Socket disconnected:", socket.id);
        });

        socket.on("reconnect_attempt", (attempt) => {
            console.log(`Reconnection attempt ${attempt}`);
        });
        socket.on("cust")
    }

    return socket;
};

export default getSocket;