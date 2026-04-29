import React from "react";
import { Navigate } from "react-router-dom";

/**
 * The standalone Agents page is a placeholder; the working agent management UI lives in the
 * Team Management tab of Settings. We keep the `/agents` route registered (legacy links, sidebar
 * entries) but immediately redirect to the real flow. `replace` keeps `/agents` out of history.
 */
export function Agents() {
  return <Navigate to="/settings?tab=subagents" replace />;
}
