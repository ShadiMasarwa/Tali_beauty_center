import { useState } from "react";
import CustomerBooking from "./components/CustomerBooking.jsx";
import AdminApp from "./components/AdminApp.jsx";

export default function App() {
  const [admin, setAdmin] = useState(window.location.pathname.startsWith("/admin"));
  function navigate(next) { window.history.pushState({}, "", next ? "/admin" : "/"); setAdmin(next); }
  return admin ? <AdminApp onHome={() => navigate(false)} /> : <CustomerBooking onAdmin={() => navigate(true)} />;
}
