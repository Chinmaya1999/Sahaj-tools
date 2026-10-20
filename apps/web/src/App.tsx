import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import { Layout, RequireAuth } from "./components/Layout";
import { Spinner } from "./components/ui";
import Home from "./pages/Home";
import { Bundles, Explore, FreeTools } from "./pages/Browse";
import Pricing from "./pages/Pricing";
import ProductPage from "./pages/ProductPage";
import Help from "./pages/Help";
import Contact from "./pages/Contact";
import { Privacy, Refunds, Terms } from "./pages/Legal";
import { ForgotPassword, Login, Register, ResetPassword } from "./pages/AuthPages";
import Checkout, { OrderResult } from "./pages/Checkout";
import { AccountLayout, DownloadHistory, Library, Orders, Overview, Settings } from "./pages/Account";
import PublicPage from "./pages/PublicPage";
import NotFound from "./pages/NotFound";
import ToolPage from "./tools";

const Admin = lazy(() => import("./pages/Admin"));

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="explore" element={<Explore />} />
        <Route path="free-tools" element={<FreeTools />} />
        <Route path="pricing" element={<Pricing />} />
        <Route path="bundles" element={<Bundles />} />
        <Route path="tools/:slug" element={<ToolPage />} />
        <Route path="tools/:slug/about" element={<ProductPage />} />
        <Route path="help" element={<Help />} />
        <Route path="contact" element={<Contact />} />
        <Route path="terms" element={<Terms />} /><Route path="privacy" element={<Privacy />} /><Route path="refunds" element={<Refunds />} />
        <Route path="login" element={<Login />} /><Route path="register" element={<Register />} />
        <Route path="forgot-password" element={<ForgotPassword />} /><Route path="reset-password" element={<ResetPassword />} />
        <Route path="p/:slug" element={<PublicPage />} />
        <Route element={<RequireAuth />}>
          <Route path="checkout/:type/:id" element={<Checkout />} />
          <Route path="account" element={<AccountLayout />}>
            <Route index element={<Overview />} /><Route path="orders" element={<Orders />} /><Route path="orders/:id" element={<OrderResult />} />
            <Route path="library" element={<Library />} /><Route path="downloads" element={<DownloadHistory />} /><Route path="settings" element={<Settings />} />
          </Route>
        </Route>
        <Route element={<RequireAuth admin />}><Route path="admin" element={<Suspense fallback={<Spinner />}><Admin /></Suspense>} /></Route>
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
