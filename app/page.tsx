import LoginScreen from "@/components/login-screen";
import { hasEnvVars } from "@/lib/utils";

export default function Home() {
  return <LoginScreen supabaseConfigured={Boolean(hasEnvVars)} />;
}
