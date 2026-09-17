import LoginScreen from "@/components/login-screen";
import { hasEnvVars } from "@/lib/utils";

export default function LoginPage() {
  return <LoginScreen supabaseConfigured={Boolean(hasEnvVars)} />;
}
