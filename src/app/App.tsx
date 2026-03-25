import { AuthProvider } from "./contexts/AuthContext";

export default function App() {
  return (
    <AuthProvider>
      <div>AUTH WRAP TEST</div>
    </AuthProvider>
  );
}