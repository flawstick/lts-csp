import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function LoginForm({
  step,
  email,
  otp,
  loading,
  message,
  onEmailChange,
  onOtpChange,
  onSendCode,
  onVerifyCode,
  onUseDifferentEmail,
  className,
  ...props
}: {
  step: "email" | "otp";
  email: string;
  otp: string;
  loading: boolean;
  message: string | null;
  onEmailChange: (value: string) => void;
  onOtpChange: (value: string) => void;
  onSendCode: (event: React.FormEvent) => void;
  onVerifyCode: (event: React.FormEvent) => void;
  onUseDifferentEmail: () => void;
} & React.ComponentProps<"form">) {
  const onSubmit = step === "email" ? onSendCode : onVerifyCode;

  return (
    <form onSubmit={onSubmit} className={cn("flex flex-col gap-6", className)} {...props}>
      <FieldGroup>
        <div className="flex flex-col items-center gap-2 text-center">
          <Image src="/logo.png" alt="LTS Tax" width={32} height={32} />
          <h1 className="text-2xl font-bold">Portal Sign In</h1>
          <p className="text-muted-foreground text-sm text-balance">
            {step === "email"
              ? "Use your invited work email to receive a one-time login code."
              : `Enter the 6-digit code sent to ${email}.`}
          </p>
        </div>
        <Field>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(event) => onEmailChange(event.target.value)}
            placeholder="you@trustcompany.com"
            required
            className="bg-background"
            disabled={loading || step === "otp"}
          />
        </Field>
        {step === "otp" ? (
          <Field>
            <FieldLabel htmlFor="otp">One-time code</FieldLabel>
            <Input
              id="otp"
              inputMode="numeric"
              maxLength={6}
              value={otp}
              onChange={(event) =>
                onOtpChange(event.target.value.replace(/\D/g, "").slice(0, 6))
              }
              placeholder="123456"
              required
              className="bg-background text-center tracking-[0.24em]"
            />
          </Field>
        ) : null}
        <Field>
          <Button type="submit" disabled={loading || (step === "otp" && otp.length !== 6)}>
            {loading
              ? step === "email"
                ? "Sending code..."
                : "Verifying..."
              : step === "email"
                ? "Send login code"
                : "Verify code"}
          </Button>
        </Field>
        {step === "otp" ? (
          <Field>
            <Button variant="outline" type="button" onClick={onUseDifferentEmail}>
              Use different email
            </Button>
          </Field>
        ) : null}
        {message ? <p className="text-muted-foreground text-sm">{message}</p> : null}
        <p className="text-center text-sm">
          New here?{" "}
          <Link href="/signup" className="underline underline-offset-4">
            Request portal access
          </Link>
        </p>
      </FieldGroup>
    </form>
  );
}
