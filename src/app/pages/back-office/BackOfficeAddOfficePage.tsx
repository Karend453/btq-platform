import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { createOfficeForBackOffice } from "../../../services/offices";

const inputClass =
  "mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

const labelClass = "block text-sm font-medium text-slate-700";

export function BackOfficeAddOfficePage() {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [state, setState] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [city, setCity] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [brokerName, setBrokerName] = useState("");
  const [brokerEmail, setBrokerEmail] = useState("");
  const [mlsName, setMlsName] = useState("");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Name is required.");
      return;
    }

    setSubmitting(true);
    const { error: err } = await createOfficeForBackOffice({
      name: trimmed,
      display_name: displayName.trim() || null,
      state: state.trim() || null,
      address_line1: addressLine1.trim() || null,
      city: city.trim() || null,
      postal_code: postalCode.trim() || null,
      broker_name: brokerName.trim() || null,
      broker_email: brokerEmail.trim() || null,
      mls_name: mlsName.trim() || null,
    });
    setSubmitting(false);

    if (err) {
      setError(err);
      return;
    }
    navigate("/back-office/org", { replace: true });
  }

  return (
    <div className="p-6">
      <div className="mx-auto max-w-2xl">
        <Link
          to="/back-office/org"
          className="mb-6 inline-flex items-center gap-2 text-sm text-indigo-700 hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to org management
        </Link>

        <h1 className="text-2xl font-semibold text-slate-900">Add Office</h1>
        <p className="mt-1 text-sm text-slate-500">Back Office · New office record</p>

        <form onSubmit={onSubmit} className="mt-8 space-y-5">
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {error}
            </div>
          )}

          <div>
            <label className={labelClass} htmlFor="office-name">
              Name <span className="text-red-600">*</span>
            </label>
            <input
              id="office-name"
              className={inputClass}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoComplete="organization"
            />
          </div>

          <div>
            <label className={labelClass} htmlFor="office-display-name">
              Display name
            </label>
            <input
              id="office-display-name"
              className={inputClass}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              autoComplete="off"
            />
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="office-state">
                State
              </label>
              <input
                id="office-state"
                className={inputClass}
                value={state}
                onChange={(e) => setState(e.target.value)}
                autoComplete="address-level1"
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="office-postal">
                Postal code
              </label>
              <input
                id="office-postal"
                className={inputClass}
                value={postalCode}
                onChange={(e) => setPostalCode(e.target.value)}
                autoComplete="postal-code"
              />
            </div>
          </div>

          <div>
            <label className={labelClass} htmlFor="office-address1">
              Address line 1
            </label>
            <input
              id="office-address1"
              className={inputClass}
              value={addressLine1}
              onChange={(e) => setAddressLine1(e.target.value)}
              autoComplete="street-address"
            />
          </div>

          <div>
            <label className={labelClass} htmlFor="office-city">
              City
            </label>
            <input
              id="office-city"
              className={inputClass}
              value={city}
              onChange={(e) => setCity(e.target.value)}
              autoComplete="address-level2"
            />
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="office-broker-name">
                Broker / primary contact name
              </label>
              <input
                id="office-broker-name"
                className={inputClass}
                value={brokerName}
                onChange={(e) => setBrokerName(e.target.value)}
                autoComplete="name"
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="office-broker-email">
                Broker / primary contact email
              </label>
              <input
                id="office-broker-email"
                type="email"
                className={inputClass}
                value={brokerEmail}
                onChange={(e) => setBrokerEmail(e.target.value)}
                autoComplete="email"
              />
            </div>
          </div>

          <div>
            <label className={labelClass} htmlFor="office-mls">
              MLS name
            </label>
            <input
              id="office-mls"
              className={inputClass}
              value={mlsName}
              onChange={(e) => setMlsName(e.target.value)}
              autoComplete="off"
            />
          </div>

          <div className="flex flex-wrap gap-3 pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {submitting ? "Saving…" : "Create office"}
            </button>
            <Link
              to="/back-office/org"
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
