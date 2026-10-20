import { BRAND } from "@ek/shared";
import { Alert, PageHeader } from "../components/ui";

const Doc = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="mx-auto max-w-3xl px-4 py-10">
    <PageHeader title={title} />
    <Alert tone="warn" title="Draft for review">This text is a plain-language starting point written for the product as built. Have it reviewed by a qualified lawyer and replace the placeholder contact details before launching to customers.</Alert>
    <div className="prose-sm mt-6 space-y-4 text-ink-2 [&_h2]:mt-6 [&_h2]:text-xl [&_h2]:text-ink [&_ul]:list-disc [&_ul]:pl-5">{children}</div>
  </div>
);

export const Terms = () => (
  <Doc title="Terms of service">
    <p>These terms apply when you use {BRAND.name}. By creating an account or buying a plan you agree to them.</p>
    <h2>The service</h2><p>{BRAND.name} provides online tools. Free tools are available without charge; paid plans unlock extra limits or features for the period or quantity shown at checkout.</p>
    <h2>Your account</h2><p>Keep your password private. You are responsible for activity on your account. You must provide accurate information.</p>
    <h2>Payments</h2><p>Prices are in INR and shown before you pay. Plans do not renew automatically. Access is unlocked only after your payment is confirmed by our payment provider.</p>
    <h2>Your content</h2><p>You own the content you create. You grant us permission to store and process it only to provide the service to you.</p>
    <h2>Acceptable use</h2><ul><li>Do not use the tools for unlawful purposes or to infringe others' rights.</li><li>Do not attempt to disrupt or gain unauthorised access to the service.</li></ul>
    <h2>No guarantees about outcomes</h2><p>Documents, photos and PDFs you produce are your responsibility. We do not guarantee that invoices meet every legal or tax requirement, or that any photo or document will be accepted by a portal, employer or authority. AI suggestions may contain mistakes and must be reviewed by you.</p>
    <h2>Availability and liability</h2><p>We aim to keep the service available but do not promise uninterrupted access. To the extent allowed by law, our liability is limited to the amount you paid for the affected plan.</p>
    <h2>Contact</h2><p>{BRAND.supportEmail}</p>
  </Doc>
);

export const Privacy = () => (
  <Doc title="Privacy policy">
    <h2>What we collect</h2><ul><li>Account details: name, email, and a hashed password.</li><li>Content you save: invoices, stock records, resumes, invitation designs, business pages.</li><li>Order records: what you bought, amount and payment status. We never receive card or UPI credentials.</li><li>Security logs: sign-in and sensitive actions, with IP address, to protect your account.</li></ul>
    <h2>What stays on your device</h2><p>Files you process in the PDF, photo and invitation tools are handled in your browser and are not uploaded.</p>
    <h2>AI features</h2><p>If you use an optional AI suggestion, only the text you submit for that request is sent to the AI provider configured by the service. Avoid including sensitive personal details.</p>
    <h2>Sharing</h2><p>We share data only with processors needed to run the service (hosting, database, payments, email). We do not sell personal data. Mini-business pages you publish are public by design.</p>
    <h2>Your rights</h2><p>You can export all your data and permanently delete your account from Account → Settings. Order and payment records are kept without a link to your identity where required for accounting.</p>
    <h2>Retention</h2><p>Account content is kept until you delete it or your account. Sessions expire after 14 days. Security logs and order records are retained as needed for security and accounting.</p>
    <h2>Analytics</h2><p>We do not use third-party advertising trackers.</p>
    <h2>Contact</h2><p>{BRAND.supportEmail}</p>
  </Doc>
);

export const Refunds = () => (
  <Doc title="Refund & cancellation policy">
    <h2>Cancellation</h2><p>Nothing renews automatically, so there is nothing to cancel. A plan simply ends when its period finishes or its credits are used.</p>
    <h2>Refunds</h2><ul><li>If a paid feature does not work as described, contact support within 7 days of purchase and we will fix it or refund you.</li><li>Credit packs that have already been used (in whole or in part) are normally not refundable.</li><li>Refunds are returned to the original payment method through the payment provider and can take several business days to appear.</li></ul>
    <h2>What happens to access</h2><p>When an order is refunded, the access it granted (including downloads) is removed.</p>
    <h2>How to ask</h2><p>Use the contact form and include your order number from Account → Orders.</p>
  </Doc>
);
