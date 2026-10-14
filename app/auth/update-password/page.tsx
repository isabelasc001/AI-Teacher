import { UpdatePasswordForm } from "@/components/update-password-form";
import { hasEnvVars } from "@/lib/utils";

export default function Page() {
  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <UpdatePasswordForm supabaseConfigured={Boolean(hasEnvVars)} />
      </div>
    </div>
  );
}
