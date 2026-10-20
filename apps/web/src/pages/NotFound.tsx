import { LinkButton } from "../components/ui";
export default function NotFound() {
  return <div className="mx-auto max-w-lg px-4 py-24 text-center"><h1 className="text-4xl font-semibold">Page not found</h1><p className="mt-2 text-ink-2">That page does not exist or has moved.</p><LinkButton to="/" className="mt-6">Go home</LinkButton></div>;
}
