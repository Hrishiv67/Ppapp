import { Suspense } from "react";
import { Home } from "@/components/screens/Home";

export default function Page() {
  return (
    <Suspense>
      <Home />
    </Suspense>
  );
}
