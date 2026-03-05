import { createBrowserRouter } from "react-router-dom";
import { RootLayout } from "./pages/RootLayout";
import { Dashboard } from "./pages/Dashboard";
import { Agents } from "./pages/Agents";
import { Transactions } from "./pages/Transactions";
import { Analytics } from "./pages/Analytics";
import { Offices } from "./pages/Offices";
import { SettingsPage } from "./pages/SettingsPage";
import { TransactionDetail } from "./pages/TransactionDetail";
import { NewTransaction } from "./pages/NewTransaction";
import Login from "./Login";

export const router = createBrowserRouter([
  {
    path: "/login",
    Component: Login,
  },
  {
    path: "/",
    Component: RootLayout,
    children: [
      { index: true, Component: Dashboard },
      { path: "agents", Component: Agents },
      { path: "transactions", Component: Transactions },
      { path: "transactions/new", Component: NewTransaction },
      { path: "transactions/:id", Component: TransactionDetail },
      { path: "analytics", Component: Analytics },
      { path: "offices", Component: Offices },
      { path: "settings", Component: SettingsPage },
    ],
  },
]);