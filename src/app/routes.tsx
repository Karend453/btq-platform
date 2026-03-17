import React from "react";
import { createBrowserRouter } from "react-router-dom";
import EditTransactionDetails from "./pages/EditTransactionDetails";
import { RootLayout } from "./pages/RootLayout";
import { Dashboard } from "./pages/Dashboard";
import { Agents } from "./pages/Agents";
import { Transactions } from "./pages/Transactions";
import { Analytics } from "./pages/Analytics";
import { Offices } from "./pages/Offices";
import { SettingsPage } from "./pages/SettingsPage";
import TransactionDetail from "./transactions/TransactionDetailsPage";
import { NewTransaction } from "./pages/NewTransaction";
import Login from "./Login";

export const router = createBrowserRouter([
  {
    path: "/login",
    element: <Login />,
  },
  {
    path: "/",
    element: <RootLayout />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: "agents", element: <Agents /> },
      { path: "transactions", element: <Transactions /> },
      { path: "transactions/new", element: <NewTransaction /> },
      { path: "transactions/:id", element: <TransactionDetail /> },
      { path: "transactions/:id/edit", element: <EditTransactionDetails /> },
      { path: "test-route", element: <div>Test Route Works</div> },
      { path: "analytics", element: <Analytics /> },
      { path: "offices", element: <Offices /> },
      { path: "settings", element: <SettingsPage /> },

    ],
  },
]);