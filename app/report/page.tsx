import { Suspense } from "react";
import { Report } from "@/components/screens/Report";

export default function Page() {
  return (
    <Suspense>
      <Report />
    </Suspense>
  );
}
