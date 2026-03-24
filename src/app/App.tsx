import { createBrowserRouter, RouterProvider } from "react-router-dom";

const testRouter = createBrowserRouter([
  {
    path: "/",
    element: <div style={{ padding: 40, fontSize: 24 }}>ROUTER ROOT TEST</div>,
  },
  {
    path: "/login",
    element: <div style={{ padding: 40, fontSize: 24 }}>ROUTER LOGIN TEST</div>,
  },
]);

export default function App() {
  return <RouterProvider router={testRouter} />;
}