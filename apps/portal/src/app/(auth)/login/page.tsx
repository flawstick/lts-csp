"use client";

import { useRouter } from "next/navigation";
import { useState, useRef } from "react";
import dynamic from "next/dynamic";

import { LoginForm } from "@/components/login-form";
import { ThemeToggle } from "@/components/theme-toggle";
import { ShieldCheckIcon, type ShieldCheckIconHandle } from "@/components/ui/shield-check";
import { LockIcon, type LockIconHandle } from "@/components/ui/lock";
import { FileTextIcon, type FileTextIconHandle } from "@/components/ui/file-text";
import { EyeIcon, type EyeIconHandle } from "@/components/ui/eye";
import { createClient } from "@/lib/supabase/client";

const Grainient = dynamic(() => import("@/components/Grainient"), {
  ssr: false,
});

export default function PortalLoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"email" | "otp">("email");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const shieldRef = useRef<ShieldCheckIconHandle>(null);
  const lockRef = useRef<LockIconHandle>(null);
  const fileRef = useRef<FileTextIconHandle>(null);
  const eyeRef = useRef<EyeIconHandle>(null);

  const animateAll = () => {
    shieldRef.current?.startAnimation();
    lockRef.current?.startAnimation();
    fileRef.current?.startAnimation();
    eyeRef.current?.startAnimation();
  };

  const stopAll = () => {
    shieldRef.current?.stopAnimation();
    lockRef.current?.stopAnimation();
    fileRef.current?.stopAnimation();
    eyeRef.current?.stopAnimation();
  };

  const sendCode = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setMessage(null);

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    });

    setLoading(false);
    if (error) {
      setMessage(error.message);
      return;
    }

    setStep("otp");
    setMessage("A 6-digit code has been sent to your email.");
  };

  const verifyCode = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setMessage(null);

    const { error } = await supabase.auth.verifyOtp({
      email,
      token: otp,
      type: "email",
    });

    setLoading(false);
    if (error) {
      setMessage(error.message);
      return;
    }

    router.push("/");
    router.refresh();
  };

  return (
    <div className="grid h-svh overflow-hidden lg:grid-cols-2">
      <div className="flex flex-col gap-4 p-6 md:p-10">
        <div className="flex items-center justify-between">
          <div className="inline-flex items-center gap-2 font-medium">
            <img src="/logo.png" alt="LTS Tax" width={20} height={20} />
            LTS Client Portal
          </div>
          <ThemeToggle />
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-sm">
            <LoginForm
              step={step}
              email={email}
              otp={otp}
              loading={loading}
              message={message}
              onEmailChange={setEmail}
              onOtpChange={setOtp}
              onSendCode={sendCode}
              onVerifyCode={verifyCode}
              onUseDifferentEmail={() => {
                setStep("email");
                setOtp("");
                setMessage(null);
              }}
            />
          </div>
        </div>
      </div>
      <div className="relative hidden overflow-hidden border-l lg:block">
        <div className="absolute inset-0">
          <Grainient />
        </div>
        <div className="relative flex h-full items-center justify-center p-10">
          <div className="relative w-full max-w-md">
            <div className="absolute -inset-[5px] rounded-[calc(1rem+5px)] bg-gradient-to-b from-white/70 via-white/40 to-white/25 shadow-[0_0_60px_-4px_rgba(255,255,255,0.2)] dark:from-background/70 dark:via-background/40 dark:to-background/25 dark:shadow-[0_0_60px_-4px_hsl(var(--background)/0.2)]" />
            <div
              className="relative rounded-2xl bg-background/85 px-6 py-5 text-center backdrop-blur-xl"
              onMouseEnter={animateAll}
              onMouseLeave={stopAll}
            >
              <ShieldCheckIcon ref={shieldRef} size={24} className="mx-auto flex justify-center text-foreground" />
              <h2 className="mt-2.5 text-base font-semibold">Secure Client Portal</h2>
              <div className="mx-auto mt-4 flex max-w-xs justify-center gap-6 text-xs text-foreground">
                <span className="flex flex-col items-center gap-1.5">
                  <LockIcon ref={lockRef} size={18} />
                  Encrypted
                </span>
                <span className="flex flex-col items-center gap-1.5">
                  <FileTextIcon ref={fileRef} size={18} />
                  Audit logged
                </span>
                <span className="flex flex-col items-center gap-1.5">
                  <EyeIcon ref={eyeRef} size={18} />
                  Reviewable
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
