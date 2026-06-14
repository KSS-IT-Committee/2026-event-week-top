import { getCurrentUser } from "@/lib/session";
import { isInternal } from "@/lib/user-category";

export async function Internal({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.username)) {
    return <></>;
  } else {
    return <>{children}</>;
  }
}
