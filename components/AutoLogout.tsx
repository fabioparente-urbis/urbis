"use client";
import { useAutoLogout } from "@/hooks/useAutoLogout";

export default function AutoLogout() {
  useAutoLogout();
  return null;
}
