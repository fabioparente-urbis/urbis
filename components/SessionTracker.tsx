"use client";
import { useSessionHeartbeat } from "@/hooks/useSessionHeartbeat";
export default function SessionTracker() {
  useSessionHeartbeat();
  return null;
}
