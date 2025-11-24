import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"

export default function TermsOfServicePage() {
  return (
    <main className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <Button variant="ghost" size="sm" asChild className="mb-8">
          <Link href="/login">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Link>
        </Button>

        <h1 className="text-3xl font-bold mb-8">Terms of Service</h1>

        <div className="prose prose-neutral dark:prose-invert max-w-none space-y-6">
          <p className="text-muted-foreground">
            Last updated: {new Date().toLocaleDateString()}
          </p>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold">1. Acceptance of Terms</h2>
            <p className="text-muted-foreground">
              By accessing and using LTS Tax, you agree to be bound by these Terms of Service.
              If you do not agree to these terms, please do not use our service.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold">2. Description of Service</h2>
            <p className="text-muted-foreground">
              LTS Tax provides automated tax return processing and filing services.
              Our platform uses AI-powered automation to assist with tax compliance workflows.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold">3. User Responsibilities</h2>
            <p className="text-muted-foreground">
              You are responsible for maintaining the confidentiality of your account credentials
              and for all activities that occur under your account. You agree to provide accurate
              and complete information when using our services.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold">4. Data Accuracy</h2>
            <p className="text-muted-foreground">
              While we strive to provide accurate automation, you are ultimately responsible
              for reviewing and verifying all tax filings before submission. LTS Tax is a tool
              to assist with tax compliance, not a replacement for professional tax advice.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold">5. Limitation of Liability</h2>
            <p className="text-muted-foreground">
              LTS Tax shall not be liable for any indirect, incidental, special, consequential,
              or punitive damages resulting from your use of or inability to use the service.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold">6. Contact</h2>
            <p className="text-muted-foreground">
              For questions about these Terms of Service, please contact us at legal@ltstax.com.
            </p>
          </section>
        </div>
      </div>
    </main>
  )
}
