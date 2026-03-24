import React from "react";
import { createBrowserRouter } from "react-router-dom";
import Login from "./Login";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <div style={{ padding: 40, fontSize: 24 }}>ROOT TEST</div>,
  },
  {
    path: "/login",
    element: <Login />,
  },
]);