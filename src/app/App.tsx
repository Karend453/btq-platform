import { AuthProvider } from "./contexts/AuthContext";

export default function App() {
  return (
    <AuthProvider>
      <div>INSIDE APP BEFORE ROUTER</div>
    </AuthProvider>
  );
}