import React, { useEffect, useState } from "react";
import getSocket from "./socket/socket.js";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import App from "./App.jsx"; // Import the App component
import Tester from "./component/instance.jsx";
// import Message from "./component/message/mesage.jsx";
import Register from "./component/Register/Register.jsx";
import Login from "./component/login/login.jsx";
import Home from "./component/Home/Home.jsx";
import Message from "./component/message/mesage.jsx";
import { checkLoginStatus } from "../redux/reducer.js";
// import { useDispatch } from "react-redux";
import { useDispatch, useSelector } from "react-redux";
import { addIncomingMessage } from "../redux/chatslice.js";
// import LoadingPage from "./loadingComponent.jsx";

const Router = () => {
  const dispatch = useDispatch();
  const socket = getSocket();
  const [isloading, setisloading] = useState(true);
  const MessageRecievedACK = (data, callback) => {
    console.log("EVENT RECEIVED", data);
    try {
      dispatch(addIncomingMessage(data.data));

      console.log("SENDING ACK");

      callback({ received: true });
    } catch (err) {
      console.log(err);
      callback({ received: false }); // tell server it didn't land
    }
  };
  const OfflineMessages = (data, callback) => {
    //testing what i am getting in data
    console.log("data from async :: ", data);
    callback(true);
  };
  useEffect(() => {
    dispatch(checkLoginStatus(setisloading));
    console.log("from the Router component");
    console.log("Router useEffect fired");

    if (!socket.connected) {
      socket.on("connect", () => {
        console.log("connection request from router dom 😅😅😅😅😅");
        socket.off("MessageRecieved", MessageRecievedACK);
        socket.on("MessageRecieved", MessageRecievedACK);
        socket.off("offlineMessages", OfflineMessages);
        socket.on("offlineMessages", OfflineMessages);
      });
    } else {
      socket.off("MessageRecieved", MessageRecievedACK);
      socket.on("MessageRecieved", MessageRecievedACK);
      socket.off("offlineMessages", OfflineMessages);
      socket.on("offlineMessages", OfflineMessages);
    }

    return () => {
      socket.off("MessageRecieved", MessageRecievedACK);
      socket.off("offlineMessages", OfflineMessages);
    };
  }, [dispatch]);

  const isLogin = useSelector((state) => {
    return state.WhatsApp.IsLogin;
  });
  if (isloading) {
    return (
      <>
        <h1>loading ..!!</h1>
      </>
    );
  }

  return (
    <>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to={"/register"} />} />
          <Route path="/Tester" element={<Tester />} />
          <Route
            path="/message"
            element={isLogin ? <Message /> : <Navigate to={"/login"} />}
          />
          <Route path="/Register" element={<Register />} />
          <Route path="*" element={<h1>path not found</h1>} />
          <Route path="/login" element={<Login />} />
          <Route
            path="/Chatting"
            element={
              isLogin ? (
                <h1>from chatting screen </h1>
              ) : (
                <Navigate to={"/login"} />
              )
            }
          />
        </Routes>
      </BrowserRouter>
    </>
  );
};

export default Router;
