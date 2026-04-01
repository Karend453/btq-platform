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
import { OfficeChecklistTemplatesPage } from "./pages/OfficeChecklistTemplatesPage";
import TransactionDetail from "./transactions/TransactionDetailsPage";
import { NewTransaction } from "./pages/NewTransaction";
import Login from "./Login";
import { BackOfficeLogin } from "./pages/back-office/BackOfficeLogin";
import { BackOfficeRouteGuard } from "./pages/back-office/BackOfficeRouteGuard";
import { OrgManagementPage } from "./pages/back-office/OrgManagementPage";
import { BackOfficeAddOfficePage } from "./pages/back-office/BackOfficeAddOfficePage";
import { BackOfficeOfficeDetailPage } from "./pages/back-office/BackOfficeOfficeDetailPage";
import { PricingPage } from "./pages/PricingPage";
import { SignupPage } from "./pages/SignupPage";

export const router = createBrowserRouter([
  {
    path: "/login",
    element: <Login />,
  },
  {
    path: "/pricing",
    element: <PricingPage />,
  },
  {
    path: "/signup",
    element: <SignupPage />,
  },
  {
    path: "/back-office/login",
    element: <BackOfficeLogin />,
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
      { path: "analytics", element: <Analytics /> },
      { path: "offices", element: <Offices /> },
      { path: "office/checklist-templates", element: <OfficeChecklistTemplatesPage /> },
      { path: "settings", element: <SettingsPage /> },
      {
        path: "back-office",
        element: <BackOfficeRouteGuard />,
        children: [
          { path: "org", element: <OrgManagementPage /> },
          { path: "org/new", element: <BackOfficeAddOfficePage /> },
          { path: "org/:officeId", element: <BackOfficeOfficeDetailPage /> },
        ],
      },
    ],
  },
]);