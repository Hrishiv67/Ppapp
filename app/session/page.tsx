import { Suspense } from "react";
import { Summary } from "@/components/screens/Summary";

export default function Page() {
  return (
    <Suspense>
      <Summary />
    </Suspense>
  );
}
