import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <Button variant="ghost" size="sm" asChild className="mb-8">
          <Link href="/login">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Link>
        </Button>

        <h1 className="text-3xl font-bold mb-8">Privacy Policy</h1>

        <div className="prose prose-neutral dark:prose-invert max-w-none space-y-6">
          <p className="text-muted-foreground">
            Last updated: {new Date().toLocaleDateString()}
          </p>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold">1. Information We Collect</h2>
            <p className="text-muted-foreground">
              We collect information you provide directly to us, including your email address,
              tax return data, and any documents you upload to our platform.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold">2. How We Use Your Information</h2>
            <p className="text-muted-foreground">
              We use the information we collect to provide, maintain, and improve our services,
              process tax returns on your behalf, and communicate with you about your account.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold">3. Data Security</h2>
            <p className="text-muted-foreground">
              We implement appropriate technical and organizational measures to protect your
              personal data against unauthorized access, alteration, disclosure, or destruction.
              All data is encrypted in transit and at rest.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold">4. Data Retention</h2>
            <p className="text-muted-foreground">
              We retain your data for as long as your account is active or as needed to provide
              you services. You may request deletion of your data at any time.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold">5. Third-Party Services</h2>
            <p className="text-muted-foreground">
              We may use third-party services to help us operate our platform. These services
              have access to your information only to perform tasks on our behalf and are
              obligated not to disclose or use it for any other purpose.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold">6. Your Rights</h2>
            <p className="text-muted-foreground">
              You have the right to access, correct, or delete your personal data. You may
              also request a copy of your data or object to certain processing activities.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold">7. Contact</h2>
            <p className="text-muted-foreground">
              For questions about this Privacy Policy, please contact us at privacy@ltstax.com.
            </p>
          </section>
        </div>
      </div>
    </main>
  )
}
