import { Button } from "@/components/ui/button"
import { ArrowLeft } from "@/lib/icons"
import Link from "next/link"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Cyber Security & Data Protection | LTS STP Portal",
  description:
    "Institutional Client Cyber Security and Data Protection Q&A for the LTS Straight Through Processing Portal.",
}

export default function PortalSecurityPage() {
  return (
    <main className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <Button variant="ghost" size="sm" asChild className="mb-8">
          <Link href="/login">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Link>
        </Button>

        <h1 className="text-3xl font-bold mb-2">
          LTS Straight Through Processing (STP) Portal
        </h1>
        <p className="text-lg text-muted-foreground mb-8">
          Institutional Client &ndash; Cyber Security &amp; Data Protection Q&amp;A
        </p>

        <div className="prose prose-neutral dark:prose-invert max-w-none space-y-8">
          {/* 1 */}
          <section className="space-y-4">
            <h2 className="text-xl font-semibold">
              1. What data is processed through the LTS Portal?
            </h2>
            <p className="text-muted-foreground">
              The portal processes data strictly necessary to facilitate tax
              compliance submissions, including:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1">
              <li>Tax return data (Cert 3)</li>
              <li>Company identifiers and registration details</li>
              <li>
                Director or authorised signatory details (where required by tax
                authorities)
              </li>
              <li>Portal credentials (securely stored and access-controlled)</li>
            </ul>
            <p className="text-muted-foreground">
              The system does not process special category personal data as
              defined under Article 9 of the UK GDPR.
            </p>
            <p className="text-muted-foreground">
              Processing is undertaken solely for tax compliance purposes and in
              accordance with applicable data protection legislation, including
              the UK General Data Protection Regulation (UK GDPR) and the Data
              Protection Act 2018.
            </p>
          </section>

          {/* 2 */}
          <section className="space-y-4">
            <h2 className="text-xl font-semibold">
              2. What is the lawful basis for processing this data?
            </h2>
            <p className="text-muted-foreground">
              Processing is carried out on the basis of:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1">
              <li>
                <strong>Article 6(1)(b) UK GDPR</strong> &ndash; Performance of
                a contract; and
              </li>
              <li>
                <strong>Article 6(1)(c) UK GDPR</strong> &ndash; Compliance with
                a legal obligation.
              </li>
            </ul>
            <p className="text-muted-foreground">
              The portal does not rely on consent for core processing activities.
            </p>
          </section>

          {/* 3 */}
          <section className="space-y-4">
            <h2 className="text-xl font-semibold">
              3. Where is my data hosted?
            </h2>
            <p className="text-muted-foreground">
              All portal data is hosted within secure UK/EEA-based cloud
              infrastructure, including:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1">
              <li>
                AWS (London region &ndash; eu-west-2) &ndash; background task
                execution and compute
              </li>
              <li>
                Supabase &ndash; authentication services and managed PostgreSQL
                database
              </li>
              <li>
                Vercel &ndash; application hosting and secure document storage
                (Vercel Blob) for uploaded supporting documents
              </li>
            </ul>
            <p className="text-muted-foreground">
              No routine transfers of personal data outside the UK/EEA take
              place. Where any incidental transfer arises, appropriate
              safeguards (including Standard Contractual Clauses or UK
              International Data Transfer Agreements) are in place to ensure an
              adequate level of protection.
            </p>
          </section>

          {/* 4 */}
          <section className="space-y-4">
            <h2 className="text-xl font-semibold">
              4. What security controls protect my data?
            </h2>
            <p className="text-muted-foreground">
              Security controls are implemented at multiple levels:
            </p>

            <h3 className="text-lg font-medium mt-4">Technical Controls</h3>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1">
              <li>Encryption at rest (AES-256)</li>
              <li>Encryption in transit (TLS 1.2+)</li>
              <li>Role-Based Access Control (RBAC)</li>
              <li>Multi-Factor Authentication (MFA)</li>
              <li>Secure credential storage</li>
              <li>Intrusion detection and monitoring</li>
              <li>Continuous vulnerability scanning</li>
              <li>Annual independent penetration testing</li>
            </ul>

            <h3 className="text-lg font-medium mt-4">Operational Controls</h3>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1">
              <li>Data Protection Impact Assessment (DPIA)</li>
              <li>Cyber &amp; Data Protection Risk Register entry</li>
              <li>Contractually enforceable Data Processing Agreement</li>
              <li>Defined retention and deletion schedule</li>
            </ul>

            <h3 className="text-lg font-medium mt-4">Human Controls</h3>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1">
              <li>Annual GDPR and cyber security training</li>
              <li>Segregation of duties</li>
              <li>Oversight by senior management</li>
            </ul>
          </section>

          {/* 5 */}
          <section className="space-y-4">
            <h2 className="text-xl font-semibold">
              5. How is access to the portal controlled?
            </h2>
            <p className="text-muted-foreground">
              Access is restricted through:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1">
              <li>Role-based permissions aligned to job function</li>
              <li>Least-privilege principle</li>
              <li>MFA enforcement</li>
              <li>Session timeouts</li>
              <li>Logged and auditable access events</li>
            </ul>
            <p className="text-muted-foreground">
              Only authorised internal personnel may access client data. External
              users do not receive access unless expressly authorised.
            </p>
          </section>

          {/* 6 */}
          <section className="space-y-4">
            <h2 className="text-xl font-semibold">
              6. How are credentials protected?
            </h2>
            <p className="text-muted-foreground">
              Where tax portal credentials are required:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1">
              <li>They are encrypted and securely stored.</li>
              <li>They are never embedded in source code.</li>
              <li>Access to credentials is strictly controlled.</li>
              <li>Access events are logged and auditable.</li>
            </ul>
          </section>

          {/* 7 */}
          <section className="space-y-4">
            <h2 className="text-xl font-semibold">
              7. Is Artificial Intelligence (AI) used in the portal?
            </h2>
            <p className="text-muted-foreground">
              Yes. The portal uses controlled automation supported by AI models
              to assist with navigation and form completion on government
              portals.
            </p>
            <p className="text-muted-foreground">However:</p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1">
              <li>Automation is strictly user-initiated.</li>
              <li>
                No fully autonomous decision-making occurs &ndash; meaningful
                human oversight is maintained at all stages.
              </li>
              <li>Human oversight is embedded in the workflow.</li>
              <li>Actions are fully logged and reviewable.</li>
              <li>
                Client data is not used for model training by LTS or its AI
                providers.
              </li>
              <li>
                AI providers are subject to contractual security controls,
                including Data Processing Agreements.
              </li>
            </ul>
            <p className="text-muted-foreground">
              The system complies with the requirements of Article 22 of the UK
              GDPR regarding automated individual decision-making, including
              profiling.
            </p>
          </section>

          {/* 8 */}
          <section className="space-y-4">
            <h2 className="text-xl font-semibold">
              8. How long is data retained?
            </h2>
            <p className="text-muted-foreground">
              Data retention is governed by the Group&apos;s formal retention
              schedule.
            </p>
            <p className="text-muted-foreground">Controls include:</p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1">
              <li>
                Permanent deletion from the portal after 12 months (unless
                longer retention is legally required).
              </li>
              <li>
                Tenant-level retention enforcement where applicable.
              </li>
            </ul>
            <p className="text-muted-foreground">
              Data subject erasure rights under Article 17 of the UK GDPR are
              supported through formal procedures.
            </p>
          </section>

          {/* 9 */}
          <section className="space-y-4">
            <h2 className="text-xl font-semibold">
              9. How are data subject rights managed?
            </h2>
            <p className="text-muted-foreground">
              The Group operates formal procedures governing:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1">
              <li>Data Subject Access Requests (DSARs)</li>
              <li>Rectification</li>
              <li>Erasure</li>
              <li>Restriction of processing</li>
              <li>Data portability</li>
              <li>Objection rights</li>
            </ul>
            <p className="text-muted-foreground">
              Requests are handled within statutory timeframes (ordinarily
              within one calendar month) and documented in a formal register.
            </p>
          </section>

          {/* 10 */}
          <section className="space-y-4">
            <h2 className="text-xl font-semibold">
              10. What happens in the event of a cyber event or data breach?
            </h2>
            <p className="text-muted-foreground">
              The Group maintains a formal Cyber Security Response and Recovery
              Plan and Data Protection Breach Notification Policy, which
              includes:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1">
              <li>Immediate internal escalation</li>
              <li>
                72-hour regulatory notification assessment (in accordance with
                Article 33 of the UK GDPR)
              </li>
              <li>
                Data subject notification where required (in accordance with
                Article 34 of the UK GDPR)
              </li>
              <li>Senior oversight and sign-off</li>
              <li>Maintenance of a breach register</li>
              <li>Post-incident review and remediation</li>
            </ul>
            <p className="text-muted-foreground">
              Clients will be notified promptly where an incident materially
              affects their data.
            </p>
          </section>

          {/* 11 */}
          <section className="space-y-4">
            <h2 className="text-xl font-semibold">
              11. Has the platform been independently tested?
            </h2>
            <p className="text-muted-foreground">
              The platform is subject to:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1">
              <li>Annual independent third-party penetration testing</li>
              <li>Continuous vulnerability scanning</li>
              <li>
                Defined patch management processes (critical patches within 48
                hours)
              </li>
            </ul>
          </section>

          {/* 12 */}
          <section className="space-y-4">
            <h2 className="text-xl font-semibold">
              12. How are third-party providers governed?
            </h2>
            <p className="text-muted-foreground">
              All third-party providers:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1">
              <li>Act strictly as Data Processors under Article 28 of the UK GDPR</li>
              <li>
                Are bound by a formal Data Processing Agreement
              </li>
              <li>Must maintain appropriate security certifications</li>
              <li>Are subject to sub-processor governance controls</li>
            </ul>
          </section>

          {/* 13 */}
          <section className="space-y-4">
            <h2 className="text-xl font-semibold">
              13. What governance oversight exists?
            </h2>
            <p className="text-muted-foreground">
              The LTS STP Portal has been subject to:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1">
              <li>Formal Data Protection Impact Assessment</li>
              <li>Cyber &amp; Data Protection Risk Matrix assessment</li>
              <li>Senior management approval</li>
              <li>Defined go-live approval process</li>
            </ul>
            <p className="text-muted-foreground">
              The platform remains subject to ongoing review and monitoring.
            </p>
          </section>

          {/* Assurance Statement */}
          <section className="space-y-4 border-t pt-8">
            <h2 className="text-xl font-semibold">Assurance Statement</h2>
            <p className="text-muted-foreground">
              The LTS STP Portal has been designed and implemented in accordance
              with recognised data protection and cyber security principles,
              incorporating privacy by design and by default, layered technical
              controls, and structured governance oversight.
            </p>
          </section>

          {/* Contact */}
          <section className="space-y-4 border-t pt-8">
            <h2 className="text-xl font-semibold">
              Further Information &amp; Contact Details
            </h2>
            <p className="text-muted-foreground">
              If you require any additional information regarding the LTS
              Straight Through Processing (STP) Portal, its cyber security
              controls, data protection framework, or governance oversight,
              please contact:
            </p>
            <div className="text-muted-foreground">
              <p className="font-medium text-foreground">
                Director of Operations
              </p>
              <p>James Gouveia</p>
              <p>LTS Tax Limited</p>
            </div>
            <p className="text-muted-foreground">
              All enquiries relating to data protection matters may also be
              directed to the Group&apos;s Data Protection Officer via:{" "}
              <a
                href="mailto:dataprivacy@lts-tax.com"
                className="text-primary underline underline-offset-4"
              >
                dataprivacy@lts-tax.com
              </a>
            </p>
          </section>

          {/* Privacy Notice */}
          <section className="space-y-4 border-t pt-8">
            <h2 className="text-xl font-semibold">Privacy Notice</h2>
            <p className="text-muted-foreground">
              The Group&apos;s Privacy Policy sets out how personal data is
              collected, used, retained, and protected in accordance with
              applicable data protection legislation.
            </p>
            <p className="text-muted-foreground">
              Clients are encouraged to review the{" "}
              <Link
                href="/privacy-policy"
                className="text-primary underline underline-offset-4"
              >
                Privacy Policy
              </Link>{" "}
              for further information regarding data subject rights, lawful
              bases for processing, international transfers, and complaint
              procedures.
            </p>
          </section>
        </div>
      </div>
    </main>
  )
}
