import { useState } from "react";
import { signIn } from "../services/auth"; // use ../lib if you renamed Lib -> lib

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleLogin = async () => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      alert(error.message);
    } else {
        window.location.href = "/";
    }
  };

  return (
    <div style={{ padding: 40 }}>
      <h2>BTQ Login</h2>

      <input
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <br />
      <br />

      <input
        placeholder="Password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <br />
      <br />

      <button onClick={handleLogin}>Login</button>
    </div>
  );
}