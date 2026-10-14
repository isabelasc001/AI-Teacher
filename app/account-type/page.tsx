import { redirect } from "next/navigation";

export default function AccountTypeLegacyPage() {
  redirect("/auth/select-account-type");
}
