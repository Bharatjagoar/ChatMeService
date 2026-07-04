import React, { useState } from "react";
import instance from "../../../axios/axiosInstance";
// import { socket } from '../../socket/socket';
import getSocket from "../../socket/socket";
import logo from "../../../images/logo.png";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEnvelope } from "@fortawesome/free-solid-svg-icons";
import { faWhatsapp } from "@fortawesome/free-brands-svg-icons";
import loginCss from "./login.module.css"; // Import the CSS module
import { useNavigate } from "react-router-dom";
import { useDispatch } from "react-redux";
import { LoggedIn, setUserId } from "../../../redux/reducer";

const Login = () => {
  const dispatch = useDispatch();
  const nav = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const socket = getSocket();
  const btnClicked = async () => {
    try {
      const { data } = await instance.post("/login", { username, password });

      dispatch(LoggedIn(true));
      dispatch(setUserId(data.userId));

      if (!socket.connected) {
        socket.io.opts.query = { user: data.userId };
        socket.connect();
      }

      nav("/message");
    } catch (error) {
      console.log("Login failed", error);
    }
  };
  const btnClicked2 = async () => {
    try {
      const respo = await instance.get("/test");
      console.log(respo.data.loggedin, "respo");
    } catch (error) {
      console.log(error, "errr");
    }
  };

  const btnClicked3 = async () => {
    try {
      const respo = await instance.post("/logout");
      console.log(respo.data.loggedin, "respo");
    } catch (error) {
      console.log(error, "errr");
    }
  };

  return (
    <div className={loginCss.container}>
      <div className={loginCss.loginContainer}>
        <h1 className={loginCss.h1}>Login</h1>
        <input
          type="text"
          placeholder="Username"
          onChange={(e) => setUsername(e.target.value)}
        />
        <input
          type="password"
          placeholder="Password"
          onChange={(e) => setPassword(e.target.value)}
        />
        <button onClick={btnClicked}>Submit</button>
        {/* <button onClick={btnClicked2}>Check Login Status</button> */}

        <div className={loginCss.iconContainer}>
          {/* <h1>Icons</h1> */}
          {/* <FontAwesomeIcon icon={faWhatsapp} size="5x" /> */}
          {/* <button onClick={btnClicked3}>Logout</button> */}
        </div>
      </div>
    </div>
  );
};

export default Login;
