"use client";
import dynamic from "next/dynamic";
const UrbiGlobal = dynamic(() => import("./UrbiGlobal"), { ssr: false });
export default function UrbiWrapper() {
  return <UrbiGlobal />;
}
